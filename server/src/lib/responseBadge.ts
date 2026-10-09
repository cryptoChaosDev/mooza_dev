/**
 * «Отвечает быстро» — бейдж скорости ответа в личных сообщениях.
 *
 * Считается по ЧУЖОЙ переписке, поэтому наружу (в том числе гостю) уходит только
 * категория `responseBadge` ('fast' | 'day' | null); минуты (avgResponseMinutes)
 * гостю не отдаются никогда (GUEST_FORBIDDEN_KEYS).
 *
 * Методика:
 *   - «диалог» — личный диалог (не групповой, ровно 2 участника), первое
 *     сообщение которого написал собеседник за последние 90 дней;
 *   - время ответа — от этого первого входящего сообщения до ПЕРВОГО ответа
 *     пользователя в том же диалоге;
 *   - без ответа дольше суток — диалог считается неотвеченным (∞ в медиане);
 *     свежие (< суток) неотвеченные пока не учитываются;
 *   - медиана по диалогам; меньше 5 диалогов — данных мало, бейджа нет;
 *   - 'fast' — медиана ≤ 60 мин, 'day' — ≤ 24 ч, иначе null.
 *
 * Результат кэшируется в User (responseBadge, responseMedianMinutes,
 * responseBadgeAt) пересчётом раз в сутки — recomputeResponseBadges()
 * (таймер — в routes/users.ts; функция идемпотентна, её же может вызвать
 * scheduler). Протухший кэш (> 7 дней, напр. пересчёт сломался) — бейджа нет.
 */

import { prisma } from '../index';

export type ResponseBadge = 'fast' | 'day';

export const RESPONSE_WINDOW_DAYS = 90;
export const RESPONSE_MIN_DIALOGS = 5;
export const RESPONSE_FAST_MINUTES = 60;
export const RESPONSE_DAY_MINUTES = 24 * 60;
/** Неотвеченный диалог моложе суток ещё «в ожидании» — в статистику не идёт. */
export const RESPONSE_PENDING_GRACE_MS = 24 * 60 * 60 * 1000;
/** Кэш старше недели не показываем: пересчёт раз в сутки, значит он сломан. */
export const RESPONSE_BADGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DialogFirstReply {
  responderId: string;
  incomingAt: Date;
  repliedAt: Date | null;
}

export interface ResponseStats {
  dialogs: number;
  medianMinutes: number | null;
  badge: ResponseBadge | null;
}

/** Медиана (для чётного числа — среднее двух центральных; ∞ допускается). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  // (x + ∞) / 2 = ∞ — неотвеченный в центре делает медиану бесконечной
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Категория по медиане (минуты) и числу диалогов. */
export function badgeFor(medianMinutes: number | null, dialogs: number): ResponseBadge | null {
  if (dialogs < RESPONSE_MIN_DIALOGS || medianMinutes == null || !Number.isFinite(medianMinutes)) return null;
  if (medianMinutes <= RESPONSE_FAST_MINUTES) return 'fast';
  if (medianMinutes <= RESPONSE_DAY_MINUTES) return 'day';
  return null;
}

/** Статистика одного пользователя по его диалогам (первые ответы). */
export function computeResponseStats(
  dialogs: Array<{ incomingAt: Date | string; repliedAt: Date | string | null }>,
  now: Date = new Date(),
): ResponseStats {
  const since = now.getTime() - RESPONSE_WINDOW_DAYS * DAY_MS;
  const minutes: number[] = [];
  for (const d of dialogs) {
    const inAt = new Date(d.incomingAt).getTime();
    if (!Number.isFinite(inAt) || inAt < since || inAt > now.getTime()) continue;
    const repAt = d.repliedAt ? new Date(d.repliedAt).getTime() : NaN;
    if (Number.isFinite(repAt) && repAt >= inAt) {
      minutes.push((repAt - inAt) / 60000);
    } else if (now.getTime() - inAt >= RESPONSE_PENDING_GRACE_MS) {
      minutes.push(Infinity); // не ответил больше суток
    }
    // свежий неотвеченный — ещё не учитываем
  }
  const med = median(minutes);
  const finiteMedian = med != null && Number.isFinite(med) ? Math.max(0, Math.round(med)) : null;
  return {
    dialogs: minutes.length,
    // меньше минимума диалогов — минут не храним (данных мало, как и для бейджа)
    medianMinutes: minutes.length >= RESPONSE_MIN_DIALOGS ? finiteMedian : null,
    badge: badgeFor(med, minutes.length),
  };
}

/**
 * Показываемые значения из кэша User: бейдж и медиана только из свежего
 * пересчёта (responseBadgeAt не старше недели) и только допустимых значений.
 */
export function effectiveResponse(
  u: { responseBadge?: string | null; responseBadgeAt?: Date | string | null; responseMedianMinutes?: number | null } | null | undefined,
  now: Date = new Date(),
): { badge: ResponseBadge | null; medianMinutes: number | null } {
  if (!u || !u.responseBadgeAt) return { badge: null, medianMinutes: null };
  const at = new Date(u.responseBadgeAt).getTime();
  if (!Number.isFinite(at) || now.getTime() - at > RESPONSE_BADGE_MAX_AGE_MS) return { badge: null, medianMinutes: null };
  const badge = u.responseBadge === 'fast' || u.responseBadge === 'day' ? u.responseBadge : null;
  const m = u.responseMedianMinutes;
  return { badge, medianMinutes: typeof m === 'number' && Number.isFinite(m) && m >= 0 ? m : null };
}

