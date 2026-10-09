// streamMetadata.ts — best-effort prefill of release/clip metadata from a public URL.
//
// This is PREFILL ONLY: the user can always edit the fields manually. Every fetch
// fails SOFT — on ANY error we return {}.
//
// NOTE ON RU PROD: the production host (moooza.ru) is in Russia and may be unable to
// reach some platforms (Spotify / Apple Music / YouTube can be geo-blocked or slow).
// That is fine — this util never throws and never blocks; if the request fails the
// caller simply gets an empty object and the user fills the fields by hand.
//
// SSRF / DoS (POST /api/releases|clips/metadata — любой авторизованный):
//  * ходим ТОЛЬКО на домены стримингов из lib/mediaPlatforms (платформа
//    определяется по ссылке на сервере, клиентскому platform не верим);
//  * каждый хоп редиректа — вручную, с повторной проверкой домена и того, что
//    DNS указывает только на публичные адреса;
//  * общий дедлайн на ВСЮ операцию (включая чтение тела) и потоковое чтение с
//    лимитом байт — бесконечное/огромное тело не держит соединение и память.

import dns from 'dns/promises';
import net from 'net';
import { detectMediaPlatform, type MediaKind } from '../lib/mediaPlatforms';
import { safeImportedCover } from '../lib/mediaItems';

const DEADLINE_MS = 6000;       // на всю операцию, включая редиректы и тело
const MAX_HTML_BYTES = 512_000; // OG-теги — в <head>, больше не нужно
const MAX_JSON_BYTES = 64_000;  // oEmbed-ответ
const MAX_REDIRECTS = 4;

function ipIsPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||           // this-network / private / loopback
      (a === 169 && b === 254) ||                    // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||           // private
      (a === 192 && b === 168) ||                    // private
      (a === 100 && b >= 64 && b <= 127) ||          // CGNAT
      (a === 198 && (b === 18 || b === 19)) ||       // benchmarking
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

// URL допустим, если это http(s) на домен стриминга нужного вида и DNS
// указывает только на публичные адреса. Иначе — исключение.
async function assertAllowedUrl(raw: string, kind: MediaKind): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad scheme');
  if (u.username || u.password) throw new Error('credentials in url');
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('bad port');
  if (!detectMediaPlatform(kind, u.toString())) throw new Error('host not allowed');
  const host = u.hostname;
  if (net.isIP(host)) throw new Error('ip literal');
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => ipIsPrivate(a.address))) throw new Error('private ip');
  return u;
}

// Тело ответа потоком, не больше maxBytes; превышение — обрезаем и закрываем.
async function readLimited(res: Response, maxBytes: number): Promise<string | null> {
  const body = res.body;
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const room = maxBytes - total;
      if (value.byteLength >= room) {
        chunks.push(value.subarray(0, room));
        total += room;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))).toString('utf8');
}

const UA = 'Mozilla/5.0 (compatible; MooozaBot/1.0; +https://moooza.ru)';

// GET с ручными редиректами (каждый хоп — повторная проверка) под общим
// AbortSignal; тело читается потоком с лимитом. Любая ошибка → null.
async function fetchText(
  rawUrl: string,
  signal: AbortSignal,
  maxBytes: number,
  check: (url: string) => Promise<URL>,
  accept: RegExp,
): Promise<string | null> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = await check(current);
    } catch {
      return null;
    }
    let res: Response;
    try {
      res = await fetch(u.toString(), { redirect: 'manual', signal, headers: { 'User-Agent': UA } });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      res.body?.cancel().catch(() => {});
      if (!loc) return null;
      try {
        current = new URL(loc, u).toString();
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      return null;
    }
    const ctype = res.headers.get('content-type') ?? '';
    if (!accept.test(ctype)) {
      res.body?.cancel().catch(() => {});
      return null;
    }
    const len = Number(res.headers.get('content-length') ?? '0');
    if (len > maxBytes * 4) {
      res.body?.cancel().catch(() => {});
      return null;
    }
    try {
      return await readLimited(res, maxBytes);
    } catch {
      return null;
    }
  }
  return null; // too many redirects
}

