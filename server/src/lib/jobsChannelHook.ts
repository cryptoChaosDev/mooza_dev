/**
 * Prisma-middleware автопостинга в Telegram-канал (lib/jobsChannel).
 *
 * Почему middleware, а не вызовы в роутерах: заказы и вакансии создаются и
 * меняются из многих мест (routes/orders.ts, vacancies.ts, планировщик-автоархив,
 * новые пути вроде «умного запроса»), и роутеры правят параллельно. Hook ловит
 * любую запись:
 *   - Order / Vacancy: create, update, upsert, updateMany, delete, deleteMany;
 *   - Post заказа/вакансии: create (заказ становится публичным только с постом,
 *     а пост создаётся ПОСЛЕ заказа), delete/deleteMany (снятие в черновик);
 *   - Artist: смена status (REJECTED скрывает вакансии от гостя);
 *   - User: блокировка/разблокировка (заказы заблокированного гостю не видны).
 *
 * Сам hook ничего не отправляет: ставит scheduleJobSync (отложенно, после
 * коммита, сущность перечитывается из БД), запрос не ждёт Telegram и не падает
 * при его ошибках. Без TELEGRAM_JOBS_CHANNEL_ID/TELEGRAM_BOT_TOKEN — мгновенный
 * пропуск без единого лишнего запроса. Служебные записи самого модуля (только
 * поля telegram*) событий не порождают.
 *
 * Для updateMany/delete* нужны данные ДО записи (какие строки затронуты, снимок
 * текста удаляемого поста) — их читает before(). Внутри транзакции предварительных
 * чтений нет (beforeInTx: только id из where), а синхронизация повторяется позже,
 * если к первой попытке коммит ещё не случился.
 * Не ловятся каскадные удаления БД (удалили пользователя/артиста) — пост в канале
 * в этом случае остаётся как есть.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../index';
import logger from '../utils/logger';
import {
  JobKind, isJobsChannelConfigured, scheduleJobSync, scheduleClosePost, loadJob, loadPostedJobs,
} from './jobsChannel';

const MODEL_KIND: Record<string, JobKind> = { Order: 'order', Vacancy: 'vacancy' };
/** Предел выборки «затронутых» строк для updateMany/deleteMany. */
const MAX_AFFECTED = 200;
/** Поля, от которых зависит «открыт ли» заказ/вакансия. */
const STATE_FIELDS = ['status', 'executorId', 'executor', 'authorId', 'author', 'artistId', 'artist'];
const USER_BLOCK_FIELDS = ['isBlocked', 'blockedUntil'];

function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Запись только служебных полей telegram* (сам модуль) — не событие. */
function onlyTelegramFields(data: unknown): boolean {
  if (!isObj(data)) return false;
  const keys = Object.keys(data);
  return keys.length > 0 && keys.every((k) => k.startsWith('telegram') || k === 'updatedAt');
}

function touches(data: unknown, fields: string[]): boolean {
  return isObj(data) && fields.some((f) => data[f] !== undefined);
}

function setsActive(data: unknown): boolean {
  if (!isObj(data)) return false;
  const s = data.status;
  return s === 'active' || (isObj(s) && s.set === 'active');
}

function delegateFor(model: string): any {
  switch (model) {
    case 'Order': return prisma.order;
    case 'Vacancy': return prisma.vacancy;
    case 'Post': return prisma.post;
    case 'User': return prisma.user;
    default: return null;
  }
}

type Before =
  | { type: 'activation'; prev: Map<string, string> }      // id → прежний status
  | { type: 'ids'; ids: string[]; prev?: Map<string, string> }
  | { type: 'snapshots'; rows: any[] }
  | { type: 'posts'; refs: Array<{ kind: JobKind; id: string }> }
  | null;

