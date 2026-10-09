// Визитка артиста («ссылка в био»): площадки «Слушать» и ряд соцсетей из
// socialLinks/bandLink артиста.
//
// Ключи и значения socialLinks — как в components/SocialLinks (там же правило,
// какие площадки вообще разрешены). Сверх ключа площадка уточняется по адресу:
// vk.com/artist/… — это VK Музыка, а не сообщество; zvuk.com в поле «сайт» —
// это Звук. Контактные ключи (phone/email/tg_profile) сюда не попадают никогда
// (гостю их не отдаёт и сервер). Заблокированные платформы (socialPlatforms)
// не показываются, ссылки — только http(s).
import type { ComponentType } from 'react';
import { Globe, Link2, MessageCircle, Music2 } from 'lucide-react';
import { SiApplemusic, SiBandcamp, SiOdnoklassniki, SiSoundcloud, SiSpotify, SiTelegram, SiVk } from 'react-icons/si';
import { ALLOWED_KEYS, CONTACT_KEYS, buildUrl, getSocialService, type SocialKey } from '../SocialLinks';
import { classifyUrl } from '../../lib/socialPlatforms';
import { safeHref } from '../../lib/artistUtils';

/**
 * Цели переходов для статистики визитки. Зеркало белого списка сервера:
 * server/src/lib/artistPageStats.ts (TRACK_TARGETS) — держать в синхроне.
 */
export const TRACK_TARGETS = [
  'yandex_music', 'vk_music', 'zvuk', 'mts_music', 'apple_music', 'spotify',
  'soundcloud', 'deezer', 'bandcamp', 'bandlink',
  'vk', 'telegram', 'ok', 'dzen', 'tenchat', 'rutube', 'website',
  'release', 'tickets',
] as const;
export type TrackTarget = typeof TRACK_TARGETS[number];

type IconCmp = ComponentType<{ className?: string }>;

// ── Иконки без брендового пакета (простые, в цвет текста) ───────────────────

const YandexMusicIcon: IconCmp = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 2.5l2.1 5.4 5.8.4-4.5 3.7 1.5 5.6L12 14.5l-4.9 3.1 1.5-5.6-4.5-3.7 5.8-.4z" />
  </svg>
);

const WaveIcon: IconCmp = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <rect x="3" y="9" width="2.6" height="6" rx="1.3" />
    <rect x="7.4" y="5" width="2.6" height="14" rx="1.3" />
    <rect x="11.8" y="2.5" width="2.6" height="19" rx="1.3" />
    <rect x="16.2" y="6.5" width="2.6" height="11" rx="1.3" />
    <rect x="20.6" y="10" width="1.8" height="4" rx=".9" />
  </svg>
);

const DeezerIcon: IconCmp = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <rect x="1" y="16" width="4.5" height="3" rx=".6" />
    <rect x="6.8" y="16" width="4.5" height="3" rx=".6" />
    <rect x="6.8" y="12" width="4.5" height="3" rx=".6" />
    <rect x="12.6" y="16" width="4.5" height="3" rx=".6" />
    <rect x="12.6" y="12" width="4.5" height="3" rx=".6" />
    <rect x="12.6" y="8" width="4.5" height="3" rx=".6" />
    <rect x="18.4" y="16" width="4.5" height="3" rx=".6" />
    <rect x="18.4" y="12" width="4.5" height="3" rx=".6" />
    <rect x="18.4" y="8" width="4.5" height="3" rx=".6" />
    <rect x="18.4" y="4" width="4.5" height="3" rx=".6" />
  </svg>
);

const DzenIcon: IconCmp = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 1c.3 6.5 1.7 7.9 8.2 8.2v.6C13.7 10.1 12.3 11.5 12 18h-.6c-.3-6.5-1.7-7.9-8.2-8.2v-.6C9.7 8.9 11.1 7.5 11.4 1z" />
  </svg>
);

const RutubeIcon: IconCmp = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="3" />
    <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
  </svg>
);

// ── Каталог ────────────────────────────────────────────────────────────────

export type LinkKind = 'listen' | 'social';