type Meta = { title?: string; coverUrl?: string; releaseDate?: string };

function cleanMeta(title: unknown, cover: unknown): Meta {
  const out: Meta = {};
  if (typeof title === 'string' && title.trim()) out.title = title.trim().slice(0, 300);
  const safeCover = safeImportedCover(cover);
  if (safeCover) out.coverUrl = safeCover;
  return out;
}

// oEmbed-эндпоинты — фиксированные хосты платформ (пользовательский URL идёт
// только параметром запроса).
const OEMBED_HOSTS = new Set(['www.youtube.com', 'rutube.ru', 'open.spotify.com']);
async function assertOEmbedUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || !OEMBED_HOSTS.has(u.hostname)) throw new Error('host not allowed');
  return u;
}

async function tryOEmbed(endpoint: string, signal: AbortSignal): Promise<Meta> {
  const text = await fetchText(endpoint, signal, MAX_JSON_BYTES, assertOEmbedUrl, /json/i);
  if (!text) return {};
  try {
    const data: any = JSON.parse(text);
    return cleanMeta(data?.title, data?.thumbnail_url);
  } catch {
    return {};
  }
}

// Best-effort Open Graph scrape: fetch the HTML and regex out og:title / og:image.
async function tryOpenGraph(url: string, kind: MediaKind, signal: AbortSignal): Promise<Meta> {
  const html = await fetchText(url, signal, MAX_HTML_BYTES, (u) => assertAllowedUrl(u, kind), /text\/html|application\/xhtml/i);
  if (!html) return {};

  const pick = (prop: string): string | undefined => {
    // Match both attribute orders: property="..." content="..." and reverse.
    const re1 = new RegExp(
      `<meta[^>]{0,500}?(?:property|name)=["']${prop}["'][^>]{0,500}?content=["']([^"']{1,2000})["']`,
      'i',
    );
    const re2 = new RegExp(
      `<meta[^>]{0,500}?content=["']([^"']{1,2000})["'][^>]{0,500}?(?:property|name)=["']${prop}["']`,
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

  return cleanMeta(decode(pick('og:title')), decode(pick('og:image')));
}

/**
 * Best-effort metadata fetch for a streaming/video URL. Never throws; returns {} on failure.
 * Платформа определяется по ссылке (lib/mediaPlatforms); ссылка не на
 * стриминг нужного вида → {} без единого сетевого запроса.
 *
 * Strategy per platform:
 *  - YouTube  → oEmbed https://www.youtube.com/oembed
 *  - RuTube   → oEmbed https://rutube.ru/api/oembed/
 *  - Spotify  → oEmbed https://open.spotify.com/oembed
 *  - VK / VK_VIDEO / YANDEX_MUSIC / APPLE_MUSIC → Open Graph meta scrape (og:title / og:image)
 *
 * releaseDate is generally NOT available from oEmbed/OG → left undefined (manual entry).
 */
export async function fetchStreamMetadata(kind: MediaKind, url: string): Promise<Meta> {
  if (!url || typeof url !== 'string') return {};
  const raw = url.trim();
  const platform = detectMediaPlatform(kind, raw);
  if (!platform) return {};
  const enc = encodeURIComponent(raw);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
  try {
    switch (platform) {
      case 'YOUTUBE':
        return await tryOEmbed(`https://www.youtube.com/oembed?url=${enc}&format=json`, controller.signal);
      case 'RUTUBE':
        return await tryOEmbed(`https://rutube.ru/api/oembed/?url=${enc}&format=json`, controller.signal);
      case 'SPOTIFY':
        return await tryOEmbed(`https://open.spotify.com/oembed?url=${enc}`, controller.signal);
      // VK, VK_VIDEO, YANDEX_MUSIC, APPLE_MUSIC → OG scrape (только домены стримингов).
      default:
        return await tryOpenGraph(raw, kind, controller.signal);
    }
  } catch {
    // Absolute belt-and-suspenders: never throw.
    return {};
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
