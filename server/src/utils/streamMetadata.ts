// streamMetadata.ts — best-effort prefill of release/clip metadata from a public URL.
//
// This is PREFILL ONLY: the user can always edit the fields manually. Every fetch
// uses a short timeout (AbortController) and fails SOFT — on ANY error we return {}.
//
// NOTE ON RU PROD: the production host (moooza.ru) is in Russia and may be unable to
// reach some platforms (Spotify / Apple Music / YouTube can be geo-blocked or slow).
// That is fine — this util never throws and never blocks; if the request fails the
// caller simply gets an empty object and the user fills the fields by hand.

import dns from 'dns/promises';
import net from 'net';

const TIMEOUT_MS = 5000;

// ── SSRF guard ──────────────────────────────────────────────────────────────
// tryOpenGraph() fetches a user-supplied URL on the server, so it must never be
// pointed at internal infrastructure (localhost, the DB, cloud metadata at
// 169.254.169.254, the private LAN, …). We reject the URL up front AND re-check
// after every redirect hop, so a public host that 30x-redirects to an internal
// one can't slip through.

function ipIsPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||           // this-network / private / loopback
      (a === 169 && b === 254) ||                    // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||           // private
      (a === 192 && b === 168) ||                    // private
      (a === 100 && b >= 64 && b <= 127) ||          // CGNAT
      a >= 224                                       // multicast / reserved
    );
  }
  const ip6 = ip.toLowerCase();
  if (ip6.startsWith('::ffff:')) return ipIsPrivate(ip6.slice(7)); // IPv4-mapped
  return (
    ip6 === '::1' || ip6 === '::' ||
    ip6.startsWith('fe80') ||                        // link-local
    ip6.startsWith('fc') || ip6.startsWith('fd')     // unique-local
  );
}

// Returns a normalized URL if it is http(s) and resolves only to public IPs,
// otherwise throws. Resolving DNS here also blocks DNS-based bypasses.
async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad scheme');
  const host = u.hostname;
  if (net.isIP(host)) {
    if (ipIsPrivate(host)) throw new Error('private ip');
    return u;
  }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => ipIsPrivate(a.address))) throw new Error('private ip');
  return u;
}

// Fetch an HTML page following up to 4 redirects, re-validating the target host
// at every hop. Returns null on any policy violation / error.
async function safeFetchHtml(rawUrl: string): Promise<Response | null> {
  let current = rawUrl;
  for (let i = 0; i < 4; i++) {
    let u: URL;
    try {
      u = await assertPublicUrl(current);
    } catch {
      return null;
    }
    const res = await fetchWithTimeout(u.toString(), { redirect: 'manual' });
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = new URL(loc, u).toString();
      continue;
    }
    return res;
  }
  return null; // too many redirects
}

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
  // SSRF-guarded fetch: rejects internal/loopback/link-local targets and
  // re-checks the host after each redirect.
  const res = await safeFetchHtml(url);
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