async function before(params: Prisma.MiddlewareParams): Promise<Before> {
  const { model, action } = params;
  const args: any = params.args ?? {};
  const kind = model ? MODEL_KIND[model] : undefined;

  if (kind) {
    if (action === 'update' || action === 'upsert') {
      const data = action === 'upsert' ? args.update : args.data;
      if (!setsActive(data) || !isObj(args.where)) return null;
      const row = await delegateFor(model!).findUnique({ where: args.where, select: { id: true, status: true } });
      return row ? { type: 'activation', prev: new Map([[row.id, row.status]]) } : null;
    }
    if (action === 'updateMany') {
      if (onlyTelegramFields(args.data) || !touches(args.data, STATE_FIELDS)) return null;
      const rows = await delegateFor(model!).findMany({
        where: args.where ?? {}, select: { id: true, status: true }, take: MAX_AFFECTED,
      });
      return { type: 'ids', ids: rows.map((r: any) => r.id), prev: new Map(rows.map((r: any) => [r.id, r.status])) };
    }
    if (action === 'delete') {
      const id = isObj(args.where) && typeof args.where.id === 'string' ? args.where.id : null;
      if (!id) return null;
      const row = await loadJob(kind, id);
      return row && row.telegramMessageId != null && !row.telegramClosedAt ? { type: 'snapshots', rows: [row] } : null;
    }
    if (action === 'deleteMany') {
      return { type: 'snapshots', rows: await loadPostedJobs(kind, args.where, MAX_AFFECTED) };
    }
    return null;
  }

  if (model === 'Post' && (action === 'delete' || action === 'deleteMany')) {
    const select = { type: true, orderId: true, vacancyId: true };
    let posts: any[] = [];
    if (action === 'delete') {
      if (!isObj(args.where)) return null;
      const p = await prisma.post.findUnique({ where: args.where, select });
      if (p) posts = [p];
    } else {
      posts = await prisma.post.findMany({
        where: { AND: [args.where ?? {}, { type: { in: ['order', 'vacancy'] } }] },
        select,
        take: MAX_AFFECTED,
      });
    }
    const refs = postRefs(posts);
    return refs.length ? { type: 'posts', refs } : null;
  }

  if (model === 'User' && action === 'updateMany' && touches(args.data, USER_BLOCK_FIELDS)) {
    const rows = await prisma.user.findMany({ where: args.where ?? {}, select: { id: true }, take: MAX_AFFECTED });
    return { type: 'ids', ids: rows.map((r: any) => r.id) };
  }

  return null;
}

/**
 * Внутри транзакции — без предварительных чтений (лишнее соединение из пула,
 * пока транзакция держит своё): только id из самого where. Удаление в
 * транзакции пост не закрывает (снимок не снят), подсказки активации нет.
 */
function beforeInTx(params: Prisma.MiddlewareParams): Before {
  const { model, action } = params;
  const where: any = (params.args as any)?.where;
  if (!isObj(where)) return null;
  if (model && MODEL_KIND[model] && action === 'updateMany' && typeof where.id === 'string') {
    if (onlyTelegramFields((params.args as any)?.data)) return null;
    return { type: 'ids', ids: [where.id] };
  }
  if (model === 'Post' && (action === 'delete' || action === 'deleteMany')) {
    const refs: Array<{ kind: JobKind; id: string }> = [];
    if (typeof where.orderId === 'string') refs.push({ kind: 'order', id: where.orderId });
    if (typeof where.vacancyId === 'string') refs.push({ kind: 'vacancy', id: where.vacancyId });
    return refs.length ? { type: 'posts', refs } : null;
  }
  return null;
}

function postRefs(posts: Array<{ type?: string | null; orderId?: string | null; vacancyId?: string | null } | null>): Array<{ kind: JobKind; id: string }> {
  const out: Array<{ kind: JobKind; id: string }> = [];
  for (const p of posts) {
    if (!p) continue;
    if (p.type === 'order' && p.orderId) out.push({ kind: 'order', id: p.orderId });
    if (p.type === 'vacancy' && p.vacancyId) out.push({ kind: 'vacancy', id: p.vacancyId });
  }
  return out;
}

