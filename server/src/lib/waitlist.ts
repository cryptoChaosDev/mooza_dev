/**
 * «Лист ожидания» (закрытая регистрация): письмо «Заявка принята», приглашения
 * из админки и отметка «Зарегистрировался».
 *
 *  • Статус заявки: new → invited (админ отправил ссылку) → registered.
 *  • Приглашение — одноразовая ReferralLink с source='waitlist': владелец — админ,
 *    который пригласил, label «Лист ожидания: <email>», создаётся сразу скрытой
 *    (hiddenAt) — не видна в «Моих ссылках» и не занимает лимит, но код работает.
 *    Такие ссылки НЕ засчитываются в реферальный Pro (utils/pro.ts countProReferrals).
 *  • Письма транзакционные (ответ на заявку), не реклама: от consentMarketing не зависят.
 *  • Повторное письмо (подтверждение / приглашение) — не чаще раза в 24 ч.
 *  • ПДн: email в логи и мониторинговый чат не пишем — только id заявки.
 */
import crypto from 'crypto';
import type { WaitlistEntry } from '@prisma/client';
import { prisma } from '../index';
import { sendWaitlistConfirmation, sendWaitlistInvite } from '../utils/mailer';
import logger from '../utils/logger';

export const WAITLIST_LINK_SOURCE = 'waitlist';
export const WAITLIST_STATUSES = ['new', 'invited', 'registered'] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];
export const WAITLIST_TYPES = ['resident_waitlist', 'listener', 'customer', 'company'] as const;

/** Повторное письмо (подтверждение заявки / приглашение) — не чаще раза в 24 ч. */
export const WAITLIST_RESEND_MS = 24 * 60 * 60 * 1000;
/** Максимум заявок в одном массовом приглашении. */
export const WAITLIST_BULK_MAX = 50;

export const INVITES_DISABLED_ERROR =
  'Включите регистрацию по приглашениям в настройках сайта, иначе ссылка не сработает';

const normEmail = (v: unknown) => String(v ?? '').trim().toLowerCase();

function appUrl(): string {
  return (process.env.APP_URL || 'https://moooza.ru').replace(/\/+$/, '');
}

/** Ссылка из письма-приглашения: регистрация по коду + префилл email. */
export function waitlistInviteUrl(code: string, email: string): string {
  return `${appUrl()}/register?ref=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`;
}

/**
 * Сработает ли ссылка-приглашение. Открытая регистрация (registrationEnabled ≠ 'false')
 * пускает всех; закрытая — только в режиме «по реф-ссылкам» (как registrationAllowed в auth.ts).
 */
export async function waitlistInvitesWork(): Promise<boolean> {
  const [reg, refReg] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key: 'registrationEnabled' } }),
    prisma.siteSetting.findUnique({ where: { key: 'referralRegistrationEnabled' } }),
  ]);
  return reg?.value !== 'false' || refReg?.value === 'true';
}

// ─── Письмо «Заявка принята» ─────────────────────────────────────────────────

/**
 * Отправить подтверждение заявки, если его ещё не было или прошло 24 ч.
 * Окно занимается атомарно (условный updateMany), письмо уходит фоном —
 * ответ формы не ждёт SMTP. Не ушло — отметка снимается, повторная отправка
 * формы попробует снова. Возвращает true, если письмо поставлено в отправку.
 */
export async function sendWaitlistConfirmationOnce(entry: Pick<WaitlistEntry, 'id' | 'email' | 'type'>): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - WAITLIST_RESEND_MS);
  const claimed = await prisma.waitlistEntry.updateMany({
    where: { id: entry.id, OR: [{ confirmationSentAt: null }, { confirmationSentAt: { lt: cutoff } }] },
    data: { confirmationSentAt: now },
  });
  if (claimed.count === 0) return false;

  sendWaitlistConfirmation(entry.email, entry.type).catch(async (err: any) => {
    logger.warn(`[waitlist] confirmation mail failed (entry ${entry.id}): ${err?.message}`);
    await prisma.waitlistEntry
      .updateMany({ where: { id: entry.id, confirmationSentAt: now }, data: { confirmationSentAt: null } })
      .catch(() => {});
  });
  return true;
}

// ─── Отметка «Зарегистрировался» ─────────────────────────────────────────────

/**
 * Вызывается после создания аккаунта (auth.ts verify-email). Never throws.
 *  • referralLinkId — одноразовая ссылка, сожжённая этой регистрацией: если это
 *    приглашение из листа (в WaitlistEntry.referralLinkId бывают только ссылки
 *    source='waitlist'), заявка → registered;
 *  • email — человек из листа мог прийти другим путём (чужая реф-ссылка,
 *    открытая регистрация): заявка с тем же email → registered.
 * Возвращает число отмеченных заявок.
 */
