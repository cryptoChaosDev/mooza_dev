// streamMetadata.ts — best-effort prefill of release/clip metadata from a public URL.
//
// This is PREFILL ONLY: the user can always edit the fields manually. Every fetch
// uses a short timeout (AbortController) and fails SOFT — on ANY error we return {}.
//
// NOTE ON RU PROD: the production host (moooza.ru) is in Russia and may be unable to
// reach some platforms (Spotify / Apple Music / YouTube can be geo-blocked or slow).
// That is fine — this util never throws and never blocks; if the request fails the
// caller simply gets an empty object and the user fills the fields by hand.

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        // A real-ish UA helps some sites return proper OG tags.
        'User-Agent':
          'Mozilla/5.0 (compatible; MooozaBot/1.0; +https://moooza.ru)',
        ...(init?.headers ?? {}),
      },
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type Meta = { title?: string; coverUrl?: string; releaseDate?: string };

// Try an oEmbed endpoint that returns { title, thumbnail_url }.
async function tryOEmbed(endpoint: string): Promise<Meta> {
  const res = await fetchWithTimeout(endpoint);
  if (!res || !res.ok) return {};
  try {
    const data: any = await res.json();
    return {
      title: typeof data?.title === 'string' ? data.title : undefined,
      coverUrl: typeof data?.thumbnail_url === 'string' ? data.thumbnail_url : undefined,
    };
  } catch {
    return {};
  }
}

// Best-effort Open Graph scrape: fetch the HTML and regex out og:title / og:image.
async function tryOpenGraph(url: string): Promise<Meta> {
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return {};
  let html = '';
  try {
    html = await res.text();
  } catch {
    return {};
  }
  // Limit work on huge pages.
  if (html.length > 500_000) html = html.slice(0, 500_000);

  const pick = (prop: string): string | undefined => {
    // Match both attribute orders: property="..." content="..." and reverse.
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
      'i',
    );
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
      'i',
    );
    const m = html.match(re1) ?? html.match(re2);
    return m?.[1];
  };

  const decode = (s?: string): string | undefined =>
    s
      ?.replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

  return {
    title: decode(pick('og:title')),
    coverUrl: decode(pick('og:image')),
  };
}

/**
 * Best-effort metadata fetch for a streaming/video URL. Never throws; returns {} on failure.
 *
 * Strategy per platform:
 *  - YouTube     → oEmbed https://www.youtube.com/oembed
 *  - RuTube      → oEmbed https://rutube.ru/api/oembed/
 *  - SoundCloud  → oEmbed https://soundcloud.com/oembed
 *  - Spotify     → oEmbed https://open.spotify.com/oembed
 *  - VK / VK_VIDEO / YANDEX_MUSIC / APPLE_MUSIC → Open Graph meta scrape (og:title / og:image)
 *
 * releaseDate is generally NOT available from oEmbed/OG → left undefined (manual entry).
 */
export async function fetchStreamMetadata(
  platform: string,
  url: string,
): Promise<Meta> {
  if (!url || typeof url !== 'string') return {};
  const enc = encodeURIComponent(url.trim());
  const p = (platform || '').toUpperCase();

  try {
    switch (p) {
      case 'YOUTUBE':
        return await tryOEmbed(`https://www.youtube.com/oembed?url=${enc}&format=json`);
      case 'RUTUBE':
        return await tryOEmbed(`https://rutube.ru/api/oembed/?url=${enc}&format=json`);
      case 'SOUNDCLOUD':
        return await tryOEmbed(`https://soundcloud.com/oembed?format=json&url=${enc}`);
      case 'SPOTIFY':
        return await tryOEmbed(`https://open.spotify.com/oembed?url=${enc}`);
      // VK, VK_VIDEO, YANDEX_MUSIC, APPLE_MUSIC and anything else → OG scrape.
      default:
        return await tryOpenGraph(url.trim());
    }
  } catch {
    // Absolute belt-and-suspenders: never throw.
    return {};
  }
}
