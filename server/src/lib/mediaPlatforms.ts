// Streaming-platform links for releases & clips. Used to (1) auto-detect which
// platform a pasted URL belongs to and (2) reject anything that isn't a real link
// to one of the allowed services (no phishing / arbitrary text). Mirrored on the
// client (UX) and the server (authoritative validation) — keep both copies in sync:
//   client/src/lib/mediaPlatforms.ts  ⇄  server/src/lib/mediaPlatforms.ts

export type MediaKind = 'release' | 'clip';

// Audio-streaming platforms — must match enum StreamingPlatform (Release.platform).
export const RELEASE_PLATFORM_DOMAINS: Record<string, string[]> = {
  VK: ['vk.com', 'vk.ru', 'vk.cc'],
  SPOTIFY: ['open.spotify.com', 'spotify.com', 'spotify.link'],
  YANDEX_MUSIC: ['music.yandex.ru', 'music.yandex.com', 'music.yandex.by', 'music.yandex.kz', 'music.yandex.uz'],
  APPLE_MUSIC: ['music.apple.com', 'geo.music.apple.com'],
};

// Video platforms — must match enum ClipPlatform (Clip.platform).
export const CLIP_PLATFORM_DOMAINS: Record<string, string[]> = {
  VK_VIDEO: ['vkvideo.ru', 'vk.com', 'vk.ru', 'vk.cc'],
  RUTUBE: ['rutube.ru'],
  YOUTUBE: ['youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'],
  APPLE_MUSIC: ['music.apple.com', 'geo.music.apple.com'],
};

export const MEDIA_PLATFORM_LABELS: Record<string, string> = {
  VK: 'ВКонтакте',
  SPOTIFY: 'Spotify',
  YANDEX_MUSIC: 'Яндекс Музыка',
  APPLE_MUSIC: 'Apple Music',
  VK_VIDEO: 'ВКонтакте Видео',
  RUTUBE: 'Rutube',
  YOUTUBE: 'YouTube',
};

// Hostname of a valid http(s) URL (lowercased, no leading www.), or null when the
// string isn't a real http(s) link at all.
function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function detect(domainsMap: Record<string, string[]>, url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const [platform, domains] of Object.entries(domainsMap)) {
    // host === d → exact; host.endsWith('.' + d) → real subdomain only.
    // «phishing-vk.com» / «vk.com.evil.com» do NOT match.
    if (domains.some((d) => host === d || host.endsWith('.' + d))) return platform;
  }
  return null;
}

export function detectReleasePlatform(url: string): string | null {
  return detect(RELEASE_PLATFORM_DOMAINS, url);
}

export function detectClipPlatform(url: string): string | null {
  return detect(CLIP_PLATFORM_DOMAINS, url);
}

export function detectMediaPlatform(kind: MediaKind, url: string): string | null {
  return kind === 'release' ? detectReleasePlatform(url) : detectClipPlatform(url);
}

// Human-readable names of the platforms allowed for a kind (for hints/placeholders).
export function allowedPlatformLabels(kind: MediaKind): string[] {
  const map = kind === 'release' ? RELEASE_PLATFORM_DOMAINS : CLIP_PLATFORM_DOMAINS;
  return Object.keys(map).map((id) => MEDIA_PLATFORM_LABELS[id] ?? id);
}
