/**
 * Создание заказа (Order) с постом-анонсом в Потоке — общая логика.
 *
 * Повторяет поведение POST /api/orders (routes/orders.ts): заголовок ≤ 50
 * символов, статус active публикует пост типа 'order' (title + content =
 * описание), draft — без поста. Используется «Ищу музыканта» (routes/requests.ts).
 *
 * TODO(orders): routes/orders.ts стоит перевести на createOrderWithFeedPost /
 * syncOrderFeedPost (сейчас там своя копия syncOrderPost) — не трогали, чтобы не
 * пересекаться с параллельными правками orders.ts.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../index';

export type OrderDb = PrismaClient | Prisma.TransactionClient;

export const ORDER_TITLE_MAX_LENGTH = 50;

export interface OrderPostExtras {
  /** Город поста (из справочника City) — для фильтра Потока по городу. */
  city?: string | null;
  /** Жанры поста (названия). */
  genres?: string[];
}

/** Пост-анонс заказа в ленте: создать или обновить (как syncOrderPost в orders.ts). */
export async function syncOrderFeedPost(
  db: OrderDb,
  orderId: string,
  authorId: string,
  title: string,
  description: string | null,
  extras: OrderPostExtras = {},
): Promise<string> {
  const extra: { city?: string | null; genres?: string[] } = {};
  if (extras.city !== undefined) extra.city = extras.city;
  if (extras.genres !== undefined) extra.genres = extras.genres;
  const existing = await db.post.findFirst({ where: { orderId, type: 'order' } });
  if (existing) {
    await db.post.update({
      where: { id: existing.id },
      data: { title, content: description || '', ...extra },
    });
    return existing.id;
  }
  const post = await db.post.create({
    data: { type: 'order', authorId, orderId, title, content: description || '', ...extra },
  });
  return post.id;
}

export interface CreateOrderInput {
  authorId: string;
  serviceId: string;
  title: string;
  description?: string | null;
  budgetFrom?: number | null;
  budgetTo?: number | null;
  /** Срок — конец дня по МСК (lib/mskDate), null — «Срок не ограничен». */
  deadline?: Date | null;
  status?: 'active' | 'draft';
  customFilterValueIds?: string[];
  post?: OrderPostExtras;
}

/** Создаёт заказ; активный — сразу с постом в Потоке. */
export async function createOrderWithFeedPost(input: CreateOrderInput, db: OrderDb = prisma) {
  const status = input.status ?? 'active';
  const order = await db.order.create({
    data: {
      authorId: input.authorId,
      serviceId: input.serviceId,
      title: String(input.title).slice(0, ORDER_TITLE_MAX_LENGTH),
      budgetFrom: input.budgetFrom ?? null,
      budgetTo: input.budgetTo ?? null,
      deadline: input.deadline ?? null,
      description: input.description || null,
      status,
      ...(input.customFilterValueIds?.length
        ? { selectedCustomFilterValues: { connect: input.customFilterValueIds.map((id) => ({ id })) } }
        : {}),
    },
  });
  const postId = status === 'active'
    ? await syncOrderFeedPost(db, order.id, input.authorId, order.title, order.description, input.post)
    : null;
  return { order, postId };
}
