// «Биржа лайнапов»: подбор артистов при публикации запроса и персональное
// приглашение. Уведомления уходят админам/владельцам артиста (artistAccess).
//
// Матчинг: артист VERIFIED/APPROVED, ACTIVE; город — тот же, что у запроса,
// ИЛИ артист «готов к гастролям» (Artist.tourReady); жанры — пересечение (если
// у запроса жанры заданы). Лимиты: не больше 20 артистов на запрос (всего, с
// учётом прошлых публикаций) и не больше 5 таких уведомлений одному артисту
// за сутки. Кому уже ушло уведомление о запросе — LineupMatch (дедуп).
import { prisma } from '../index';
import { notify } from '../utils/notify';
import logger from '../utils/logger';
import { artistAdminIds, managedArtistIds, isUniqueViolation } from './artistAccess';
import { formatEventMsk, isTourReady, sameCity, slotTypeLabel } from './lineupQuery';

export const MATCH_MAX_ARTISTS_PER_REQUEST = 20;
export const MATCH_DAILY_LIMIT_PER_ARTIST = 5;
/** Персональные приглашения: одному артисту — не больше 5 в сутки, одному автору — не больше 20. */
export const INVITE_DAILY_LIMIT_PER_ARTIST = 5;
export const INVITE_DAILY_LIMIT_PER_AUTHOR = 20;
export const MATCH_ARTIST_STATUSES = ['VERIFIED', 'APPROVED'] as const;
/** Сколько кандидатов читаем из БД до фильтров в JS (сортировка — по слушателям). */
const MATCH_CANDIDATE_POOL = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LineupForMatching {
  id: string;
  authorId: string;
  title: string;
  eventDate: Date;
  cityName: string;
  slotType?: string | null;
  genreIds: string[];
}

export interface MatchedArtist {
  id: string;
  name: string;
  sameCity: boolean;
}

/**
 * Подходящие артисты для запроса (без побочных эффектов). Prisma-фильтр —
 * основной отбор; те же условия перепроверяются в JS (защита от неточного
 * where и явный отказ в tourReady вроде «нет»).
 */
export async function findMatchingArtists(req: LineupForMatching, now: Date = new Date()): Promise<MatchedArtist[]> {
  const already = await prisma.lineupMatch.count({ where: { requestId: req.id, kind: 'match' } });
  const remaining = MATCH_MAX_ARTISTS_PER_REQUEST - (already ?? 0);
  if (remaining <= 0) return [];

  // Артисты самого автора запроса не уведомляются.
  const ownArtistIds = await managedArtistIds(req.authorId);
  const genreIds = [...new Set(req.genreIds ?? [])];

  const rows: any[] = (await prisma.artist.findMany({
    where: {
      AND: [
        { status: { in: [...MATCH_ARTIST_STATUSES] } },
        { activityStatus: 'ACTIVE' },
        ...(ownArtistIds.length ? [{ id: { notIn: ownArtistIds } }] : []),
        ...(genreIds.length ? [{ genres: { some: { genreId: { in: genreIds } } } }] : []),
        {
          OR: [
            { city: { equals: req.cityName, mode: 'insensitive' as const } },
            { AND: [{ tourReady: { not: null } }, { NOT: { tourReady: '' } }] },
          ],
        },
        { lineupMatches: { none: { requestId: req.id } } },
      ],
    },
    select: {
      id: true, name: true, city: true, tourReady: true, status: true, activityStatus: true, listeners: true,
      genres: { select: { genreId: true } },
    },
    orderBy: [{ listeners: 'desc' }, { createdAt: 'desc' }],
    take: MATCH_CANDIDATE_POOL,
  })) ?? [];

  const own = new Set(ownArtistIds);
  const genreSet = new Set(genreIds);
  const candidates = rows
    .filter((a) => a && (MATCH_ARTIST_STATUSES as readonly string[]).includes(a.status))
    .filter((a) => (a.activityStatus ?? 'ACTIVE') === 'ACTIVE')
    .filter((a) => !own.has(a.id))
    .filter((a) => !genreSet.size || (a.genres ?? []).some((g: any) => genreSet.has(g?.genreId)))
    .map((a) => ({ id: a.id as string, name: a.name as string, sameCity: sameCity(a.city, req.cityName), tourReady: isTourReady(a.tourReady) }))
    .filter((a) => a.sameCity || a.tourReady);
  if (!candidates.length) return [];

  // Суточный лимит: сколько уведомлений-матчей артист получил за 24 часа.
  const since = new Date(now.getTime() - DAY_MS);
  const grouped = await prisma.lineupMatch.groupBy({
    by: ['artistId'],
    where: { artistId: { in: candidates.map((c) => c.id) }, kind: 'match', createdAt: { gte: since } },
    _count: { _all: true },
  });
  const counts: any[] = (grouped as any[]) ?? [];
  const recent = new Map<string, number>(counts.map((c) => [c.artistId, Number(c?._count?._all ?? 0)]));

  // Свой город — первыми (внутри — по слушателям, как пришло из БД).
  const allowed = candidates.filter((c) => (recent.get(c.id) ?? 0) < MATCH_DAILY_LIMIT_PER_ARTIST);
  const ordered = [...allowed.filter((c) => c.sameCity), ...allowed.filter((c) => !c.sameCity)];
  return ordered.slice(0, remaining).map(({ id, name, sameCity: sc }) => ({ id, name, sameCity: sc }));
}

