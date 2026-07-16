import https from 'https';
import { prisma } from '../index';
import logger from './logger';
import { tgLog } from './telegram';
import { notify } from './notify';

/**
 * Ночная синхронизация с Яндекс.Музыкой.
 *
 * «Привязка» — ссылка на страницу артиста в контактах (socialLinks.yandex_music,
 * формат https://music.yandex.ru/artist/<id>). Раз в сутки для всех привязанных
 * артистов тянем публичное brief-info (неофициальное API, работает с РФ-IP без
 * ключей) и обновляем:
 *  - listeners  — всегда (это метрика «слушателей за месяц»);
 *  - description — только если у нас пусто (ручные правки не перетираем);
 *  - релизы/клипы — ДОБАВЛЯЕМ отсутствующие (дедуп по url), существующие не трогаем;
 *    участники не проставляются — владельцу уходит уведомление, он дополнит кредиты.
 *
 * API неофициальное: любой сбой одного артиста не прерывает обход, итог — в TG-лог.
 */

const YM_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Moooza/1.0';

export function extractYmArtistId(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = /music\.yandex\.(?:ru|com)\/artist\/(\d+)/i.exec(String(url));
  return m ? m[1] : null;
}

// ВАЖНО: через классический node:https, НЕ через fetch — антибот Яндекса
// режет TLS-сигнатуру undici (fetch стабильно получает 403, https.get — 200).
export function ymGet(path: string, timeoutMs = 20_000): Promise<any | null> {
  return new Promise((resolve) => {
    const req = https.get(
      {
        host: 'api.music.yandex.net',
        path,
        headers: { 'User-Agent': YM_UA },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function fetchBrief(ymId: string): Promise<any | null> {
  const data = await ymGet(`/artists/${ymId}/brief-info`);
  return data?.result ?? null;
}

/** Треклист альбома: [{id, title, durationMs, artists}] или null при сбое. */
export async function fetchYmTracklist(albumId: string): Promise<any[] | null> {
  const d = await ymGet(`/albums/${albumId}/with-tracks`);
  const volumes: any[][] = d?.result?.volumes ?? [];
  if (!Array.isArray(volumes) || volumes.length === 0) return null;
  const tracks = volumes.flat().map((t: any) => ({
    id: String(t?.id ?? ''),
    title: String(t?.title ?? '').trim(),
    durationMs: typeof t?.durationMs === 'number' ? t.durationMs : null,
    artists: (t?.artists ?? []).map((a: any) => String(a?.name ?? '')).filter(Boolean),
  })).filter((t) => t.title);
  return tracks.length > 0 ? tracks : null;
}

/** Метаданные релиза из объекта альбома ЯМ (direct-albums / витрина). */
function albumMeta(al: any): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (typeof al?.type === 'string' && al.type) meta.releaseType = al.type;
  else meta.releaseType = 'album'; // у обычных альбомов type отсутствует
  const labels = (al?.labels ?? []).map((l: any) => String(l?.name ?? '')).filter(Boolean);
  if (labels.length > 0) meta.label = labels.join(', ').slice(0, 200);
  if (typeof al?.genre === 'string' && al.genre) meta.genre = al.genre;
  if (typeof al?.trackCount === 'number') meta.trackCount = al.trackCount;
  if (typeof al?.likesCount === 'number') meta.likesCount = al.likesCount;
  return meta;
}

/**
 * Снапшот «витрины» brief-info для карточки артиста: официальные ссылки,
 * похожие артисты, топ-треки, фото, концерты, плейлист «Лучшее», счётчики.
 * Храним компактно (без сырых ответов ЯМ) в Artist.ymData.
 */
function buildYmData(brief: any): Record<string, unknown> {
  const a = brief.artist ?? {};
  return {
    updatedAt: new Date().toISOString(),
    likesCount: typeof a.likesCount === 'number' ? a.likesCount : null,
    counts: {
      tracks: a.counts?.tracks ?? null,
      albums: a.counts?.directAlbums ?? null,
    },
    genres: (a.genres ?? []).map((g: any) => String(g)).slice(0, 10),
    links: (a.links ?? []).map((l: any) => ({
      title: String(l?.title ?? ''),
      href: String(l?.href ?? ''),
      type: String(l?.type ?? ''),
      socialNetwork: l?.socialNetwork ? String(l.socialNetwork) : null,
    })).filter((l: any) => l.href).slice(0, 20),
    similarArtists: (brief.similarArtists ?? []).map((s: any) => ({
      ymId: String(s?.id ?? ''),
      name: String(s?.name ?? ''),
      cover: ymCoverUrl(s?.cover?.uri, '200x200') ?? null,
      genres: (s?.genres ?? []).slice(0, 3),
    })).filter((s: any) => s.ymId && s.name).slice(0, 10),
    popularTracks: (brief.popularTracks ?? []).map((t: any) => ({
      id: String(t?.id ?? ''),
      title: String(t?.title ?? '').trim(),
      durationMs: typeof t?.durationMs === 'number' ? t.durationMs : null,
    })).filter((t: any) => t.title).slice(0, 10),
    photos: (brief.allCovers ?? [])
      .map((c: any) => ymCoverUrl(c?.uri, '600x600'))
      .filter(Boolean)
      .slice(0, 10),
    concerts: (brief.concerts ?? []).slice(0, 10),
    bestPlaylist: brief.playlists?.[0]
      ? {
          title: String(brief.playlists[0].title ?? ''),
          trackCount: brief.playlists[0].trackCount ?? null,
          url: brief.playlists[0].playlistUuid
            ? `https://music.yandex.ru/playlists/${brief.playlists[0].playlistUuid}`
            : `https://music.yandex.ru/users/${brief.playlists[0].uid}/playlists/${brief.playlists[0].kind}`,
        }
      : null,
  };
}

/**
 * Автозаполнение контактов артиста из официальных ссылок ЯМ — только пустых
 * полей, ручные значения не перетираем. Ключи socialLinks — как в
 * client/src/components/SocialLinks.tsx (vk, website, bandlink…).
 */
function autofillLinks(
  artist: { socialLinks: unknown; bandLink?: string | null },
  ymLinks: { href: string; type: string; socialNetwork: string | null }[],
): { socialLinks?: Record<string, string>; bandLink?: string } {
  const current = { ...((artist.socialLinks as Record<string, string> | null) ?? {}) };
  const patch: { socialLinks?: Record<string, string>; bandLink?: string } = {};
  const NETWORK_TO_KEY: Record<string, string> = { vk: 'vk', bandlink: 'bandlink' };
  let changed = false;
  for (const l of ymLinks) {
    if (l.type === 'official' && !current.website) {
      current.website = l.href;
      changed = true;
      continue;
    }
    const key = l.socialNetwork ? NETWORK_TO_KEY[l.socialNetwork] : undefined;
    if (key && !current[key]) {
      current[key] = l.href;
      changed = true;
    }
    if (l.socialNetwork === 'bandlink' && !artist.bandLink) {
      patch.bandLink = l.href;
    }
  }
  if (changed) patch.socialLinks = current;
  return patch;
}

/**
 * ПОЛНАЯ дискография артиста. brief-info отдаёт только витрину (~9 альбомов),
 * весь список — в постраничном /direct-albums (у IDEЯ FIX: 9 против 36).
 */
export async function fetchAllYmAlbums(ymId: string, maxPages = 5): Promise<any[]> {
  const out: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const d = await ymGet(`/artists/${ymId}/direct-albums?page=${page}&page-size=100&sort-by=year`);
    const albums: any[] = d?.result?.albums ?? [];
    out.push(...albums);
    const pager = d?.result?.pager;
    if (!pager || albums.length === 0 || (pager.page + 1) * pager.perPage >= pager.total) break;
  }
  return out;
}

// coverUri/аватар YM → https-URL нужного размера. У альбомов coverUri приходит
// БЕЗ протокола (avatars.yandex.net/...), а у видео cover — уже С https:// —
// протокол добавляем только когда его нет.
export function ymCoverUrl(coverUri: string | undefined | null, size = '400x400'): string | undefined {
  if (!coverUri) return undefined;
  const u = String(coverUri).replace('%%', size);
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Синк одного артиста. Возвращает сводку изменений (для лога). */
export async function syncArtistFromYandexMusic(artist: {
  id: string;
  name: string;
  description: string | null;
  socialLinks: unknown;
  bandLink?: string | null;
  submittedById: string | null;
}): Promise<{ listeners?: number; newReleases: number; newClips: number } | null> {
  const links = (artist.socialLinks as Record<string, string> | null) ?? {};
  const ymId = extractYmArtistId(links.yandex_music);
  if (!ymId) return null;

  const brief = await fetchBrief(ymId);
  if (!brief?.artist) return null;

  const summary = { listeners: undefined as number | undefined, newReleases: 0, newClips: 0 };

  // 1. Слушатели за месяц + дельта — метрика, обновляем всегда.
  const listeners = brief.stats?.lastMonthListeners;
  const patch: Record<string, unknown> = {};
  if (typeof listeners === 'number' && listeners >= 0) {
    patch.listeners = BigInt(listeners);
    summary.listeners = listeners;
    const delta = brief.stats?.lastMonthListenersDelta;
    if (typeof delta === 'number') patch.listenersDelta = delta;
  }
  // 2. Описание — только если у нас пусто.
  const ymDesc = brief.artist.description?.text ?? brief.artist.description;
  if (!artist.description && typeof ymDesc === 'string' && ymDesc.trim()) {
    patch.description = ymDesc.trim().slice(0, 4000);
  }
  // 3. Витрина ЯМ (ссылки, похожие, топ-треки, фото, концерты, плейлист).
  patch.ymData = buildYmData(brief);
  // 4. Автозаполнение контактов из официальных ссылок — только пустых полей.
  Object.assign(patch, autofillLinks(artist, (patch.ymData as any).links));
  await prisma.artist.update({ where: { id: artist.id }, data: patch as any });

  // 5. Точка истории слушателей — не чаще раза в 20 часов (ручной прогон
  //    после ночного не плодит дубли), для графика динамики.
  if (typeof listeners === 'number' && listeners >= 0) {
    const last = await prisma.artistListenersSnapshot.findFirst({
      where: { artistId: artist.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!last || Date.now() - last.createdAt.getTime() > 20 * 60 * 60 * 1000) {
      await prisma.artistListenersSnapshot.create({
        data: { artistId: artist.id, listeners: BigInt(listeners) },
      });
    }
  }

  // 6. Релизы — добавляем отсутствующие (дедуп по album id в url) и
  //    дообогащаем существующие метаданными (тип/лейбл/жанр/лайки/треклист).
  const existingReleases = await prisma.release.findMany({
    where: { artistId: artist.id },
    select: { id: true, url: true, title: true, tracklist: true, releaseType: true },
  });
  const findExisting = (albumId: string, title: string) =>
    existingReleases.find(
      (r) => r.url.includes(`/album/${albumId}`) || r.title.trim().toLowerCase() === title.trim().toLowerCase(),
    );
  // Полная дискография (brief-info — лишь витрина); фолбэк на витрину при сбое.
  let albums: any[] = await fetchAllYmAlbums(ymId);
  if (albums.length === 0) albums = [...(brief.albums ?? []), ...(brief.lastReleases ?? [])];
  const seenAlbumIds = new Set<string>();
  // Треклисты — по одному запросу на альбом: лимит на прогон, чтобы не долбить API.
  let tracklistBudget = 15;
  const getTracklist = async (albumId: string): Promise<any[] | null> => {
    if (tracklistBudget <= 0) return null;
    tracklistBudget--;
    await new Promise((r) => setTimeout(r, 400));
    return fetchYmTracklist(albumId);
  };
  for (const al of albums) {
    const albumId = String(al?.id ?? '');
    const title = String(al?.title ?? '').trim();
    if (!albumId || !title || seenAlbumIds.has(albumId)) continue;
    seenAlbumIds.add(albumId);
    const existing = findExisting(albumId, title);
    if (existing) {
      // Дообогащение: лайки/счётчик — всегда свежие; тип/лейбл/жанр и
      // треклист — только если ещё не заполнены.
      const meta = albumMeta(al);
      const upd: Record<string, unknown> = { trackCount: meta.trackCount, likesCount: meta.likesCount };
      if (!existing.releaseType) {
        upd.releaseType = meta.releaseType;
        if (meta.label) upd.label = meta.label;
        if (meta.genre) upd.genre = meta.genre;
      }
      if (!existing.tracklist) {
        const tracks = await getTracklist(albumId);
        if (tracks) upd.tracklist = tracks;
      }
      await prisma.release.update({ where: { id: existing.id }, data: upd as any });
      continue;
    }
    const tracks = await getTracklist(albumId);
    await prisma.release.create({
      data: {
        artistId: artist.id,
        platform: 'YANDEX_MUSIC',
        url: `https://music.yandex.ru/album/${albumId}`,
        title,
        coverUrl: ymCoverUrl(al.coverUri),
        releaseDate: al.releaseDate ? new Date(al.releaseDate) : undefined,
        ...albumMeta(al),
        ...(tracks ? { tracklist: tracks } : {}),
      } as any,
    });
    summary.newReleases++;
  }

  // 7. Клипы — youtube и яндексовые (у видео в API только название/обложка/embed —
  //    ни длительности, ни даты, обогащать карточку клипа больше нечем).
  const existingClips = await prisma.clip.findMany({
    where: { artistId: artist.id },
    select: { url: true, title: true },
  });
  const haveClip = (url: string, title: string) =>
    existingClips.some(
      (c) => c.url.split('?')[0] === url.split('?')[0] || c.title.trim().toLowerCase() === title.trim().toLowerCase(),
    );
  for (const v of brief.videos ?? []) {
    const provider = String(v?.provider ?? '').toLowerCase();
    const vid = String(v?.providerVideoId ?? '');
    const title = String(v?.title ?? '').trim();
    if (!title) continue;
    // YouTube-клипы и клипы, хостящиеся в самой Яндекс.Музыке (embed-плеер)
    let url = '';
    let platform: 'YOUTUBE' | 'YANDEX_MUSIC' | '' = '';
    if (provider === 'youtube' && vid) {
      url = `https://www.youtube.com/watch?v=${vid}`;
      platform = 'YOUTUBE';
    } else if (provider === 'yandex' && v.embedUrl) {
      url = String(v.embedUrl);
      platform = 'YANDEX_MUSIC';
    } else {
      continue;
    }
    if (haveClip(url, title)) continue;
    await prisma.clip.create({
      data: {
        artistId: artist.id,
        platform,
        url,
        title,
        coverUrl: v.cover ? ymCoverUrl(v.cover) : undefined,
      },
    });
    summary.newClips++;
  }

  // Уведомить владельца о новых импортах — пусть дополнит участников.
  if ((summary.newReleases > 0 || summary.newClips > 0) && artist.submittedById) {
    const parts = [
      summary.newReleases > 0 ? `релизов: ${summary.newReleases}` : null,
      summary.newClips > 0 ? `клипов: ${summary.newClips}` : null,
    ].filter(Boolean).join(', ');
    await notify({
      userId: artist.submittedById,
      type: 'release_import',
      title: `${artist.name}: импорт с Яндекс.Музыки`,
      body: `Добавлено ${parts}. Загляните и укажите участников.`,
      link: `/artist/${artist.id}`,
    });
  }

  return summary;
}

/** Обход всех привязанных артистов (последовательно, с паузами). */
export async function runYandexMusicSync(): Promise<void> {
  const started = Date.now();
  try {
    const artists = await prisma.artist.findMany({
      where: { status: { in: ['VERIFIED', 'APPROVED'] } },
      select: { id: true, name: true, description: true, socialLinks: true, bandLink: true, submittedById: true },
    });
    const linked = artists.filter((a) => extractYmArtistId(((a.socialLinks as any) ?? {}).yandex_music));
    if (linked.length === 0) return;

    let ok = 0;
    let failed = 0;
    let totalReleases = 0;
    let totalClips = 0;
    for (const artist of linked) {
      try {
        const res = await syncArtistFromYandexMusic(artist);
        if (res) {
          ok++;
          totalReleases += res.newReleases;
          totalClips += res.newClips;
        } else {
          failed++;
        }
      } catch (e: any) {
        failed++;
        logger.warn(`YM sync failed for ${artist.name}: ${e?.message}`);
      }
      // Пауза между артистами — не долбим неофициальное API.
      await new Promise((r) => setTimeout(r, 3000));
    }
    const secs = Math.round((Date.now() - started) / 1000);
    try {
      tgLog(
        `🎵 Синк Яндекс.Музыки: артистов ${linked.length}, ок ${ok}, сбоев ${failed}, ` +
        `новых релизов ${totalReleases}, клипов ${totalClips} (${secs}с)`,
      );
    } catch {}
  } catch (e: any) {
    logger.error(`YM sync run failed: ${e?.message}`);
  }
}

/** Планировщик: каждый день в 04:30 МСК (01:30 UTC). */
export function scheduleYandexMusicSync(): void {
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(1, 30, 0, 0); // 04:30 МСК
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();
    setTimeout(async () => {
      await runYandexMusicSync();
      schedule();
    }, delay);
    logger.info(`YM sync scheduled in ${Math.round(delay / 60000)} min`);
  };
  schedule();
}
