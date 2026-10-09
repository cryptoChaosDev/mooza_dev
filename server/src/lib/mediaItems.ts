// Общая валидация релизов и клипов (routes/releases.ts, routes/clips.ts) и
// ключи дедупликации импортированных элементов (utils/yandexMusicSync.ts).
import { prisma } from '../index';
import { resolveRoleIds } from './artistAccess';

/** Сколько участников можно указать у одного релиза/клипа. */
export const MAX_MEDIA_PARTICIPANTS = 50;

/** Пространство ключей импорта (externalSource) — каталог, из которого пришёл элемент. */
export const YM_SOURCE = 'yandex_music';

export type Fail = { ok: false; error: string };

// ── Дата релиза ──────────────────────────────────────────────────────────────
// Храним КАЛЕНДАРНУЮ дату: полдень UTC выбранного дня. Так дата не «съезжает»
// на день ни при выводе в любом часовом поясе (клиент выводит с timeZone UTC),
// ни при slice(0, 10) от ISO-строки. ЯМ отдаёт «2019-03-15T00:00:00+03:00» —
// берём именно календарные цифры строки (15-е), а не UTC-момент (14-е, 21:00).

/** Календарная дата (YYYY-MM-DD в начале строки) → Date в полдень UTC; null если не дата. */
export function calendarDateFromString(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(raw.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  // Отсекаем «31.02» и т.п.: Date.UTC молча переносит переполнение.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** Последний допустимый день: «сегодня» по Москве + 1 день запаса на восточные пояса. */
function latestAllowedDate(): Date {
  const msk = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() + 1, 12, 0, 0));
}

/** Дата для импорта (синк/каталоги): невалидная или будущая → null (без ошибки). */
export function normalizeImportedReleaseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw) return null;
  const dt = calendarDateFromString(raw);
  if (!dt || dt.getUTCFullYear() < 1900 || dt.getTime() > latestAllowedDate().getTime()) return null;
  return dt;
}

/** Дата из формы: null/'' → null; иначе реальная дата, не раньше 1900 и не в будущем. */
export function parseReleaseDateInput(raw: unknown): { ok: true; value: Date | null } | Fail {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Некорректная дата релиза' };
  const dt = calendarDateFromString(raw);
  if (!dt) return { ok: false, error: 'Некорректная дата релиза' };
  if (dt.getUTCFullYear() < 1900) return { ok: false, error: 'Дата релиза не может быть раньше 1900 года' };
  if (dt.getTime() > latestAllowedDate().getTime()) {
    return { ok: false, error: 'Дата релиза не может быть позже сегодняшнего дня' };
  }
  return { ok: true, value: dt };
}

// ── Обложка ──────────────────────────────────────────────────────────────────
// Только https и только хосты стримингов/их CDN (то, что отдают ЯМ/каталоги и
// og:image платформ), либо наши /uploads/. Никаких javascript:/data:/http-трекеров.
const COVER_HOST_SUFFIXES = [
  'yandex.net', 'yandex.ru',
  'mzstatic.com',
  'dzcdn.net',
  'ytimg.com', 'youtube.com', 'ggpht.com',
  'userapi.com', 'vkuserphoto.ru', 'vk.com', 'vk.ru', 'vkvideo.ru', 'mycdn.me', 'okcdn.ru',
  'scdn.co', 'spotifycdn.com',
  'rutube.ru', 'rutubelist.ru',
  'wikimedia.org',
  'moooza.ru',
];

export function isAllowedCoverUrl(raw: string): boolean {
  const s = raw.trim();
  if (/^\/uploads\/[\w\-./]+$/.test(s) && !s.includes('..')) return true;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    return COVER_HOST_SUFFIXES.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

/** Обложка из формы: null/'' → null; иначе https-URL с разрешённого хоста. */
export function parseCoverUrlInput(raw: unknown): { ok: true; value: string | null } | Fail {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Некорректная ссылка на обложку' };
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  if (s.length > 1000 || !isAllowedCoverUrl(s)) {
    return { ok: false, error: 'Обложка — только https-ссылка с Яндекс Музыки, Apple Music, VK, YouTube, Spotify, Rutube' };
  }
  return { ok: true, value: s };
}

/** Обложка из импорта: невалидная → undefined (просто без обложки). */
export function safeImportedCover(raw: unknown): string | undefined {
  return typeof raw === 'string' && isAllowedCoverUrl(raw) ? raw.trim() : undefined;
}

// ── Название ─────────────────────────────────────────────────────────────────
export function parseTitleInput(raw: unknown, emptyError: string): { ok: true; value: string } | Fail {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: emptyError };
  const s = raw.trim();
  if (s.length > 300) return { ok: false, error: 'Название не длиннее 300 символов' };
  return { ok: true, value: s };
}

// ── Ключи импорта ────────────────────────────────────────────────────────────

