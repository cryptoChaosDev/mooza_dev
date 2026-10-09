/**
 * «Ищу музыканта» — подбор исполнителей под заказ и личные уведомления топ-10.
 *
 * Кандидаты: не заблокированы, не автор, есть АКТИВНАЯ услуга или профессия из
 * professionIds (обязательно). Согласие на публичность (publicConsentAt) НЕ
 * требуется — уведомление личное, его видит только сам исполнитель; в превью
 * для заказчика попадают только публичные профили.
 *
 * Исключаются: «Закрыт для предложений» (occupancyStatus closed/busy),
 * отключившие категорию «Заказы и услуги» в настройках уведомлений,
 * уже уведомлённые по этому заказу и получившие ≥ 5 таких уведомлений за сутки.
 *
 * Ранжирование (scoreCandidate — чистая функция): услуга > профессия в профиле,
 * жанр, город (или готовность к удалёнке), рейтинг/число отзывов, недавняя
 * активность (lastSeenAt за 30 дней), статус «Открыт», среднее время ответа.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { notify } from '../utils/notify';
import { notBlockedWhere, isPublicPerson, toPublicPerson } from './publicData';
import { normalize } from './requestParser';

export const MATCH_LIMIT = 10;
/** Не больше стольких уведомлений order_match одному исполнителю за сутки. */
export const DAILY_MATCH_NOTIFY_CAP = 5;
export const MATCH_NOTIFICATION_TYPE = 'order_match';
const POOL_SIZE = 300;
const RESPONSE_TIME_TOP = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const BUSY_STATUSES = ['closed', 'busy'];

export interface MatchCriteria {
  professionIds: string[];
  genreIds: string[];
  /** Названия жанров — для сопоставления с фильтром «Жанр» услуг и старым User.genres. */
  genreNames: string[];
  cityName: string | null;
  isRemote: boolean;
  budgetTo: number | null;
  /** Автор заказа — не уведомляем. */
  excludeUserId: string | null;
}

/** Prisma where кандидатов (без JS-фильтров по настройкам/лимитам). */
export function candidateWhere(c: MatchCriteria, now: Date = new Date()): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [
    notBlockedWhere(now),
    { OR: [{ occupancyStatus: null }, { occupancyStatus: { notIn: BUSY_STATUSES } }] },
    {
      OR: [
        { userServices: { some: { professionId: { in: c.professionIds }, status: 'active' } } },
        { userProfessions: { some: { professionId: { in: c.professionIds } } } },
      ],
    },
  ];
  if (c.excludeUserId) and.push({ id: { not: c.excludeUserId } });
  return { AND: and };
}

/** Примерное число подходящих (для разбора и гостя). */
export async function countMatchCandidates(c: MatchCriteria, now: Date = new Date()): Promise<number> {
  if (c.professionIds.length === 0) return 0;
  return prisma.user.count({ where: candidateWhere(c, now) });
}

export const candidateSelect = (professionIds: string[]) => ({
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatar: true,
  city: true,
  genres: true,
  occupancyStatus: true,
  lastSeenAt: true,
  notificationPrefs: true,
  publicConsentAt: true,
  isBlocked: true,
  blockedUntil: true,
  isVerified: true,
  isPremium: true,
  userServices: {
    where: { professionId: { in: professionIds }, status: 'active' },
    select: {
      professionId: true,
      priceFrom: true,
      priceTo: true,
      profession: { select: { name: true } },
      genres: { select: { id: true, name: true } },
      geographies: { select: { name: true } },
      workFormats: { select: { name: true } },
      selectedCustomFilterValues: { select: { value: true, filter: { select: { name: true } } } },
    },
  },
  userProfessions: {
    where: { professionId: { in: professionIds } },
    select: { professionId: true, profession: { select: { name: true } } },
  },
});

export interface CandidateRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  nickname?: string | null;
  avatar?: string | null;
  city: string | null;
  genres?: string[] | null;
  occupancyStatus: string | null;
  lastSeenAt: Date | null;
  notificationPrefs?: unknown;
  publicConsentAt?: Date | null;
  isBlocked?: boolean | null;
  blockedUntil?: Date | null;
  isVerified?: boolean | null;
  isPremium?: boolean | null;
  userServices: Array<{
    professionId: string;
    priceFrom: number | null;
    priceTo: number | null;
    profession?: { name: string } | null;
    genres: Array<{ id: string; name: string }>;
    geographies: Array<{ name: string }>;
    workFormats: Array<{ name: string }>;
    selectedCustomFilterValues: Array<{ value: string; filter: { name: string } | null }>;
  }>;
  userProfessions: Array<{ professionId: string; profession?: { name: string } | null }>;
}