export async function markWaitlistRegistered(opts: {
  userId: string;
  email?: string | null;
  referralLinkId?: string | null;
}): Promise<number> {
  try {
    const data = { status: 'registered', registeredUserId: opts.userId, registeredAt: new Date() };
    let marked = 0;
    if (opts.referralLinkId) {
      const r = await prisma.waitlistEntry.updateMany({
        where: { referralLinkId: opts.referralLinkId, status: { not: 'registered' } },
        data,
      });
      marked += r?.count ?? 0;
    }
    const email = normEmail(opts.email);
    if (email) {
      const r = await prisma.waitlistEntry.updateMany({ where: { email, status: { not: 'registered' } }, data });
      marked += r?.count ?? 0;
    }
    return marked;
  } catch (err: any) {
    logger.warn(`[waitlist] markWaitlistRegistered failed (user ${opts.userId}): ${err?.message}`);
    return 0;
  }
}

/**
 * Досверка по email для админки: заявки, чей email уже есть у пользователя
 * (зарегистрировался до этой фичи, через VK/другой путь), → registered.
 * Не чаще раза в 30 с (вызывается при открытии вкладки — список и счётчики).
 */
const SYNC_THROTTLE_MS = 30 * 1000;
let lastSyncAt = 0;
export async function syncWaitlistRegisteredByEmail(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastSyncAt < SYNC_THROTTLE_MS) return 0;
  lastSyncAt = now;
  try {
    return await prisma.$executeRaw`
      UPDATE "WaitlistEntry" AS w
         SET "status" = 'registered',
             "registeredUserId" = u."id",
             "registeredAt" = COALESCE(w."registeredAt", u."createdAt"),
             "updatedAt" = NOW()
        FROM "User" AS u
       WHERE w."status" <> 'registered'
         AND u."email" IS NOT NULL
         AND lower(u."email") = w."email"`;
  } catch (err: any) {
    logger.warn(`[waitlist] sync by email failed: ${err?.message}`);
    return 0;
  }
}

// ─── Приглашение ─────────────────────────────────────────────────────────────

function genCode(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

/** Неиспользованная ссылка-приглашение заявки — или новая (source='waitlist', скрытая). */
async function ensureInviteLink(entry: WaitlistEntry, adminId: string): Promise<{ id: string; code: string }> {
  if (entry.referralLinkId) {
    const link = await prisma.referralLink.findUnique({
      where: { id: entry.referralLinkId },
      select: { id: true, code: true, usedById: true, multiUse: true },
    });
    if (link && !link.usedById && !link.multiUse) return { id: link.id, code: link.code };
  }
  let code = genCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.referralLink.findUnique({ where: { code }, select: { id: true } });
    if (!clash) break;
    code = genCode();
  }
  return prisma.referralLink.create({
    data: {
      code,
      label: `Лист ожидания: ${entry.email}`,
      ownerId: adminId,
      source: WAITLIST_LINK_SOURCE,
      // Не показывать в «Моих ссылках» админа и не занимать его лимит; код работает.
      hiddenAt: new Date(),
    },
    select: { id: true, code: true },
  });
}

export type InviteSkipReason = 'not_found' | 'already_registered' | 'too_soon' | 'mail_failed' | 'error';

export type InviteResult =
  | { ok: true; entry: WaitlistEntry; inviteUrl: string }
  | { ok: false; reason: InviteSkipReason; status: number; error: string };

const fmtMsk = (d: Date) =>
  d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function tooSoon(invitedAt: Date): InviteResult {
  const left = Math.max(1, Math.ceil((invitedAt.getTime() + WAITLIST_RESEND_MS - Date.now()) / 3_600_000));
  return {
    ok: false,
    reason: 'too_soon',
    status: 429,
    error: `Приглашение уже отправлено ${fmtMsk(invitedAt)} МСК — повторить можно через ${left} ч`,
  };
}

/**
 * Пригласить одну заявку: ссылка (переиспользуется, пока не сожжена) + письмо +
 * статус invited. Проверку «регистрация по приглашениям включена» делает вызывающий
 * (один раз на запрос). Окно 24 ч занимается атомарно; письмо не ушло — статус
 * и даты откатываются (ссылка остаётся и переиспользуется при следующей попытке).
 */