export function effectiveResponseBadge(
  u: { responseBadge?: string | null; responseBadgeAt?: Date | string | null } | null | undefined,
  now: Date = new Date(),
): ResponseBadge | null {
  return effectiveResponse(u, now).badge;
}

/**
 * Первые ответы на входящие первые сообщения во всех личных диалогах за окно —
 * ОДИН запрос. Диалоги отбираются по Conversation.updatedAt (индекс; растёт с
 * каждым сообщением, поэтому диалог с первым сообщением в окне всегда попадает).
 */
export async function fetchDmFirstReplies(since: Date): Promise<DialogFirstReply[]> {
  const sinceIso = since.toISOString();
  const rows = await prisma.$queryRaw<Array<{ responderId: string; incomingAt: Date; repliedAt: Date | null }>>`
    WITH recent AS (
      SELECT c."id"
      FROM "Conversation" c
      WHERE c."isGroup" = false
        AND c."updatedAt" >= (${sinceIso}::timestamptz AT TIME ZONE 'UTC')
        AND (SELECT COUNT(*) FROM "ConversationMember" cm2 WHERE cm2."conversationId" = c."id") = 2
    ),
    firsts AS (
      SELECT DISTINCT ON (m."conversationId") m."conversationId", m."senderId", m."createdAt"
      FROM "Message" m
      JOIN recent r ON r."id" = m."conversationId"
      ORDER BY m."conversationId", m."createdAt" ASC, m."id" ASC
    )
    SELECT cm."userId" AS "responderId",
           f."createdAt" AS "incomingAt",
           (SELECT MIN(x."createdAt") FROM "Message" x
             WHERE x."conversationId" = f."conversationId"
               AND x."senderId" = cm."userId"
               AND x."createdAt" >= f."createdAt") AS "repliedAt"
    FROM firsts f
    JOIN "ConversationMember" cm
      ON cm."conversationId" = f."conversationId" AND cm."userId" <> f."senderId"
    WHERE f."createdAt" >= (${sinceIso}::timestamptz AT TIME ZONE 'UTC')
  `;
  return (rows ?? []).map((r) => ({
    responderId: String(r.responderId),
    incomingAt: new Date(r.incomingAt),
    repliedAt: r.repliedAt ? new Date(r.repliedAt) : null,
  }));
}

const ID_CHUNK = 1000;

function chunks<T>(arr: T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

let recomputeRunning: Promise<{ users: number; changed: number; cleared: number }> | null = null;

/**
 * Пересчитать бейджи всех пользователей (раз в сутки). Пишет только изменения:
 * значения — точечными update, «свежесть» (responseBadgeAt) — updateMany пачками.
 * Параллельный повторный вызов возвращает тот же прогон. Не бросает исключений.
 */
export function recomputeResponseBadges(now: Date = new Date()): Promise<{ users: number; changed: number; cleared: number }> {
  if (recomputeRunning) return recomputeRunning;
  recomputeRunning = (async () => {
    try {
      const since = new Date(now.getTime() - RESPONSE_WINDOW_DAYS * DAY_MS);
      const rows = await fetchDmFirstReplies(since);
      const byUser = new Map<string, DialogFirstReply[]>();
      for (const r of rows) {
        if (!byUser.has(r.responderId)) byUser.set(r.responderId, []);
        byUser.get(r.responderId)!.push(r);
      }
      const qualified = new Map<string, ResponseStats>();
      for (const [userId, list] of byUser) {
        const st = computeResponseStats(list, now);
        if (st.medianMinutes != null || st.badge != null) qualified.set(userId, st);
      }

      // Текущие держатели значений (чтобы снять устаревшие и писать только разницу).
      const holders = await prisma.user.findMany({
        where: { OR: [{ responseBadge: { not: null } }, { responseMedianMinutes: { not: null } }] },
        select: { id: true, responseBadge: true, responseMedianMinutes: true },
      });
      const current = new Map(holders.map((h) => [h.id, h]));

      let changed = 0;
      for (const [userId, st] of qualified) {
        const cur = current.get(userId);
        if (cur && cur.responseBadge === st.badge && cur.responseMedianMinutes === st.medianMinutes) continue;
        try {
          await prisma.user.update({
            where: { id: userId },
            data: { responseBadge: st.badge, responseMedianMinutes: st.medianMinutes, responseBadgeAt: now },
          });
          changed++;
        } catch {
          // пользователь удалён между запросами — пропускаем
        }
      }
      for (const ids of chunks([...qualified.keys()])) {
        await prisma.user.updateMany({ where: { id: { in: ids } }, data: { responseBadgeAt: now } });
      }
      const toClear = holders.map((h) => h.id).filter((id) => !qualified.has(id));
      for (const ids of chunks(toClear)) {
        await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: { responseBadge: null, responseMedianMinutes: null, responseBadgeAt: now },
        });
      }
      return { users: qualified.size, changed, cleared: toClear.length };
    } catch (err) {
      console.error('[responseBadge] recompute failed:', err);
      return { users: 0, changed: 0, cleared: 0 };
    } finally {
      recomputeRunning = null;
    }
  })();
  return recomputeRunning;
}