export interface ScoreContext {
  now: Date;
  rating?: { avg: number; count: number } | null;
  avgResponseMinutes?: number | null;
}

export interface RankedCandidate {
  id: string;
  score: number;
  reasons: string[];
  row: CandidateRow;
}

const norm = (s: string | null | undefined) => normalize(String(s ?? '')).replace(/[^a-zа-я0-9&]+/g, ' ').trim();
const REMOTE_RE = /удал|онлайн|online|дистанц|remote|любой город|вся россия|по всей россии|весь мир/;
const ANY_GENRE_RE = /любой жанр|open format|любые жанры/;

/** Готов работать удалённо/с выездом: формат работы или география услуги. */
function isRemoteReady(row: CandidateRow): boolean {
  return row.userServices.some((us) =>
    us.workFormats.some((w) => REMOTE_RE.test(norm(w.name))) ||
    us.geographies.some((g) => REMOTE_RE.test(norm(g.name))) ||
    us.selectedCustomFilterValues.some((v) => REMOTE_RE.test(norm(v.value))));
}

function genreMatch(row: CandidateRow, c: MatchCriteria): 'exact' | 'any' | null {
  if (c.genreIds.length === 0 && c.genreNames.length === 0) return null;
  const wanted = new Set(c.genreNames.flatMap((n) => [norm(n), ...n.split('/').map(norm)]).filter(Boolean));
  const hit = (name: string) => {
    const n = norm(name);
    return wanted.has(n) || n.split('/').some((p) => wanted.has(norm(p)));
  };
  let any = false;
  for (const us of row.userServices) {
    if (us.genres.some((g) => c.genreIds.includes(g.id) || hit(g.name))) return 'exact';
    for (const v of us.selectedCustomFilterValues) {
      if (norm(v.filter?.name) !== 'жанр') continue;
      if (hit(v.value)) return 'exact';
      if (ANY_GENRE_RE.test(norm(v.value))) any = true;
    }
  }
  if ((row.genres ?? []).some((g) => hit(g))) return 'exact';
  return any ? 'any' : null;
}

function cityMatch(row: CandidateRow, cityName: string): boolean {
  const target = norm(cityName);
  if (norm(row.city) === target) return true;
  return row.userServices.some((us) => us.geographies.some((g) => norm(g.name) === target));
}

/**
 * Очки кандидата. Профессия — обязательна (фильтр в запросе), здесь — бонус
 * за активную услугу. Чем больше, тем выше в списке.
 */
export function scoreCandidate(row: CandidateRow, c: MatchCriteria, ctx: ScoreContext): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const hasService = row.userServices.some((us) => c.professionIds.includes(us.professionId));
  // Разница «услуга − профессия» (20) больше бонуса за активность (15): тот, кто
  // предлагает услугу, важнее просто заходившего недавно.
  if (hasService) { score += 45; reasons.push('service'); }
  else if (row.userProfessions.some((up) => c.professionIds.includes(up.professionId))) { score += 25; reasons.push('profession'); }

  const g = genreMatch(row, c);
  if (g === 'exact') { score += 20; reasons.push('genre'); }
  else if (g === 'any') { score += 8; reasons.push('genre_any'); }

  const remoteReady = isRemoteReady(row);
  if (c.isRemote) {
    if (remoteReady) { score += 15; reasons.push('remote'); }
  } else if (c.cityName) {
    if (cityMatch(row, c.cityName)) { score += 20; reasons.push('city'); }
    else if (remoteReady) { score += 8; reasons.push('remote'); }
  }

  if (ctx.rating && ctx.rating.count > 0) {
    score += (Math.max(0, Math.min(10, ctx.rating.avg)) / 10) * 15 + Math.min(ctx.rating.count, 10) * 0.5;
    reasons.push('rating');
  }

  if (row.lastSeenAt) {
    const ago = ctx.now.getTime() - new Date(row.lastSeenAt).getTime();
    if (ago <= 3 * DAY_MS) { score += 15; reasons.push('active'); }
    else if (ago <= 30 * DAY_MS) { score += 10; reasons.push('active'); }
  }

  if (row.occupancyStatus === 'open') { score += 5; reasons.push('open'); }
  else if (row.occupancyStatus === 'considering') score += 2;
  else if (row.occupancyStatus && BUSY_STATUSES.includes(row.occupancyStatus)) score -= 25;

  const m = ctx.avgResponseMinutes;
  if (m != null) {
    if (m <= 60) { score += 8; reasons.push('fast_reply'); }
    else if (m <= 360) score += 5;
    else if (m <= 1440) score += 2;
  }

  if (c.budgetTo != null && c.budgetTo > 0 && hasService) {
    const prices = row.userServices.filter((us) => c.professionIds.includes(us.professionId) && us.priceFrom != null);
    if (prices.some((us) => (us.priceFrom ?? 0) <= c.budgetTo!)) { score += 5; reasons.push('budget'); }
  }

  return { score: Math.round(score * 100) / 100, reasons };
}

