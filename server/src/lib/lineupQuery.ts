// «Биржа лайнапов»: общие константы, фильтры ленты, подписи и карточка артиста
// в отклике. Чистый модуль (без prisma/notify) — его используют routes/lineups.ts,
// lib/lineupMatching.ts и гостевые загрузчики lib/publicData.ts.
import type { Prisma } from '@prisma/client';
import { parseCalendarDay, startOfDayMsk, endOfDayMsk } from './mskDate';
import { clampInt } from './feedQuery';
import { yoNorm } from '../utils/search';

export const LINEUP_STATUSES = ['active', 'closed', 'draft'] as const;
export const LINEUP_SLOT_TYPES = ['opener', 'headliner', 'any'] as const;
export const LINEUP_FEE_TYPES = ['fixed', 'percent', 'free', 'negotiable'] as const;
export const LINEUP_RESPONSE_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn'] as const;

export type LineupSlotType = (typeof LINEUP_SLOT_TYPES)[number];
export type LineupFeeType = (typeof LINEUP_FEE_TYPES)[number];

export const LINEUP_MAX_SLOTS = 10;
export const LINEUP_MAX_GENRES = 10;
/** Отклики, которые «живые» для счётчиков (отозванные не считаются). */
export const LINEUP_LIVE_RESPONSE_STATUSES = ['pending', 'accepted'] as const;

/** Лента: по умолчанию 20, максимум 30 (гостю — 20 и не глубже 200). */
export const LINEUP_PAGE_DEFAULT = 20;
export const LINEUP_PAGE_MAX = 30;
export const LINEUP_GUEST_PAGE_MAX = 20;
export const LINEUP_GUEST_MAX_DEPTH = 200;

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

export const SLOT_TYPE_LABELS: Record<LineupSlotType, string> = {
  opener: 'Разогрев',
  headliner: 'Хедлайнер',
  any: 'Любой слот',
};

export const FEE_TYPE_LABELS: Record<LineupFeeType, string> = {
  fixed: 'Фиксированный гонорар',
  percent: 'Процент от входа',
  free: 'Без гонорара',
  negotiable: 'Гонорар по договорённости',
};

export function slotTypeLabel(v: string | null | undefined): string {
  return SLOT_TYPE_LABELS[(v as LineupSlotType)] ?? SLOT_TYPE_LABELS.any;
}

/** «Гонорар 30 000 ₽» / «20% от входа» / «Без гонорара» / «Гонорар по договорённости». */
export function feeLabel(feeType: string | null | undefined, feeAmount: number | null | undefined): string {
  if (feeType === 'fixed' && feeAmount != null) return `Гонорар ${feeAmount.toLocaleString('ru-RU')} ₽`;
  if (feeType === 'percent' && feeAmount != null) return `${feeAmount}% от входа`;
  return FEE_TYPE_LABELS[(feeType as LineupFeeType)] ?? FEE_TYPE_LABELS.negotiable;
}

