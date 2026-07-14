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
function fetchBrief(ymId: string): Promise<any | null> {
  return new Promise((resolve) => {
    const req = https.get(
      {
        host: 'api.music.yandex.net',
        path: `/artists/${ymId}/brief-info`,
        headers: { 'User-Agent': YM_UA },
        timeout: 20_000,
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
            resolve(JSON.parse(body)?.result ?? null);
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

// coverUri вида "avatars.yandex.net/get-music-content/.../%%" → https-URL 400x400
function ymCover(coverUri: string | undefined | null): string | undefined {
  if (!coverUri) return undefined;
  return `https://${String(coverUri).replace('%%', '400x400')}`;
}

/** Синк одного артиста. Возвращает сводку изменений (для лога). */
export async function syncArtistFromYandexMusic(artist: {
  id: string;
  name: string;
  description: string | null;
  socialLinks: unknown;
  submittedById: string | null;
}): Promise<{ listeners?: number; newReleases: number; newClips: number } | null> {
  const links = (artist.socialLinks as Record<string, string> | null) ?? {};
  const ymId = extractYmArtistId(links.yandex_music);
  if (!ymId) return null;

  const brief = await fetchBrief(ymId);
  if (!brief?.artist) return null;

  const summary = { listeners: undefined as number | undefined, newReleases: 0, newClips: 0 };

  // 1. Слушатели за месяц — метрика, обновляем всегда.
  const listeners = brief.stats?.lastMonthListeners;
  const patch: Record<string, unknown> = {};
  if (typeof listeners === 'number' && listeners >= 0) {
    patch.listeners = BigInt(listeners);
    summary.listeners = listeners;
  }
  // 2. Описание — только если у нас пусто.
  const ymDesc = brief.artist.description?.text ?? brief.artist.description;
  if (!artist.description && typeof ymDesc === 'string' && ymDesc.trim()) {
    patch.description = ymDesc.trim().slice(0, 4000);
  }
  if (Object.keys(patch).length > 0) {
    await prisma.artist.update({ where: { id: artist.id }, data: patch as any });
  }

  // 3. Релизы — добавляем отсутствующие (дедуп по album id в url).
  const existingReleases = await prisma.release.findMany({
    where: { artistId: artist.id },
    select: { url: true, title: true },
  });
  const haveAlbum = (albumId: string, title: string) =>
    existingReleases.some(
      (r) => r.url.includes(`/album/${albumId}`) || r.title.trim().toLowerCase() === title.trim().toLowerCase(),
    );
  const albums: any[] = [...(brief.albums ?? []), ...(brief.lastReleases ?? [])];
  const seenAlbumIds = new Set<string>();
  for (const al of albums) {
    const albumId = String(al?.id ?? '');
    const title = String(al?.title ?? '').trim();
    if (!albumId || !title || seenAlbumIds.has(albumId) || haveAlbum(albumId, title)) continue;
    seenAlbumIds.add(albumId);
    await prisma.release.create({
      data: {
        artistId: artist.id,
        platform: 'YANDEX_MUSIC',
        url: `https://music.yandex.ru/album/${albumId}`,
        title,
        coverUrl: ymCover(al.coverUri),
        releaseDate: al.releaseDate ? new Date(al.releaseDate) : undefined,
      },
    });
    summary.newReleases++;
  }

  // 4. Клипы — только с провайдером youtube (наш enum: VK_VIDEO/RUTUBE/YOUTUBE/APPLE_MUSIC).
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
    if (provider !== 'youtube' || !vid || !title) continue;
    const url = `https://www.youtube.com/watch?v=${vid}`;
    if (haveClip(url, title)) continue;
    await prisma.clip.create({
      data: {
        artistId: artist.id,
        platform: 'YOUTUBE',
        url,
        title,
        coverUrl: v.cover ? ymCover(v.cover) : undefined,
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
      select: { id: true, name: true, description: true, socialLinks: true, submittedById: true },
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
