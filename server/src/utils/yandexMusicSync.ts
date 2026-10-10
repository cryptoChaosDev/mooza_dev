import https from 'https';
import { prisma } from '../index';
import logger from './logger';
import { tgLog } from './telegram';
import { notify } from './notify';
import { isUniqueViolation } from '../lib/artistAccess';
import {
  YM_SOURCE,
  ymAlbumIdFromUrl,
  clipExternalId,
  normalizeImportedReleaseDate,
  safeImportedCover,
} from '../lib/mediaItems';

/**
 * Ночная синхронизация с Яндекс.Музыкой.
 *
 * «Привязка» — ссылка на страницу артиста в контактах (socialLinks.yandex_music,
 * формат https://music.yandex.ru/artist/<id>), денормализованная в Artist.ymId
 * (уникален между артистами; у VERIFIED/APPROVED меняется только через
 * поддержку). Раз в сутки для всех привязанных проверенных артистов тянем
 * публичное brief-info (неофициальное API, работает с РФ-IP без ключей) и обновляем:
 *  - listeners  — всегда (это метрика «слушателей за месяц»);
 *  - description/контакты — только пустые и только один раз (очищенное
 *    пользователем не восстанавливается, см. computeAutofill);
 *  - релизы/клипы — ДОБАВЛЯЕМ отсутствующие (дедуп по точному id альбома/видео,
 *    ключ externalSource+externalId), удалённые пользователем не воскрешаем
 *    (DismissedMediaItem); участники не проставляются — владельцам уходит
 *    уведомление, они дополнят кредиты.
 *
 * API неофициальное: любой сбой одного артиста не прерывает обход, итог — в TG-лог.
 *
 * Плюс разовый синк одной карточки — сразу после создания, привязки ссылки или
 * верификации (syncArtistNow), в т.ч. непроверенной: данные появляются сразу,
 * а не следующей ночью. Ночной обход — по-прежнему только проверенные.
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
    // Концерты — только нужные поля; ссылки — только http(s) (карточка рендерит
    // их как <a href>, javascript:/data: из внешних данных недопустимы).
    concerts: (Array.isArray(brief.concerts) ? brief.concerts : []).slice(0, 10).map((c: any) => {
      const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : undefined);
      const link = (v: unknown) => (typeof v === 'string' && /^https?:\/\//i.test(v) ? v.slice(0, 1000) : undefined);
      return {
        concertTitle: str(c?.concertTitle),
        title: str(c?.title),
        datetime: str(c?.datetime),
        date: str(c?.date),
        city: str(c?.city),
        place: str(c?.place),
        address: str(c?.address),
        afishaUrl: link(c?.afishaUrl),
        url: link(c?.url),
      };
    }),
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
 * Автозаполнение контактов/описания артиста из данных ЯМ.
 *
 *  - Заполняется только ПУСТОЕ поле и только ОДИН раз за всю жизнь артиста:
 *    поле помечается в ymData.autofilled; если пользователь потом очистил его,
 *    синк его больше не восстанавливает. Поле, у которого на момент синка уже
 *    есть значение (ручное или старое автозаполнение), тоже помечается — его
 *    очистка пользователем тоже окончательна.
 *  - Ключи socialLinks — как в client/src/components/SocialLinks.tsx.
 *  - Только http(s)-ссылки (ЯМ-данные — внешний ввод).
 */
type AutofillPatch = { socialLinks?: Record<string, string>; bandLink?: string; description?: string };