export interface LinkPlatform {
  key: TrackTarget;
  label: string;
  kind: LinkKind;
  /** Фон плитки иконки (бренд) и цвет иконки на нём. */
  bg: string;
  fg: string;
  Icon: IconCmp;
}

// Порядок = порядок показа: площадки — по популярности в РФ, затем соцсети.
const PLATFORMS: LinkPlatform[] = [
  { key: 'yandex_music', label: 'Яндекс Музыка', kind: 'listen', bg: '#FFCC00', fg: '#111111', Icon: YandexMusicIcon },
  { key: 'vk_music',     label: 'VK Музыка',     kind: 'listen', bg: '#0077FF', fg: '#FFFFFF', Icon: SiVk },
  { key: 'zvuk',         label: 'Звук',          kind: 'listen', bg: '#6B4EFF', fg: '#FFFFFF', Icon: WaveIcon },
  { key: 'mts_music',    label: 'МТС Музыка',    kind: 'listen', bg: '#E30611', fg: '#FFFFFF', Icon: Music2 },
  { key: 'apple_music',  label: 'Apple Music',   kind: 'listen', bg: '#FA243C', fg: '#FFFFFF', Icon: SiApplemusic },
  { key: 'spotify',      label: 'Spotify',       kind: 'listen', bg: '#1DB954', fg: '#FFFFFF', Icon: SiSpotify },
  { key: 'soundcloud',   label: 'SoundCloud',    kind: 'listen', bg: '#FF5500', fg: '#FFFFFF', Icon: SiSoundcloud },
  { key: 'deezer',       label: 'Deezer',        kind: 'listen', bg: '#A238FF', fg: '#FFFFFF', Icon: DeezerIcon },
  { key: 'bandcamp',     label: 'Bandcamp',      kind: 'listen', bg: '#1DA0C3', fg: '#FFFFFF', Icon: SiBandcamp },
  { key: 'bandlink',     label: 'Bandlink',      kind: 'listen', bg: '#7C3AED', fg: '#FFFFFF', Icon: Link2 },
  { key: 'vk',           label: 'ВКонтакте',     kind: 'social', bg: '#0077FF', fg: '#FFFFFF', Icon: SiVk },
  { key: 'telegram',     label: 'Telegram',      kind: 'social', bg: '#229ED9', fg: '#FFFFFF', Icon: SiTelegram },
  { key: 'ok',           label: 'Одноклассники', kind: 'social', bg: '#EE8208', fg: '#FFFFFF', Icon: SiOdnoklassniki },
  { key: 'dzen',         label: 'Дзен',          kind: 'social', bg: '#000000', fg: '#FFFFFF', Icon: DzenIcon },
  { key: 'rutube',       label: 'RuTube',        kind: 'social', bg: '#14191F', fg: '#FFFFFF', Icon: RutubeIcon },
  { key: 'tenchat',      label: 'TenChat',       kind: 'social', bg: '#5B6CF9', fg: '#FFFFFF', Icon: MessageCircle },
  { key: 'website',      label: 'Сайт',          kind: 'social', bg: '#0D9488', fg: '#FFFFFF', Icon: Globe },
];
const BY_KEY = new Map(PLATFORMS.map((p) => [p.key, p]));
const ORDER = new Map(PLATFORMS.map((p, i) => [p.key, i]));

export function platformByKey(key: string): LinkPlatform | undefined {
  return BY_KEY.get(key as TrackTarget);
}