/** Категория «Заказы и услуги» не отключена (null/нет ключа = включено). */
function ordersNotificationsEnabled(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== 'object') return true;
  return (prefs as Record<string, unknown>).orders !== false;
}

/** Среднее время ответа в личных переписках (мин) — одним запросом для группы. */
export async function loadAvgResponseMinutes(userIds: string[], now: Date = new Date()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  try {
    const since = new Date(now.getTime() - 90 * DAY_MS);
    const rows = await prisma.$queryRaw<Array<{ userId: string; avgMinutes: number | null; n: number }>>`
      WITH conv AS (
        SELECT DISTINCT "conversationId" FROM "ConversationMember"
        WHERE "userId" = ANY(${userIds}) AND "deletedAt" IS NULL
      ),
      m AS (
        SELECT msg."senderId", msg."createdAt",
          LAG(msg."senderId") OVER w AS "prevSender",
          LAG(msg."createdAt") OVER w AS "prevAt"
        FROM "Message" msg
        WHERE msg."conversationId" IN (SELECT "conversationId" FROM conv)
          AND msg."deletedAt" IS NULL
          AND msg."createdAt" > ${since}
        WINDOW w AS (PARTITION BY msg."conversationId" ORDER BY msg."createdAt")
      )
      SELECT "senderId" AS "userId",
        AVG(EXTRACT(EPOCH FROM ("createdAt" - "prevAt")) / 60)::float AS "avgMinutes",
        COUNT(*)::int AS "n"
      FROM m
      WHERE "senderId" = ANY(${userIds})
        AND "prevSender" IS NOT NULL AND "prevSender" <> "senderId"
        AND "createdAt" - "prevAt" < interval '7 days'
      GROUP BY "senderId"`;
    for (const r of rows ?? []) {
      // Как в профиле (users.ts): меньше 3 ответов — статистики нет.
      if (r.avgMinutes != null && Number(r.n) >= 3) out.set(r.userId, Math.round(Number(r.avgMinutes)));
    }
  } catch {
    // Время ответа — вторичный сигнал: сбой запроса не должен мешать подбору.
  }
  return out;
}

export interface RankOptions {
  now?: Date;
  limit?: number;
  /** Уже уведомлённые по этому заказу. */
  excludeIds?: Set<string>;
  /** Учитывать суточный лимит уведомлений и настройки уведомлений. */
  forNotification?: boolean;
}