function isHttpLink(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function computeAutofill(
  fresh: { socialLinks: unknown; bandLink: string | null; description: string | null },
  done: Set<string>,
  ymLinks: { href: string; type: string; socialNetwork: string | null }[],
  ymDescription: string | null,
): { patch: AutofillPatch; done: Set<string> } {
  const sl = fresh.socialLinks;
  const current: Record<string, string> =
    sl && typeof sl === 'object' && !Array.isArray(sl) ? { ...(sl as Record<string, string>) } : {};
  const nextDone = new Set(done);
  // Всё, что сейчас заполнено, считается «уже было» — после очистки не вернём.
  for (const [k, v] of Object.entries(current)) if (v) nextDone.add(`socialLinks.${k}`);
  if (fresh.bandLink) nextDone.add('bandLink');
  if (fresh.description) nextDone.add('description');

  const patch: AutofillPatch = {};
  const NETWORK_TO_KEY: Record<string, string> = { vk: 'vk', bandlink: 'bandlink' };
  let linksChanged = false;
  const fill = (key: string, href: string) => {
    const mark = `socialLinks.${key}`;
    if (current[key] || nextDone.has(mark) || !isHttpLink(href)) return;
    current[key] = href;
    nextDone.add(mark);
    linksChanged = true;
  };
  for (const l of ymLinks) {
    if (l.type === 'official') {
      fill('website', l.href);
      continue;
    }
    const key = l.socialNetwork ? NETWORK_TO_KEY[l.socialNetwork] : undefined;
    if (key) fill(key, l.href);
    if (l.socialNetwork === 'bandlink' && !fresh.bandLink && !nextDone.has('bandLink') && isHttpLink(l.href)) {
      patch.bandLink = l.href;
      nextDone.add('bandLink');
    }
  }
  if (linksChanged) patch.socialLinks = current;
  if (ymDescription && !fresh.description && !nextDone.has('description')) {
    patch.description = ymDescription;
    nextDone.add('description');
  }
  return { patch, done: nextDone };
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

/** Клип из brief.videos → url/платформа/ключ, либо null (неподдерживаемый провайдер). */
function ymVideoToClip(v: any): { url: string; platform: 'YOUTUBE' | 'YANDEX_MUSIC'; externalId: string } | null {
  const provider = String(v?.provider ?? '').toLowerCase();
  const vid = String(v?.providerVideoId ?? '');
  let url = '';
  let platform: 'YOUTUBE' | 'YANDEX_MUSIC';
  if (provider === 'youtube' && /^[A-Za-z0-9_-]{6,20}$/.test(vid)) {
    url = `https://www.youtube.com/watch?v=${vid}`;
    platform = 'YOUTUBE';
  } else if (provider === 'yandex' && typeof v?.embedUrl === 'string' && /^https:\/\/frontend\.vh\.yandex\.ru\//i.test(v.embedUrl)) {
    url = String(v.embedUrl);
    platform = 'YANDEX_MUSIC';
  } else {
    return null;
  }
  const externalId = clipExternalId(url);
  return externalId ? { url, platform, externalId } : null;
}

/**
 * Синк одного артиста. Возвращает сводку изменений (для лога) или null, если
 * артист не привязан / ЯМ не ответила / привязку сменили во время прогона.
 */
export async function syncArtistFromYandexMusic(
  artist: {
    id: string;
    name: string;
    ymId: string | null;
  },
  // allowUnverified — разовый синк (syncArtistNow): работает и для непроверенной карточки.
  opts: { allowUnverified?: boolean } = {},
): Promise<{ listeners?: number; newReleases: number; newClips: number } | null> {
  const ymId = artist.ymId;
  if (!ymId) return null;

  const brief = await fetchBrief(ymId);
  if (!brief?.artist) return null;

  const summary = { listeners: undefined as number | undefined, newReleases: 0, newClips: 0 };

  // 1–4. Карточка артиста. Перечитываем артиста ПРЯМО перед записью и пишем
  // условно по updatedAt (оптимистичная блокировка): правка пользователя,
  // случившаяся между чтением и записью, не теряется — пересчитываем патч.
  const listeners = brief.stats?.lastMonthListeners;
  const ymDescRaw = brief.artist.description?.text ?? brief.artist.description;
  const ymDescription = typeof ymDescRaw === 'string' && ymDescRaw.trim() ? ymDescRaw.trim().slice(0, 4000) : null;
  const vitrine = buildYmData(brief);
  let written = false;
  for (let attempt = 0; attempt < 3 && !written; attempt++) {
    const fresh = await prisma.artist.findUnique({
      where: { id: artist.id },
      select: { ymId: true, status: true, socialLinks: true, bandLink: true, description: true, ymData: true, updatedAt: true },
    });
    // Привязку сменили/артиста сняли с публикации, пока шёл обход — не трогаем.
    const statusOk = opts.allowUnverified || fresh?.status === 'VERIFIED' || fresh?.status === 'APPROVED';
    if (!fresh || fresh.ymId !== ymId || !statusOk) return null;

    const prevDone: string[] = Array.isArray((fresh.ymData as any)?.autofilled) ? (fresh.ymData as any).autofilled : [];
    const { patch: autofill, done } = computeAutofill(fresh, new Set(prevDone), (vitrine as any).links, ymDescription);

    const patch: Record<string, unknown> = {
      // Витрина ЯМ (ссылки, похожие, топ-треки, фото, концерты, плейлист) +
      // служебный список полей, которые синк уже заполнял (наружу не отдаётся).
      ymData: { ...vitrine, autofilled: [...done] },
      ...autofill,
    };
    // Слушатели за месяц + дельта — метрика, обновляем всегда.
    if (typeof listeners === 'number' && listeners >= 0) {
      patch.listeners = BigInt(listeners);
      summary.listeners = listeners;
      const delta = brief.stats?.lastMonthListenersDelta;
      if (typeof delta === 'number') patch.listenersDelta = delta;
    }

    const { count } = await prisma.artist.updateMany({
      where: { id: artist.id, updatedAt: fresh.updatedAt, ymId },
      data: patch as any,
    });
    written = count > 0;
  }
  if (!written) return null;

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

  // «Надгробия»: импортированные элементы, удалённые пользователем, — не воскрешаем.
  const dismissed = await prisma.dismissedMediaItem.findMany({
    where: { artistId: artist.id, externalSource: YM_SOURCE },
    select: { kind: true, externalId: true },
  });
  const dismissedReleases = new Set(dismissed.filter((d) => d.kind === 'release').map((d) => d.externalId));
  const dismissedClips = new Set(dismissed.filter((d) => d.kind === 'clip').map((d) => d.externalId));

  // 6. Релизы — добавляем отсутствующие и дообогащаем существующие. Совпадение —
  //    ТОЛЬКО по точному id альбома (ключ импорта или id из ссылки): ни подстрока
  //    url (/album/123 ≠ /album/1234), ни название (ручной «Intro» не получит
  //    чужой треклист).
  const existingReleases = await prisma.release.findMany({
    where: { artistId: artist.id },
    select: { id: true, url: true, externalSource: true, externalId: true, tracklist: true, releaseType: true },
  });
  const releaseByAlbum = new Map<string, (typeof existingReleases)[number]>();
  for (const r of existingReleases) {
    const key = r.externalSource === YM_SOURCE && r.externalId ? r.externalId : ymAlbumIdFromUrl(r.url);
    if (key && !releaseByAlbum.has(key)) releaseByAlbum.set(key, r);
  }
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
    const title = String(al?.title ?? '').trim().slice(0, 300);
    if (!/^\d+$/.test(albumId) || !title || seenAlbumIds.has(albumId)) continue;
    seenAlbumIds.add(albumId);
    if (dismissedReleases.has(albumId)) continue;
    const existing = releaseByAlbum.get(albumId);
    const meta = albumMeta(al);
    if (existing) {
      // Дообогащение: лайки/счётчик — всегда свежие; тип/лейбл/жанр и
      // треклист — только если ещё не заполнены.
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
      // Ручной релиз с точной ссылкой на этот альбом получает ключ импорта.
      if (!existing.externalId) {
        upd.externalSource = YM_SOURCE;
        upd.externalId = albumId;
      }
      try {
        await prisma.release.update({ where: { id: existing.id }, data: upd as any });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
      continue;
    }
    const tracks = await getTracklist(albumId);
    const data = {
      artistId: artist.id,
      platform: 'YANDEX_MUSIC' as const,
      url: `https://music.yandex.ru/album/${albumId}`,
      title,
      coverUrl: safeImportedCover(ymCoverUrl(al.coverUri)),
      releaseDate: normalizeImportedReleaseDate(al.releaseDate),
      externalSource: YM_SOURCE,
      externalId: albumId,
      ...meta,
      ...(tracks ? { tracklist: tracks } : {}),
    };
    // Уникальный ключ (artistId, externalSource, externalId): параллельный прогон
    // или ручное добавление того же альбома не создают дубль.
    const created = await prisma.release.createMany({ data: [data as any], skipDuplicates: true });
    if (created.count > 0) summary.newReleases++;
  }

  // 7. Клипы — youtube и яндексовые (у видео в API только название/обложка/embed —
  //    ни длительности, ни даты, обогащать карточку клипа больше нечем).
  const existingClips = await prisma.clip.findMany({
    where: { artistId: artist.id },
    select: { url: true, externalSource: true, externalId: true },
  });
  const haveClip = new Set<string>();
  for (const c of existingClips) {
    const key = c.externalSource === YM_SOURCE && c.externalId ? c.externalId : clipExternalId(c.url);
    if (key) haveClip.add(key);
  }
  for (const v of brief.videos ?? []) {
    const title = String(v?.title ?? '').trim().slice(0, 300);
    if (!title) continue;
    const clip = ymVideoToClip(v);
    if (!clip || haveClip.has(clip.externalId) || dismissedClips.has(clip.externalId)) continue;
    haveClip.add(clip.externalId);
    const created = await prisma.clip.createMany({
      data: [{
        artistId: artist.id,
        platform: clip.platform,
        url: clip.url,
        title,
        coverUrl: v.cover ? safeImportedCover(ymCoverUrl(v.cover)) : undefined,
        externalSource: YM_SOURCE,
        externalId: clip.externalId,
      }],
      skipDuplicates: true,
    });
    if (created.count > 0) summary.newClips++;
  }

  // Уведомить ТЕКУЩИХ владельцев о новых импортах — пусть дополнят участников.
  if (summary.newReleases > 0 || summary.newClips > 0) {
    const parts = [
      summary.newReleases > 0 ? `релизов: ${summary.newReleases}` : null,
      summary.newClips > 0 ? `клипов: ${summary.newClips}` : null,
    ].filter(Boolean).join(', ');
    const owners = await prisma.userArtist.findMany({
      where: { artistId: artist.id, isOwner: true, inviteStatus: 'ACCEPTED' },
      select: { userId: true },
    });
    for (const o of owners) {
      await notify({
        userId: o.userId,
        type: 'release_import',
        title: `${artist.name}: импорт с Яндекс.Музыки`,
        body: `Добавлено ${parts}. Загляните и укажите участников.`,
        link: `/artist/${artist.id}`,
      });
    }
  }

  return summary;
}

// Разовый синк одной карточки — сразу после создания, привязки ссылки на ЯМ или
// верификации, не дожидаясь ночного обхода. Не больше одного прогона на артиста
// одновременно (повторный вызов, пока идёт первый, — пропускается). Never throws.
// Вызывающие не ждут (void): ответ пользователю не зависит от API Яндекса.
const syncNowInFlight = new Set<string>();

export async function syncArtistNow(artistId: string, reason: 'created' | 'linked' | 'verified'): Promise<void> {
  if (syncNowInFlight.has(artistId)) return;
  syncNowInFlight.add(artistId);
  try {
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: { id: true, name: true, ymId: true },
    });
    if (!artist?.ymId) return;
    const res = await syncArtistFromYandexMusic(artist, { allowUnverified: true });
    logger.info(
      `YM sync now (${reason}) «${artist.name}»: ` +
      (res ? `слушателей ${res.listeners ?? '—'}, релизов +${res.newReleases}, клипов +${res.newClips}` : 'пропущен'),
    );
  } catch (e: any) {
    logger.warn(`YM sync now (${reason}) failed for ${artistId}: ${e?.message}`);
  } finally {
    syncNowInFlight.delete(artistId);
  }
}

