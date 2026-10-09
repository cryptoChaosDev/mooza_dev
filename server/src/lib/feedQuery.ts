/**
 * Фильтры ленты (GET /api/posts/feed) → Prisma where для гостевой ленты
 * (lib/publicData) и будущих SEO-снимков (Ф4). Повторяет правила фильтров
 * авторизованной ленты из routes/posts.ts.
 */

// System team account — its posts are pinned to the top of the feed for brand-new users.
// See server/prisma/seeds/welcome-posts.ts
export const TEAM_EMAIL = 'team@moooza.ru';

export interface FeedFilterQuery {
  type?: unknown;
  authorKind?: unknown;
  period?: unknown;
  city?: unknown;
  employment?: unknown;
  artistType?: unknown;
  genre?: unknown;
}

export interface FeedWhereResult {
  where: any;
  kind: string;
  periodStr: string;
}

const EMPLOYMENT_STATUSES = ['open', 'considering', 'closed'];
const ARTIST_TYPES = ['SOLO', 'GROUP', 'COVER_GROUP', 'DUET', 'TRIBUTE', 'CHOIR', 'ENSEMBLE', 'ORCHESTRA'];

function qstr(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v);
}

/**
 * Build the where clause from feed filters — те же правила, что у ленты в
 * routes/posts.ts (dev): валидация employment/artistType, потолки длины списков.
 *   type       — post type (blog | question | poll | service | employment | …), comma list
 *   authorKind — all | resident (profile) | channel | artist | mine (гостю mine → all)
 *   period     — today | yesterday | 3days | week | month | 3months | year | all
 *   city       — comma-separated list, exact match on stored names
 *   employment / artistType / genre — contextual filters (E4)
 * Видимость авторов (блокировки, согласие) сюда НЕ входит — её добавляет вызывающий.
 */
export function buildFeedWhere(
  q: FeedFilterQuery,
  opts: { viewerId?: string | null; teamUserId: string | null },
): FeedWhereResult {
  const { type, authorKind, period, city, employment, artistType, genre } = q;
  const kindRaw = authorKind ? qstr(authorKind) : 'all';
  const kind = kindRaw === 'mine' && !opts.viewerId ? 'all' : kindRaw;
  const teamUserId = opts.teamUserId;

  const where: any = {};
  const typeStr = qstr(type);
  const typeTypes = typeStr && typeStr !== 'all'
    ? typeStr.split(',').map(t => t.trim()).filter(Boolean).slice(0, 20)
    : [];
  if (typeTypes.length) where.type = typeTypes.length > 1 ? { in: typeTypes } : typeTypes[0];
  if (kind === 'resident') { where.channelId = null; where.artistId = null; }
  else if (kind === 'channel') where.channelId = { not: null };
  else if (kind === 'artist') where.artistId = { not: null };
  else if (kind === 'mine') where.authorId = opts.viewerId;
  else if (teamUserId) where.authorId = { not: teamUserId }; // exclude team from default/other views

  // Hide «Услуга» posts whose offering is no longer active (archived/draft) and
  // degenerate service posts whose offering was deleted (serviceId null).
  where.NOT = [
    { type: 'service', service: { status: { not: 'active' } } },
    { type: 'service', serviceId: null },
  ];

  // period — date lower bound on createdAt (server-computed)
  const periodStr = period ? qstr(period) : 'all';
  if (periodStr && periodStr !== 'all') {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (periodStr === 'today') {
      where.createdAt = { gte: startOfToday };
    } else if (periodStr === 'yesterday') {
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      where.createdAt = { gte: startOfYesterday, lt: startOfToday };
    } else {
      const since = new Date(now);
      let known = true;
      switch (periodStr) {
        case '3days': since.setDate(since.getDate() - 3); break;
        case 'week': since.setDate(since.getDate() - 7); break;
        case 'month': since.setMonth(since.getMonth() - 1); break;
        case '3months': since.setMonth(since.getMonth() - 3); break;
        case 'year': since.setFullYear(since.getFullYear() - 1); break;
        default: known = false; break;
      }
      if (known) where.createdAt = { gte: since };
    }
  }

  // city — comma-separated list, exact match on stored names
  if (city) {
    const cityNames = qstr(city).split(',').map(c => c.trim()).filter(Boolean).slice(0, 50);
    if (cityNames.length > 0) where.city = { in: cityNames };
  }

  // ── Contextual filters (E4) ──────────────────────────────────────────────
  const employmentStr = qstr(employment);
  if (employmentStr && employmentStr !== 'all' && EMPLOYMENT_STATUSES.includes(employmentStr)) {
    where.author = { ...(where.author || {}), occupancyStatus: employmentStr };
  }
  const artistTypeStr = qstr(artistType);
  if (artistTypeStr && artistTypeStr !== 'all' && ARTIST_TYPES.includes(artistTypeStr)) {
    where.artist = { ...(where.artist || {}), type: artistTypeStr };
  }
  const genreStr = qstr(genre);
  if (genreStr && genreStr !== 'all') {
    where.artist = { ...(where.artist || {}), genres: { some: { genre: { name: genreStr.slice(0, 100) } } } };
  }

  return { where, kind, periodStr };
}

// Greedy author-diversity pass: avoid the same author within `window` slots.
export function diversifyByAuthor<T extends { authorId: string }>(items: T[], window = 4): T[] {
  const out: T[] = [];
  const recent: string[] = [];
  const pool = items.slice();
  while (pool.length) {
    let i = pool.findIndex((p) => !recent.includes(p.authorId));
    if (i === -1) i = 0;
    const [picked] = pool.splice(i, 1);
    out.push(picked);
    recent.push(picked.authorId);
    if (recent.length > window) recent.shift();
  }
  return out;
}

/** Clamp a numeric query param (NaN/negative/oversized → safe value). */
export function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