/** Подбор и ранжирование кандидатов. */
export async function rankCandidates(c: MatchCriteria, opts: RankOptions = {}): Promise<RankedCandidate[]> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? MATCH_LIMIT;
  if (c.professionIds.length === 0) return [];

  const pool = (await prisma.user.findMany({
    where: candidateWhere(c, now),
    select: candidateSelect(c.professionIds),
    orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: POOL_SIZE,
  })) as unknown as CandidateRow[];

  let rows = pool.filter((r) => r.id !== c.excludeUserId && !opts.excludeIds?.has(r.id));
  if (opts.forNotification) {
    rows = rows.filter((r) => ordersNotificationsEnabled(r.notificationPrefs));
    if (rows.length > 0) {
      const recent = await prisma.orderMatchNotification.groupBy({
        by: ['userId'],
        where: { userId: { in: rows.map((r) => r.id) }, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
        _count: { _all: true },
      });
      const capped = new Set(recent.filter((x: any) => (x._count?._all ?? 0) >= DAILY_MATCH_NOTIFY_CAP).map((x: any) => x.userId));
      rows = rows.filter((r) => !capped.has(r.id));
    }
  }
  if (rows.length === 0) return [];

  const ratings = new Map<string, { avg: number; count: number }>();
  const grouped = await prisma.review.groupBy({
    by: ['targetId'],
    where: { targetId: { in: rows.map((r) => r.id) } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  for (const g of grouped as any[]) ratings.set(g.targetId, { avg: Number(g._avg?.rating ?? 0), count: Number(g._count?._all ?? 0) });

  const byTie = (a: RankedCandidate, b: RankedCandidate) =>
    b.score - a.score ||
    (new Date(b.row.lastSeenAt ?? 0).getTime() - new Date(a.row.lastSeenAt ?? 0).getTime()) ||
    a.id.localeCompare(b.id);

  // Первый проход без времени ответа; дорогой сигнал считаем только для лидеров.
  const first = rows
    .map((row) => ({ id: row.id, row, ...scoreCandidate(row, c, { now, rating: ratings.get(row.id) }) }))
    .sort(byTie);
  const top = first.slice(0, Math.max(limit, RESPONSE_TIME_TOP));
  const responseMinutes = await loadAvgResponseMinutes(top.map((x) => x.id), now);
  return top
    .map((x) => ({ id: x.id, row: x.row, ...scoreCandidate(x.row, c, { now, rating: ratings.get(x.id), avgResponseMinutes: responseMinutes.get(x.id) ?? null }) }))
    .sort(byTie)
    .slice(0, limit);
}

export interface PreviewUser {
  id: string;
  displayName: string;
  avatar: string | null;
  isVerified: boolean;
  profession: string | null;
  city: string | null;
}

/** Превью для заказчика — ТОЛЬКО публичные профили (согласие 152-ФЗ ст. 10.1). */
export function toPreviewUsers(ranked: RankedCandidate[], max = 5): PreviewUser[] {
  return ranked
    .filter((r) => isPublicPerson(r.row as any))
    .slice(0, max)
    .map((r) => {
      const p = toPublicPerson(r.row as any);
      const profession = r.row.userServices[0]?.profession?.name ?? r.row.userProfessions[0]?.profession?.name ?? null;
      return { id: p.id!, displayName: p.displayName, avatar: p.avatar, isVerified: p.isVerified, profession, city: r.row.city ?? null };
    });
}

export interface NotifyMatchesParams {
  orderId: string;
  orderTitle: string;
  authorId: string;
  criteria: MatchCriteria;
  /** Короткая сводка для текста уведомления: «Самара · 20.11 · до 10 000 ₽». */
  summary?: string;
  now?: Date;
}

/**
 * Подбирает топ-10 и шлёт личные уведомления order_match (через notify():
 * учёт настроек + push). Повторно по тому же заказу не шлёт (OrderMatchNotification
 * orderId+userId уникальны), суточный лимит на исполнителя — DAILY_MATCH_NOTIFY_CAP.
 */
export async function notifyOrderMatches(p: NotifyMatchesParams): Promise<{ notified: RankedCandidate[] }> {
  const now = p.now ?? new Date();
  const already = await prisma.orderMatchNotification.findMany({ where: { orderId: p.orderId }, select: { userId: true } });
  const ranked = await rankCandidates(
    { ...p.criteria, excludeUserId: p.authorId },
    { now, limit: MATCH_LIMIT, excludeIds: new Set(already.map((a: any) => a.userId)), forNotification: true },
  );
  if (ranked.length === 0) return { notified: [] };

  // Сначала фиксируем факт рассылки (уникальность orderId+userId), потом шлём.
  await prisma.orderMatchNotification.createMany({
    data: ranked.map((r) => ({ orderId: p.orderId, userId: r.id, score: r.score })),
    skipDuplicates: true,
  });
  const notified = ranked;

  const body = `«${p.orderTitle}»${p.summary ? ` — ${p.summary}` : ''}. Откликнитесь, пока заказ открыт.`;
  await Promise.all(notified.map((r) => notify({
    userId: r.id,
    actorId: p.authorId,
    type: MATCH_NOTIFICATION_TYPE,
    title: 'Новый заказ под ваш профиль',
    body,
    link: `/orders/${p.orderId}`,
  })));
  return { notified };
}