export async function inviteWaitlistEntry(id: string, adminId: string): Promise<InviteResult> {
  const entry = await prisma.waitlistEntry.findUnique({ where: { id } });
  if (!entry) return { ok: false, reason: 'not_found', status: 404, error: 'Заявка не найдена' };
  if (entry.status === 'registered') {
    return { ok: false, reason: 'already_registered', status: 409, error: 'Уже зарегистрировался' };
  }

  // Аккаунт с этим email уже есть (пришёл другим путём) — не шлём, а отмечаем.
  const user = await prisma.user.findUnique({ where: { email: entry.email }, select: { id: true } });
  if (user) {
    await markWaitlistRegistered({ userId: user.id, email: entry.email });
    return { ok: false, reason: 'already_registered', status: 409, error: 'У этого email уже есть аккаунт — заявка отмечена «Зарегистрировался»' };
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - WAITLIST_RESEND_MS);
  if (entry.invitedAt && entry.invitedAt.getTime() > cutoff.getTime()) return tooSoon(entry.invitedAt);

  // Занять окно атомарно: двойной клик / второй админ не отправит второе письмо.
  const claimed = await prisma.waitlistEntry.updateMany({
    where: { id, status: { not: 'registered' }, OR: [{ invitedAt: null }, { invitedAt: { lt: cutoff } }] },
    data: { status: 'invited', invitedAt: now, invitedById: adminId, invitesSent: { increment: 1 } },
  });
  if (claimed.count === 0) return tooSoon(now);

  const restore = () => prisma.waitlistEntry
    .updateMany({
      where: { id, invitedAt: now },
      data: { status: entry.status, invitedAt: entry.invitedAt, invitedById: entry.invitedById, invitesSent: entry.invitesSent },
    })
    .catch(() => {});

  let link: { id: string; code: string };
  try {
    link = await ensureInviteLink(entry, adminId);
    if (link.id !== entry.referralLinkId) {
      await prisma.waitlistEntry.update({ where: { id }, data: { referralLinkId: link.id } });
    }
  } catch (err) {
    await restore();
    throw err;
  }

  const inviteUrl = waitlistInviteUrl(link.code, entry.email);
  try {
    await sendWaitlistInvite(entry.email, inviteUrl);
  } catch (err: any) {
    logger.warn(`[waitlist] invite mail failed (entry ${id}): ${err?.message}`);
    await restore();
    return { ok: false, reason: 'mail_failed', status: 502, error: 'Письмо не отправилось (почтовый сервер недоступен). Попробуйте позже.' };
  }

  logger.info(`[waitlist] invited entry ${id} by admin ${adminId} (invite #${entry.invitesSent + 1})`);
  const updated = await prisma.waitlistEntry.findUnique({ where: { id } });
  return {
    ok: true,
    entry: updated ?? { ...entry, status: 'invited', invitedAt: now, invitedById: adminId, invitesSent: entry.invitesSent + 1, referralLinkId: link.id },
    inviteUrl,
  };
}

/**
 * Временное авто-приглашение (SiteSetting waitlistAutoInvite='true'): новая заявка
 * сразу получает ссылку-приглашение от имени аккаунта команды (team@moooza.ru;
 * если его нет — старейший админ). Возвращает inviteUrl или null, если авто-режим
 * выключен / регистрация по приглашениям не работает / письмо не ушло — тогда
 * вызывающий шлёт обычное «Заявка принята».
 */
export async function maybeAutoInviteWaitlistEntry(entry: Pick<WaitlistEntry, 'id' | 'status'>): Promise<string | null> {
  if (entry.status !== 'new') return null;
  const flag = await prisma.siteSetting.findUnique({ where: { key: 'waitlistAutoInvite' } });
  if (flag?.value !== 'true') return null;
  if (!(await waitlistInvitesWork())) return null;
  const owner =
    (await prisma.user.findFirst({ where: { email: 'team@moooza.ru' }, select: { id: true } })) ??
    (await prisma.user.findFirst({ where: { isAdmin: true }, orderBy: { createdAt: 'asc' }, select: { id: true } }));
  if (!owner) return null;
  const res = await inviteWaitlistEntry(entry.id, owner.id);
  if (!res.ok) {
    logger.warn(`[waitlist] auto-invite skipped for entry ${entry.id}: ${res.reason}`);
    return null;
  }
  return res.inviteUrl;
}