/** Момент → «15.11.2026 20:00» по МСК (UTC+3 без перехода на летнее время). */
export function formatEventMsk(date: Date | string | null | undefined): string {
  if (!date) return '';
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return '';
  const m = new Date(t + MSK_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(m.getUTCDate())}.${p(m.getUTCMonth() + 1)}.${m.getUTCFullYear()} ${p(m.getUTCHours())}:${p(m.getUTCMinutes())}`;
}

/**
 * «Готовы к гастролям» — Artist.tourReady (свободный текст из профиля артиста,
 * плейсхолдер «Готовы к гастролям»). Пусто или явный отказ («нет», «не готовы»,
 * «только Москва») — не готов.
 */
export function isTourReady(text: string | null | undefined): boolean {
  const s = yoNorm(text ?? '').trim();
  if (!s) return false;
  if (/^[-—–]/.test(s)) return false;
  // \b в JS не работает с кириллицей — граница слова явно: конец/пробел/знак.
  if (/^(нет|не|no|not|только)(?=$|[\s.,!:;])/.test(s)) return false;
  return true;
}

/** Совпадение города без учёта регистра и ё/е. */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = yoNorm(a ?? '').trim();
  return !!x && x === yoNorm(b ?? '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Фильтры ленты
// ─────────────────────────────────────────────────────────────────────────────

export interface LineupListFilters {
  city: string | null;
  genreIds: string[];
  from: Date | null;
  to: Date | null;
  sort: 'new' | 'date';
  page: number;
  limit: number;
}

/**
 * Разбор query ленты: city — имя города; genre — id жанров через запятую;
 * dateFrom/dateTo — календарные дни (ДД.ММ.ГГГГ или ГГГГ-ММ-ДД, по МСК);
 * sort=date — ближайшие события первыми (по умолчанию — новые запросы).
 */
export function parseLineupListFilters(q: Record<string, unknown>, opts: { guest?: boolean } = {}): LineupListFilters {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const city = str(q.city).slice(0, 100) || null;
  const genreIds = [...new Set(str(q.genre).split(',').map((s) => s.trim()).filter((s) => s && s.length <= 64))].slice(0, LINEUP_MAX_GENRES);
  const fromDay = parseCalendarDay(str(q.dateFrom) || null);
  const toDay = parseCalendarDay(str(q.dateTo) || null);
  const maxLimit = opts.guest ? LINEUP_GUEST_PAGE_MAX : LINEUP_PAGE_MAX;
  const limit = clampInt(q.limit, LINEUP_PAGE_DEFAULT, 1, maxLimit);
  const maxPage = opts.guest ? Math.max(1, Math.floor(LINEUP_GUEST_MAX_DEPTH / limit)) : 500;
  return {
    city,
    genreIds,
    from: fromDay ? startOfDayMsk(fromDay) : null,
    to: toDay ? endOfDayMsk(toDay) : null,
    sort: q.sort === 'date' ? 'date' : 'new',
    page: clampInt(q.page, 1, 1, maxPage),
    limit,
  };
}

/**
 * where ленты: только active и только будущие события (прошедшие уходят из
 * ленты сами). authorWhere — «автор не заблокирован» (notBlockedWhere из
 * publicData; передаётся снаружи, чтобы модуль не зависел от publicData).
 */
export function buildLineupListWhere(
  f: Pick<LineupListFilters, 'city' | 'genreIds' | 'from' | 'to'>,
  authorWhere: Prisma.UserWhereInput | null,
  now: Date = new Date(),
): Prisma.LineupRequestWhereInput {
  const from = f.from && f.from > now ? f.from : now;
  const and: Prisma.LineupRequestWhereInput[] = [
    { status: 'active' },
    { eventDate: f.to ? { gte: from, lte: f.to } : { gte: from } },
  ];
  if (authorWhere) and.push({ author: authorWhere });
  if (f.city) and.push({ cityName: { equals: f.city, mode: 'insensitive' } });
  if (f.genreIds.length) and.push({ genres: { some: { genreId: { in: f.genreIds } } } });
  return { AND: and };
}

export function lineupListOrderBy(sort: 'new' | 'date'): Prisma.LineupRequestOrderByWithRelationInput[] {
  return sort === 'date'
    ? [{ eventDate: 'asc' }, { createdAt: 'desc' }]
    : [{ createdAt: 'desc' }, { id: 'desc' }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Карточка артиста в отклике (видит только автор запроса)
// ─────────────────────────────────────────────────────────────────────────────

/** Изменяемая копия для Prisma `in` (readonly-кортеж в select `as const` не проходит типы). */
export const LINEUP_LIVE_STATUS_LIST: string[] = [...LINEUP_LIVE_RESPONSE_STATUSES];

const RELEASES_NEWEST_FIRST: Prisma.ReleaseOrderByWithRelationInput[] = [
  { releaseDate: { sort: 'desc', nulls: 'last' } },
  { createdAt: 'desc' },
];

export const LINEUP_ARTIST_CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  type: true,
  avatar: true,
  city: true,
  tourReady: true,
  status: true,
  listeners: true,
  listenersDelta: true,
  ymData: true,
  genres: { select: { genre: { select: { id: true, name: true } } } },
  releases: {
    select: { id: true, title: true, coverUrl: true, releaseDate: true, url: true, platform: true },
    orderBy: RELEASES_NEWEST_FIRST,
    take: 3,
  },
} as const;

function safeHttp(v: unknown): string | null {
  return typeof v === 'string' && /^https?:\/\//i.test(v) ? v.slice(0, 1000) : null;
}

/** Ближайшие концерты из снапшота ЯМ (ymData.concerts): не раньше сегодняшнего дня по МСК. */
export function upcomingConcerts(ymData: unknown, now: Date = new Date(), take = 3) {
  const list: any[] = ymData && typeof ymData === 'object' && Array.isArray((ymData as any).concerts) ? (ymData as any).concerts : [];
  const todayDay = parseCalendarDay(now);
  const since = todayDay ? startOfDayMsk(todayDay).getTime() : now.getTime();
  return list
    .map((c) => {
      const raw = typeof c?.datetime === 'string' ? c.datetime : typeof c?.date === 'string' ? c.date : null;
      const t = raw ? Date.parse(raw) : NaN;
      return { c, t };
    })
    .filter((x) => Number.isFinite(x.t) && x.t >= since)
    .sort((a, b) => a.t - b.t)
    .slice(0, take)
    .map(({ c, t }) => ({
      title: String(c?.concertTitle || c?.title || 'Концерт').slice(0, 300),
      date: new Date(t).toISOString(),
      city: typeof c?.city === 'string' ? c.city.slice(0, 200) : null,
      place: typeof c?.place === 'string' ? c.place.slice(0, 300) : (typeof c?.address === 'string' ? c.address.slice(0, 300) : null),
      url: safeHttp(c?.afishaUrl) ?? safeHttp(c?.url),
    }));
}

/** Белый список полей карточки артиста (без модерации и сырого ymData). */
export function serializeLineupArtistCard(a: any, now: Date = new Date()) {
  if (!a) return null;
  return {
    id: a.id,
    slug: a.slug ?? null,
    name: a.name,
    type: a.type ?? null,
    avatar: a.avatar ?? null,
    city: a.city ?? null,
    tourReady: a.tourReady ?? null,
    status: a.status,
    listeners: a.listeners != null ? Number(a.listeners) : 0,
    listenersDelta: a.listenersDelta ?? null,
    genres: (a.genres ?? []).map((g: any) => (g?.genre ? { id: g.genre.id, name: g.genre.name } : null)).filter(Boolean),
    releases: (a.releases ?? []).slice(0, 3).map((r: any) => ({
      id: r.id,
      title: r.title,
      coverUrl: r.coverUrl ?? null,
      releaseDate: r.releaseDate ?? null,
      url: safeHttp(r.url),
      platform: r.platform ?? null,
    })),
    concerts: upcomingConcerts(a.ymData, now, 3),
    href: `/artist/${encodeURIComponent(a.slug || a.id)}`,
  };
}
