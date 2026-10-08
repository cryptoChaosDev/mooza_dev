import { Prisma } from '@prisma/client';
import { prisma } from '../index';

// Общие проверки/операции сделок: используются в routes/deals.ts, routes/orders.ts
// (сделка из отклика) и в планировщике.

// Срок приёмки работы по умолчанию (ТЗ: «если не заполнен — система установит 3 дня»).
export const ACCEPT_DAYS_DEFAULT = 3;
export const MAX_REVISIONS = 20;

export type AgeStatus = 'ok' | 'minor' | 'unknown';

/** Возраст пользователя для финансовых операций (18+). birthDate=null → 'unknown'. */
export async function dealAgeStatus(userId: string): Promise<AgeStatus> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
  if (!u?.birthDate) return 'unknown';
  const b = u.birthDate;
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < b.getUTCMonth()
    || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 18 ? 'ok' : 'minor';
}

/**
 * Проверка 18+ обеих сторон сделки. Возвращает null, если всё ок, иначе
 * { status, body } для ответа клиенту.
 */
export async function checkDealParticipantsAge(customerId: string, executorId: string):
  Promise<{ status: number; body: Record<string, string> } | null> {
  const [c, e] = await Promise.all([dealAgeStatus(customerId), dealAgeStatus(executorId)]);
  if (c === 'minor') {
    return { status: 403, body: { error: 'AGE_RESTRICTED', message: 'Для участия в сделках необходимо быть старше 18 лет' } };
  }
  if (c === 'unknown') {
    return { status: 403, body: { error: 'AGE_UNKNOWN', message: 'Укажите дату рождения в профиле — сделки доступны только с 18 лет' } };
  }
  if (e !== 'ok') {
    return { status: 409, body: { error: 'EXECUTOR_AGE_RESTRICTED', message: 'Исполнитель не может участвовать в сделках (18+ или не указана дата рождения)' } };
  }
  return null;
}

/**
 * После завершения сделки заказчик и исполнитель связываются. Не плодим дубли:
 * если уже есть ACCEPTED/BREAK_REQUESTED-связь — ничего не делаем; висящую
 * PENDING-заявку между ними переводим в ACCEPTED (условно по статусу); иначе
 * создаём новую ACCEPTED-связь.
 */
export async function ensureDealConnection(customerId: string, executorId: string, serviceId?: string | null) {
  const pairOr = [
    { requesterId: customerId, receiverId: executorId },
    { requesterId: executorId, receiverId: customerId },
  ];
  const active = await prisma.connection.findFirst({
    where: { status: { in: ['ACCEPTED', 'BREAK_REQUESTED'] }, OR: pairOr },
    select: { id: true },
  });
  if (active) return;
  const pending = await prisma.connection.findFirst({
    where: { status: 'PENDING', OR: pairOr },
    select: { id: true },
  });
  if (pending) {
    const upd = await prisma.connection.updateMany({
      where: { id: pending.id, status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });
    if (upd.count === 1) return;
  }
  await prisma.connection.create({
    data: {
      requesterId: customerId, receiverId: executorId,
      status: 'ACCEPTED',
      requesterRole: 'CUSTOMER', receiverRole: 'EXECUTOR',
      services: serviceId ? { create: [{ serviceId }] } : undefined,
    },
  });
}

/**
 * Выполнить fn под транзакционной advisory-блокировкой Postgres по ключу —
 * сериализует конкурирующие запросы (двойной клик, гонка вкладок) без
 * изменения схемы. Блокировка снимается по завершении транзакции.
 */
export async function withAdvisoryLock<T>(key: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    return fn(tx);
  });
}