// Защита от параллельных прогонов (ночной джоб + ручной POST /admin/ym-sync +
// несколько инстансов API): флаг в процессе + advisory-lock Postgres на время
// всего обхода. Лок транзакционный (pg_try_advisory_xact_lock) внутри
// интерактивной транзакции — держится на одном соединении пула и гарантированно
// снимается при её завершении (в т.ч. при падении процесса).
const YM_SYNC_LOCK_KEY = 0x6d6f6f7a61; // «mooza», произвольная константа
const YM_SYNC_MAX_MS = 3 * 60 * 60 * 1000;
let ymSyncRunning = false;

/** Обход всех привязанных артистов (последовательно, с паузами). */
export async function runYandexMusicSync(): Promise<void> {
  if (ymSyncRunning) {
    logger.warn('YM sync: previous run is still in progress — skipped');
    return;
  }
  ymSyncRunning = true;
  try {
    await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${YM_SYNC_LOCK_KEY}::bigint) AS locked`;
        if (!rows[0]?.locked) {
          logger.warn('YM sync: another run holds the lock — skipped');
          return;
        }
        await runYandexMusicSyncLocked();
      },
      { maxWait: 10_000, timeout: YM_SYNC_MAX_MS },
    );
  } catch (e: any) {
    logger.error(`YM sync run failed: ${e?.message}`);
  } finally {
    ymSyncRunning = false;
  }
}

async function runYandexMusicSyncLocked(): Promise<void> {
  const started = Date.now();
  try {
    const linked = await prisma.artist.findMany({
      where: { status: { in: ['VERIFIED', 'APPROVED'] }, ymId: { not: null } },
      select: { id: true, name: true, ymId: true },
    });
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