// Пауза между письмами массовой рассылки — не упираться в лимиты SMTP.
const BULK_PAUSE_MS = Math.max(0, Number(process.env.WAITLIST_BULK_PAUSE_MS ?? 300) || 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Пригласить до WAITLIST_BULK_MAX заявок по очереди. Ошибка одной не останавливает остальные. */
export async function inviteWaitlistBulk(ids: string[], adminId: string): Promise<{
  invited: number;
  skipped: Array<{ id: string; reason: InviteSkipReason; error: string }>;
}> {
  let invited = 0;
  const skipped: Array<{ id: string; reason: InviteSkipReason; error: string }> = [];
  for (const id of ids) {
    try {
      const r = await inviteWaitlistEntry(id, adminId);
      if (r.ok) {
        invited++;
        if (BULK_PAUSE_MS > 0) await sleep(BULK_PAUSE_MS);
      } else {
        skipped.push({ id, reason: r.reason, error: r.error });
      }
    } catch (err: any) {
      logger.error(`[waitlist] bulk invite failed (entry ${id}): ${err?.message}`);
      skipped.push({ id, reason: 'error', error: 'Внутренняя ошибка' });
    }
  }
  return { invited, skipped };
}

// ─── Админка: список, счётчики, удаление ─────────────────────────────────────

/**
 * Поля для таблицы админки: рабочая ссылка-приглашение (если не сожжена) — для
 * «Скопировать ссылку», и аккаунт зарегистрировавшегося — для ссылки на профиль.
 */
export async function withWaitlistDetails(items: WaitlistEntry[]) {
  const linkIds = [...new Set(items.map((i) => i.referralLinkId).filter((v): v is string => !!v))];
  const userIds = [...new Set(items.map((i) => i.registeredUserId).filter((v): v is string => !!v))];
  const [links, users] = await Promise.all([
    linkIds.length
      ? prisma.referralLink.findMany({ where: { id: { in: linkIds } }, select: { id: true, code: true, usedById: true } })
      : Promise.resolve([] as Array<{ id: string; code: string; usedById: string | null }>),
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, nickname: true } })
      : Promise.resolve([] as Array<{ id: string; firstName: string; lastName: string; nickname: string | null }>),
  ]);
  const linkById = new Map(links.map((l) => [l.id, l]));
  const userById = new Map(users.map((u) => [u.id, u]));
  return items.map((i) => {
    const link = i.referralLinkId ? linkById.get(i.referralLinkId) : undefined;
    return {
      ...i,
      inviteUrl: link && !link.usedById ? waitlistInviteUrl(link.code, i.email) : null,
      registeredUser: i.registeredUserId ? userById.get(i.registeredUserId) ?? null : null,
    };
  });
}

/** Счётчики вкладки: всего, по статусам и типам, конверсия приглашённых в регистрации. */
export async function waitlistStats() {
  const [statusRows, typeRows, invitedTotal, registeredFromInvite, invitesEnabled] = await Promise.all([
    prisma.waitlistEntry.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.waitlistEntry.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.waitlistEntry.count({ where: { invitesSent: { gt: 0 } } }),
    prisma.waitlistEntry.count({ where: { status: 'registered', invitesSent: { gt: 0 } } }),
    waitlistInvitesWork(),
  ]);
  const byStatus: Record<WaitlistStatus, number> = { new: 0, invited: 0, registered: 0 };
  let total = 0;
  for (const r of statusRows) {
    total += r._count._all;
    if ((WAITLIST_STATUSES as readonly string[]).includes(r.status)) byStatus[r.status as WaitlistStatus] += r._count._all;
  }
  const byType: Record<string, number> = Object.fromEntries(WAITLIST_TYPES.map((t) => [t, 0]));
  for (const r of typeRows) byType[r.type] = (byType[r.type] ?? 0) + r._count._all;
  return {
    total,
    byStatus,
    byType,
    // Из тех, кому хоть раз отправили приглашение, — доля зарегистрировавшихся (0..1).
    invitedTotal,
    conversion: invitedTotal > 0 ? Math.round((registeredFromInvite / invitedTotal) * 1000) / 1000 : 0,
    invitesEnabled,
  };
}

/**
 * Удалить заявку по просьбе человека (152-ФЗ). Email есть и в label ссылки-приглашения:
 * несожжённую ссылку удаляем (она была только для него), сожжённую — обезличиваем.
 */
export async function deleteWaitlistEntry(id: string): Promise<boolean> {
  const entry = await prisma.waitlistEntry.findUnique({ where: { id }, select: { id: true, referralLinkId: true } });
  if (!entry) return false;
  if (entry.referralLinkId) {
    await prisma.referralLink.deleteMany({
      where: { id: entry.referralLinkId, source: WAITLIST_LINK_SOURCE, usedById: null },
    });
    await prisma.referralLink.updateMany({
      where: { id: entry.referralLinkId, source: WAITLIST_LINK_SOURCE },
      data: { label: 'Лист ожидания (заявка удалена)' },
    });
  }
  await prisma.waitlistEntry.delete({ where: { id } });
  return true;
}