/** Подпись цели перехода (для статистики). */
export function targetLabel(target: string): string {
  if (target === 'release') return 'Последний релиз';
  if (target === 'tickets') return 'Билеты на концерты';
  return platformByKey(target)?.label ?? target;
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

/** Площадка по адресу ссылки (или null — «просто сайт»). */
export function detectPlatform(url: string): TrackTarget | null {
  let host: string;
  let path: string;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase().replace(/^www\./, '');
    path = u.pathname.toLowerCase();
  } catch {
    return null;
  }
  const any = (...domains: string[]) => domains.some((d) => hostMatches(host, d));
  if (any('music.yandex.ru', 'music.yandex.com', 'music.yandex.by', 'music.yandex.kz', 'music.yandex.uz')) return 'yandex_music';
  if (any('music.vk.com', 'boom.ru')) return 'vk_music';
  // vk.com/artist/…, /music/…, /audios123 (аудиозаписи), /playlist/… — VK Музыка.
  if (any('vk.com', 'vk.ru') && /^\/(artist|music|audios?|playlist)([/_\-\d]|$)/.test(path)) return 'vk_music';
  if (any('zvuk.com', 'sber-zvuk.com')) return 'zvuk';
  if (any('music.mts.ru')) return 'mts_music';
  if (any('music.apple.com', 'itunes.apple.com')) return 'apple_music';
  if (any('spotify.com', 'spotify.link')) return 'spotify';
  if (any('soundcloud.com')) return 'soundcloud';
  if (any('deezer.com', 'deezer.page.link')) return 'deezer';
  if (any('bandcamp.com')) return 'bandcamp';
  if (any('band.link', 'bandlink.ru')) return 'bandlink';
  if (any('vk.com', 'vk.ru', 'vk.cc')) return 'vk';
  if (any('t.me', 'telegram.me')) return 'telegram';
  if (any('ok.ru')) return 'ok';
  if (any('dzen.ru', 'zen.yandex.ru')) return 'dzen';
  if (any('rutube.ru')) return 'rutube';
  if (any('tenchat.ru')) return 'tenchat';
  return null;
}

export interface ArtistLink {
  platform: LinkPlatform;
  url: string;
  /** Подпись для «Сайта» — домен (taplink.cc, band-site.ru). */
  title: string;
}

function hostLabel(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/**
 * Ссылки визитки из socialLinks (+ bandLink): площадки «Слушать» (по одной на
 * площадку) и соцсети, в порядке каталога. Контакты и запрещённые платформы
 * отброшены; повторяющиеся адреса — один раз.
 */
export function collectArtistLinks(
  socialLinks: unknown,
  bandLink?: string | null,
): { listen: ArtistLink[]; social: ArtistLink[] } {
  const raw: Record<string, unknown> =
    socialLinks && typeof socialLinks === 'object' && !Array.isArray(socialLinks) ? (socialLinks as Record<string, unknown>) : {};
  const candidates: Array<{ key: string; url: string }> = [];
  for (const [key, value] of Object.entries(raw)) {
    if ((CONTACT_KEYS as string[]).includes(key) || !ALLOWED_KEYS.has(key)) continue;
    const url = buildUrl(getSocialService(key as SocialKey), value);
    if (url) candidates.push({ key, url });
  }
  if (typeof bandLink === 'string' && bandLink.trim()) candidates.push({ key: 'website', url: bandLink.trim() });

  const seenKeys = new Set<string>();
  const seenUrls = new Set<string>();
  const out: ArtistLink[] = [];
  for (const c of candidates) {
    const href = safeHref(c.url);
    if (!href || classifyUrl(href).status !== 'allowed') continue;
    const norm = href.replace(/\/+$/, '').toLowerCase();
    if (seenUrls.has(norm)) continue;
    const key = detectPlatform(href) ?? (platformByKey(c.key) ? (c.key as TrackTarget) : 'website');
    const platform = BY_KEY.get(key)!;
    // Площадку показываем один раз; «Сайтов» может быть два (сайт + страница-мультиссылка).
    if (key !== 'website' && seenKeys.has(key)) continue;
    if (key === 'website' && out.filter((l) => l.platform.key === 'website').length >= 2) continue;
    seenKeys.add(key);
    seenUrls.add(norm);
    out.push({ platform, url: href, title: key === 'website' ? hostLabel(href) : platform.label });
  }
  out.sort((a, b) => (ORDER.get(a.platform.key) ?? 99) - (ORDER.get(b.platform.key) ?? 99));
  return {
    listen: out.filter((l) => l.platform.kind === 'listen'),
    social: out.filter((l) => l.platform.kind === 'social'),
  };
}