/** Синхронизировать опубликованные заказы/вакансии, связанные с людьми/артистами. */
async function syncPostedWhere(kind: JobKind, where: Record<string, unknown>, inTx: boolean): Promise<void> {
  const d: any = kind === 'order' ? prisma.order : prisma.vacancy;
  const rows = await d.findMany({
    where: { AND: [where, { telegramMessageId: { not: null } }] },
    select: { id: true },
    take: MAX_AFFECTED,
  });
  for (const r of (rows ?? []) as any[]) scheduleJobSync(kind, r.id, { inTx });
}

async function after(params: Prisma.MiddlewareParams, result: any, pre: Before): Promise<void> {
  const { model, action } = params;
  const args: any = params.args ?? {};
  const inTx = !!params.runInTransaction;
  const kind = model ? MODEL_KIND[model] : undefined;

  if (kind) {
    if (action === 'create' || action === 'update' || action === 'upsert') {
      const data = action === 'upsert' ? args.update : args.data;
      if (action === 'update' && onlyTelegramFields(data)) return;
      const id = result?.id;
      if (!id) return;
      const prevStatus = pre?.type === 'activation' ? pre.prev.get(id) : undefined;
      const activated = prevStatus !== undefined && prevStatus !== 'active' && result.status === 'active';
      scheduleJobSync(kind, id, { inTx, ...(activated ? { activatedAt: new Date() } : {}) });
      return;
    }
    if (action === 'updateMany' && pre?.type === 'ids') {
      const activating = setsActive(args.data);
      for (const id of pre.ids) {
        const was = pre.prev?.get(id);
        scheduleJobSync(kind, id, { inTx, ...(activating && was !== 'active' ? { activatedAt: new Date() } : {}) });
      }
      return;
    }
    if ((action === 'delete' || action === 'deleteMany') && pre?.type === 'snapshots') {
      for (const row of pre.rows) scheduleClosePost(kind, row);
    }
    return;
  }

  if (model === 'Post') {
    if (action === 'create') {
      for (const ref of postRefs([result])) scheduleJobSync(ref.kind, ref.id, { inTx });
    } else if (pre?.type === 'posts') {
      for (const ref of pre.refs) scheduleJobSync(ref.kind, ref.id, { inTx });
    }
    return;
  }

  if (model === 'Artist' && (action === 'update' || action === 'upsert')) {
    const data = action === 'upsert' ? args.update : args.data;
    if (result?.id && touches(data, ['status'])) await syncPostedWhere('vacancy', { artistId: result.id }, inTx);
    return;
  }

  if (model === 'User') {
    if (action === 'update' && result?.id && touches(args.data, USER_BLOCK_FIELDS)) {
      await syncPostedWhere('order', { authorId: result.id }, inTx);
    } else if (action === 'updateMany' && pre?.type === 'ids' && pre.ids.length) {
      await syncPostedWhere('order', { authorId: { in: pre.ids } }, inTx);
    }
  }
}

const WATCHED_MODELS = new Set(['Order', 'Vacancy', 'Post', 'Artist', 'User']);
const WRITE_ACTIONS = new Set(['create', 'update', 'upsert', 'updateMany', 'delete', 'deleteMany']);

export const jobsChannelMiddleware: Prisma.Middleware = async (params, next) => {
  if (!params.model || !WATCHED_MODELS.has(params.model) || !WRITE_ACTIONS.has(params.action)) return next(params);
  if (!isJobsChannelConfigured()) return next(params);

  let pre: Before = null;
  try {
    pre = params.runInTransaction ? beforeInTx(params) : await before(params);
  } catch (err: any) {
    logger.warn(`[jobsChannel] hook pre ${params.model}.${params.action}: ${err?.message}`);
  }

  const result = await next(params);

  // После записи — не ждём (ответ клиенту не тормозим), ошибки только в лог.
  after(params, result, pre).catch((err: any) => {
    logger.warn(`[jobsChannel] hook post ${params.model}.${params.action}: ${err?.message}`);
  });
  return result;
};
