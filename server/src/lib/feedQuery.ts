/**
 * Фильтры ленты (GET /api/posts/feed) → Prisma where. Вынесено из routes/posts.ts,
 * чтобы авторизованная лента, гостевая лента (lib/publicData) и будущие
 * SEO-снимки (Ф4) строили выборку одинаково.
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

/**
 * Build the where clause from feed filters.
 *   type       — post type (blog | question | poll | service | employment | …), comma list
 *   authorKind — all | resident (profile) | channel | artist | mine
 *   period     — today | yesterday | 3days | week | month | 3months | year | all
 *   city       — comma-separated list, exact match on stored names
 *   employment / artistType / genre — contextual filters (E4)
 */
export function buildFeedWhere(
  q: FeedFilterQuery,
  opts: { viewerId?: string | null; teamUserId: string | null },
): FeedWhereResult {
  const { type, authorKind, period, city, employment, artistType, genre } = q;
  const kind = authorKind ? String(authorKind) : 'all';
  const teamUserId = opts.teamUserId;

  const where: any = {};
  if (type && type !== 'all') {
    const types = String(type).split(',').map(t => t.trim()).filter(Boolean);
    if (types.length) where.type = types.length > 1 ? { in: types } : types[0];
  }
  if (kind === 'resident') { where.channelId = null; where.artistId = null; }
  else if (kind === 'channel') where.channelId = { not: null };
  else if (kind === 'artist') where.artistId = { not: null };
  else if (kind === 'mine') where.authorId = opts.viewerId ?? undefined;
  else if (teamUserId) where.authorId = { not: teamUserId }; // exclude team from default/other views

  // Hide «Услуга» posts whose offering is no longer active (archived/draft) — an
  // archived/unpublished service must not show in the feed. Also hide degenerate
  // structured service posts whose linked offering was deleted (serviceId null):
  // those would render as an empty «Услуга» card with no data. Non-service posts
  // are unaffected.
  where.NOT = [
    { type: 'service', service: { status: { not: 'active' } } },
    { type: 'service', serviceId: null },
  ];

  // period — date lower bound on createdAt (server-computed)
  const periodStr = period ? String(period) : 'all';
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
      switch (periodStr) {
        case '3days': since.setDate(since.getDate() - 3); break;
        case 'week': since.setDate(since.getDate() - 7); break;
        case 'month': since.setMonth(since.getMonth() - 1); break;
        case '3months': since.setMonth(since.getMonth() - 3); break;
        case 'year': since.setFullYear(since.getFullYear() - 1); break;
        default: break;
      }
      where.createdAt = { gte: since };
    }
  }

  // city — comma-separated list, exact match on stored names
  if (city) {
    const cityNames = String(city)
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);
    if (cityNames.length > 0) where.city = { in: cityNames };
  }

  // ── Contextual filters (E4) ──────────────────────────────────────────────
  // Employment status — filter by the post author's occupancy status
  // (shown in UI for «Резидент» author or «Апдейт занятости» type).
  if (employment && employment !== 'all') {
    where.author = { ...(where.author || {}), occupancyStatus: String(employment) };
  }
  // Artist type — only artist posts have an artist relation (shown for «Артист»).
  if (artistType && artistType !== 'all') {
    where.artist = { ...(where.artist || {}), type: String(artistType) };
  }
  // Genre — artist posts whose artist is tagged with the given genre.
  if (genre && genre !== 'all') {
    where.artist = { ...(where.artist || {}), genres: { some: { genre: { name: String(genre) } } } };
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