/** id альбома ЯМ из ссылки ТОЧНО (…/album/123, …/album/123/track/4); /album/1234 ≠ 123. */
export function ymAlbumIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(String(url).trim());
    if (!/(^|\.)music\.yandex\.[a-z]+$/i.test(u.hostname)) return null;
    const m = /^\/album\/(\d+)(?:\/|$)/.exec(u.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Ключ дедупликации релиза по ссылке: только ссылка ровно на альбом ЯМ. */
export function releaseExternalKey(url: string): { externalSource: string; externalId: string } | null {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)music\.yandex\.[a-z]+$/i.test(u.hostname)) return null;
    const m = /^\/album\/(\d+)\/?$/.exec(u.pathname);
    return m ? { externalSource: YM_SOURCE, externalId: m[1] } : null;
  } catch {
    return null;
  }
}

/** Ключ клипа: YouTube-видео → 'youtube:<id>', плеер ЯМ → 'yandex:<url без query>'. */
export function clipExternalId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
    if (host === 'youtube.com' && u.pathname === '/watch') {
      const v = u.searchParams.get('v');
      return v && /^[A-Za-z0-9_-]{6,20}$/.test(v) ? `youtube:${v}` : null;
    }
    if (host === 'youtu.be') {
      const v = u.pathname.slice(1);
      return /^[A-Za-z0-9_-]{6,20}$/.test(v) ? `youtube:${v}` : null;
    }
    if (host === 'frontend.vh.yandex.ru') return `yandex:${url.trim().split('?')[0]}`;
    return null;
  } catch {
    return null;
  }
}

export function clipExternalKey(url: string): { externalSource: string; externalId: string } | null {
  const id = clipExternalId(url);
  return id ? { externalSource: YM_SOURCE, externalId: id } : null;
}

// ── Участники ────────────────────────────────────────────────────────────────
export interface CleanParticipant { userId: string; roleIds: string[] }

/**
 * Участники из формы: массив ≤ MAX_MEDIA_PARTICIPANTS, дубли userId склеиваются,
 * пользователи существуют и не заблокированы, роли — из каталога нужного контекста.
 */
export async function parseParticipantsInput(
  raw: unknown,
  context: 'RELEASE' | 'CLIP',
): Promise<{ ok: true; value: CleanParticipant[] } | Fail> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'Некорректный список участников' };
  const byUser = new Map<string, Set<string>>();
  for (const p of raw) {
    if (!p || typeof p !== 'object' || typeof (p as any).userId !== 'string' || !(p as any).userId) {
      return { ok: false, error: 'Некорректный список участников' };
    }
    const roleIds = (p as any).roleIds;
    if (roleIds !== undefined && roleIds !== null && !Array.isArray(roleIds)) {
      return { ok: false, error: 'Некорректные роли участника' };
    }
    const set = byUser.get((p as any).userId) ?? new Set<string>();
    for (const r of (roleIds ?? []) as unknown[]) {
      if (typeof r !== 'string' || !r) return { ok: false, error: 'Некорректные роли участника' };
      set.add(r);
    }
    byUser.set((p as any).userId, set);
  }
  if (byUser.size > MAX_MEDIA_PARTICIPANTS) {
    return { ok: false, error: `Не больше ${MAX_MEDIA_PARTICIPANTS} участников` };
  }
  const userIds = [...byUser.keys()];
  if (userIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, isBlocked: true },
    });
    if (users.length !== userIds.length) return { ok: false, error: 'Один из участников не найден' };
    if (users.some((u) => u.isBlocked)) return { ok: false, error: 'Нельзя указать заблокированного пользователя' };
  }
  const allRoles = [...new Set([...byUser.values()].flatMap((s) => [...s]))];
  const validRoles = await resolveRoleIds(allRoles, context, 500);
  if (validRoles === null) return { ok: false, error: 'Указана несуществующая роль' };
  return {
    ok: true,
    value: userIds.map((userId) => ({ userId, roleIds: [...byUser.get(userId)!] })),
  };
}

/**
 * Посторонних (не подтверждённых участников состава) отмечать в кредитах может
 * только артист, прошедший модерацию (APPROVED/VERIFIED) — иначе черновик-
 * однодневка мог бы рассылать уведомления «подтвердите участие» кому угодно.
 * Возвращает текст ошибки или null.
 */
export async function checkOutsiderParticipants(artistId: string, userIds: string[]): Promise<string | null> {
  if (!userIds.length) return null;
  const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { status: true } });
  if (artist && (artist.status === 'APPROVED' || artist.status === 'VERIFIED')) return null;
  const members = await prisma.userArtist.findMany({
    where: { artistId, inviteStatus: 'ACCEPTED', userId: { in: userIds } },
    select: { userId: true },
  });
  const memberIds = new Set(members.map((m) => m.userId));
  if (userIds.every((id) => memberIds.has(id))) return null;
  return 'Пока артист не прошёл модерацию, участниками можно отметить только участников состава';
}
