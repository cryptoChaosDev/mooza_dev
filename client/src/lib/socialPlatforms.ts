/**
 * Centralized social-platform allow/block list — SINGLE SOURCE OF TRUTH.
 *
 * This file is mirrored verbatim in:
 *   - client/src/lib/socialPlatforms.ts
 *   - server/src/utils/socialPlatforms.ts
 *
 * KEEP BOTH COPIES IN SYNC. When a platform is added/removed/reclassified,
 * update both files identically. Dependency-free (uses the global URL).
 */

export const BLOCK_MESSAGE =
  'Верификация через эту платформу недоступна. Вставьте ссылку на другой ресурс.';

export interface AllowedPlatform {
  key: string;
  label: string;
  type: string;
  domains: string[];
}

export interface BlockedPlatform {
  key: string;
  label: string;
  domains: string[];
}

export const ALLOWED_PLATFORMS: AllowedPlatform[] = [
  { key: 'vk', label: 'ВКонтакте', type: 'social', domains: ['vk.com'] },
  { key: 'telegram', label: 'Telegram', type: 'social', domains: ['t.me', 'telegram.me'] },
  { key: 'tenchat', label: 'TenChat', type: 'social', domains: ['tenchat.ru'] },
  { key: 'ok', label: 'Одноклассники', type: 'social', domains: ['ok.ru'] },
  { key: 'rutube', label: 'RuTube', type: 'video', domains: ['rutube.ru'] },
  { key: 'yandex_music', label: 'Яндекс Музыка', type: 'music', domains: ['music.yandex.ru', 'music.yandex.com'] },
  { key: 'dzen', label: 'Яндекс Дзен', type: 'social', domains: ['dzen.ru', 'zen.yandex.ru'] },
  { key: 'soundcloud', label: 'SoundCloud', type: 'music', domains: ['soundcloud.com'] },
  { key: 'bandlink', label: 'Bandlink', type: 'music', domains: ['band.link', 'bandlink.ru'] },
  { key: 'spotify', label: 'Spotify', type: 'music', domains: ['open.spotify.com', 'spotify.com'] },
  { key: 'apple_music', label: 'Apple Music', type: 'music', domains: ['music.apple.com'] },
  { key: 'deezer', label: 'Deezer', type: 'music', domains: ['deezer.com'] },
  // 'website' is the catch-all: any other valid http(s) URL is treated as the
  // user's official site. Its `domains` is intentionally empty (see classifyUrl).
  { key: 'website', label: 'Официальный сайт', type: 'website', domains: [] },
];

export const BLOCKED_PLATFORMS: BlockedPlatform[] = [
  { key: 'instagram', label: 'Instagram', domains: ['instagram.com'] },
  { key: 'facebook', label: 'Facebook', domains: ['facebook.com', 'fb.com'] },
  { key: 'threads', label: 'Threads', domains: ['threads.net'] },
  { key: 'twitter', label: 'X/Twitter', domains: ['twitter.com', 'x.com'] },
  { key: 'linkedin', label: 'LinkedIn', domains: ['linkedin.com'] },
  { key: 'discord', label: 'Discord', domains: ['discord.gg', 'discord.com'] },
  { key: 'snapchat', label: 'Snapchat', domains: ['snapchat.com'] },
  { key: 'signal', label: 'Signal', domains: ['signal.me', 'signal.group'] },
  { key: 'viber', label: 'Viber', domains: ['viber.com', 'invite.viber.com'] },
  { key: 'tiktok', label: 'TikTok', domains: ['tiktok.com'] },
  { key: 'youtube', label: 'YouTube', domains: ['youtube.com', 'youtu.be'] },
];

export interface ClassifyResult {
  status: 'allowed' | 'blocked' | 'invalid';
  platformKey?: string;
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

/**
 * Classify a URL against the allow/block lists.
 * - Not a valid http(s) URL → { status: 'invalid' }.
 * - Host matches a BLOCKED domain → { status: 'blocked', platformKey }.
 * - Host matches an ALLOWED domain (excluding 'website') → { status: 'allowed', platformKey }.
 * - Any other valid http(s) host → { status: 'allowed', platformKey: 'website' }.
 */
export function classifyUrl(url: string): ClassifyResult {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { status: 'invalid' };
    }
    host = parsed.hostname.toLowerCase();
    if (!host) return { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }

  for (const platform of BLOCKED_PLATFORMS) {
    if (platform.domains.some((d) => hostMatches(host, d))) {
      return { status: 'blocked', platformKey: platform.key };
    }
  }

  for (const platform of ALLOWED_PLATFORMS) {
    if (platform.key === 'website') continue;
    if (platform.domains.some((d) => hostMatches(host, d))) {
      return { status: 'allowed', platformKey: platform.key };
    }
  }

  return { status: 'allowed', platformKey: 'website' };
}