/** Сгруппировать артистов по их админам: один админ — одно уведомление на запрос. */
async function adminsByArtists(artists: Array<{ id: string; name: string }>, excludeUserId: string) {
  const byUser = new Map<string, Array<{ id: string; name: string }>>();
  for (const a of artists) {
    const admins = await artistAdminIds(a.id);
    for (const userId of admins) {
      if (userId === excludeUserId) continue;
      const list = byUser.get(userId) ?? [];
      list.push(a);
      byUser.set(userId, list);
    }
  }
  return byUser;
}

/**
 * Матчинг при публикации: находит артистов, фиксирует LineupMatch (kind=match)
 * и уведомляет их админов «Новый запрос на выступление: …». Never throws.
 */
export async function notifyMatchingArtists(req: LineupForMatching, now: Date = new Date()): Promise<{ artistIds: string[]; notifiedUsers: number }> {
  try {
    const found = await findMatchingArtists(req, now);
    if (!found.length) return { artistIds: [], notifiedUsers: 0 };

    // Фиксируем по одному: уникальность (requestId, artistId) отсекает гонку
    // двух публикаций — уведомляем только тех, чья запись создана этим вызовом.
    const created: MatchedArtist[] = [];
    for (const a of found) {
      try {
        await prisma.lineupMatch.create({ data: { requestId: req.id, artistId: a.id, kind: 'match' } });
        created.push(a);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    if (!created.length) return { artistIds: [], notifiedUsers: 0 };

    const byUser = await adminsByArtists(created, req.authorId);
    const when = formatEventMsk(req.eventDate);
    for (const [userId, list] of byUser) {
      const forWhom = list.length === 1 ? `для «${list[0].name}»` : `для ваших артистов: ${list.map((a) => a.name).join(', ')}`;
      await notify({
        userId,
        actorId: req.authorId,
        type: 'lineup_match',
        title: `Новый запрос на выступление: ${req.title}`,
        body: `${when} · ${req.cityName} · ${slotTypeLabel(req.slotType)} — ${forWhom}`,
        link: list.length === 1 ? `/lineups/${req.id}?as=${encodeURIComponent(list[0].id)}` : `/lineups/${req.id}`,
      });
    }
    return { artistIds: created.map((a) => a.id), notifiedUsers: byUser.size };
  } catch (err: any) {
    logger.error(`[lineups] matching failed for ${req.id}: ${err?.message}`);
    return { artistIds: [], notifiedUsers: 0 };
  }
}

export type InviteResult = 'sent' | 'limited' | 'unavailable' | 'self' | 'duplicate';

/**
 * Персональное приглашение артиста (форма /lineups/new?artist=<id>): запрос
 * создаётся как обычно, а админам этого артиста сразу уходит уведомление.
 */
export async function sendPersonalInvite(
  req: LineupForMatching,
  artistId: string,
  authorName: string,
  now: Date = new Date(),
): Promise<InviteResult> {
  const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true, status: true } });
  if (!artist || artist.status === 'REJECTED') return 'unavailable';
  const admins = await artistAdminIds(artist.id);
  if (admins.includes(req.authorId)) return 'self';
  if (!admins.length) return 'unavailable';

  const since = new Date(now.getTime() - DAY_MS);
  const [toArtist, byAuthor] = await Promise.all([
    prisma.lineupMatch.count({ where: { artistId: artist.id, kind: 'invite', createdAt: { gte: since } } }),
    prisma.lineupMatch.count({ where: { kind: 'invite', createdAt: { gte: since }, request: { authorId: req.authorId } } }),
  ]);
  if ((toArtist ?? 0) >= INVITE_DAILY_LIMIT_PER_ARTIST || (byAuthor ?? 0) >= INVITE_DAILY_LIMIT_PER_AUTHOR) return 'limited';

  try {
    await prisma.lineupMatch.create({ data: { requestId: req.id, artistId: artist.id, kind: 'invite' } });
  } catch (e) {
    if (isUniqueViolation(e)) return 'duplicate';
    throw e;
  }

  const who = authorName || 'Организатор';
  for (const userId of admins) {
    await notify({
      userId,
      actorId: req.authorId,
      type: 'lineup_invite',
      title: `Приглашение выступить: ${req.title}`,
      body: `${who} приглашает «${artist.name}» · ${formatEventMsk(req.eventDate)} · ${req.cityName}`,
      link: `/lineups/${req.id}?as=${encodeURIComponent(artist.id)}`,
    });
  }
  return 'sent';
}
