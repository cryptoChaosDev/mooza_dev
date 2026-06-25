import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { yoNorm } from '../utils/search';

// External-API helper that pre-fills the artist-create form: searches Deezer,
// Apple Music (iTunes) and MusicBrainz, merges matches by normalized name, and
// returns candidates (name, type, photo, genres mapped to our catalog, and links
// to streaming platforms incl. Яндекс.Музыка via MusicBrainz url-rels).

const router = Router();

const MB_UA = 'Moooza/1.0 ( https://moooza.ru )';
// Image hosts the avatar proxy is allowed to fetch (SSRF guard).
const AVATAR_HOSTS = new Set([
  'cdn-images.dzcdn.net', 'e-cdns-images.dzcdn.net',
  'is1-ssl.mzstatic.com', 'is2-ssl.mzstatic.com', 'is3-ssl.mzstatic.com',
  'is4-ssl.mzstatic.com', 'is5-ssl.mzstatic.com', 'upload.wikimedia.org',
]);

const cache = new Map<string, { at: number; data: any }>();
const TTL = 10 * 60 * 1000;

const norm = (s: any) => yoNorm(String(s || '')).toLowerCase().replace(/[!?.,'"«»()\-\s]+/g, '');

async function safeJson(url: string, headers?: Record<string, string>): Promise<any> {
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// GET /api/artist-lookup?q= — candidate artists from external catalogs
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ candidates: [] });
    const key = norm(q);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return res.json(hit.data);

    const enc = encodeURIComponent(q);
    const [dz, it, mb, genreRows] = await Promise.all([
      safeJson(`https://api.deezer.com/search/artist?q=${enc}&limit=8`),
      safeJson(`https://itunes.apple.com/search?term=${enc}&entity=musicArtist&limit=8&country=RU`),
      safeJson(`https://musicbrainz.org/ws/2/artist/?query=${enc}&fmt=json&limit=8`, { 'User-Agent': MB_UA, Accept: 'application/json' }),
      prisma.genre.findMany({ select: { id: true, name: true } }),
    ]);

    const genreByNorm = new Map<string, string>(genreRows.map((g: any) => [norm(g.name), g.id]));
    const mapGenres = (names: string[]) => {
      const ids: string[] = []; const raw: string[] = [];
      for (const n of names) {
        if (!n) continue;
        const id = genreByNorm.get(norm(n));
        if (id && !ids.includes(id)) ids.push(id);
        if (!raw.some((r) => norm(r) === norm(n))) raw.push(n);
      }
      return { ids, raw };
    };

    const byName = new Map<string, any>();
    const ensure = (name: string) => {
      const k = norm(name);
      if (!byName.has(k)) byName.set(k, { name, type: null as string | null, imageUrl: null as string | null, genres: [] as string[], links: {} as any, sources: [] as string[], popularity: 0, disambiguation: undefined as string | undefined, _mbid: null as string | null });
      return byName.get(k);
    };

    for (const a of (dz?.data || [])) {
      const c = ensure(a.name);
      c.imageUrl = c.imageUrl || a.picture_xl || a.picture_big || a.picture_medium || null;
      if (a.link) c.links.deezer = a.link;
      c.popularity = Math.max(c.popularity, a.nb_fan || 0);
      if (!c.sources.includes('deezer')) c.sources.push('deezer');
      if ((a.name || '').length > c.name.length) c.name = a.name; // keep richer casing/punctuation
    }
    for (const a of (it?.results || [])) {
      const c = ensure(a.artistName);
      if (a.primaryGenreName) c.genres.push(a.primaryGenreName);
      if (a.artistLinkUrl) c.links.appleMusic = a.artistLinkUrl;
      if (!c.sources.includes('apple')) c.sources.push('apple');
    }
    for (const a of (mb?.artists || [])) {
      const c = ensure(a.name);
      if (!c.type && a.type) {
        c.type = (a.type === 'Group' || a.type === 'Choir' || a.type === 'Orchestra') ? 'GROUP'
          : (a.type === 'Person' ? 'SOLO' : null);
      }
      if (a.disambiguation && !c.disambiguation) c.disambiguation = a.disambiguation;
      for (const t of (a.tags || [])) if (t?.name) c.genres.push(t.name);
      if (!c._mbid) c._mbid = a.id;
      if (!c.sources.includes('musicbrainz')) c.sources.push('musicbrainz');
    }

    // For the strongest MusicBrainz matches, pull cross-platform links (Яндекс.Музыка,
    // Spotify, VK, SoundCloud, official site). Capped to respect MB's 1 req/s limit.
    const withMb = [...byName.values()].filter((c) => c._mbid).slice(0, 2);
    for (const c of withMb) {
      const rel = await safeJson(`https://musicbrainz.org/ws/2/artist/${c._mbid}?inc=url-rels&fmt=json`, { 'User-Agent': MB_UA, Accept: 'application/json' });
      for (const r of (rel?.relations || [])) {
        const url = r?.url?.resource; if (!url) continue;
        if (/music\.yandex\./i.test(url)) c.links.yandexMusic = url;
        else if (/spotify\.com/i.test(url)) c.links.spotify = url;
        else if (/vk\.com/i.test(url)) c.links.vk = url;
        else if (/soundcloud\.com/i.test(url)) c.links.soundcloud = url;
        else if (r.type === 'official homepage') c.links.website = url;
      }
    }

    const candidates = [...byName.values()].map((c) => {
      const { ids, raw } = mapGenres(c.genres);
      const { _mbid, genres, ...rest } = c;
      return { ...rest, genreIds: ids, genres: raw };
    });
    candidates.sort((a, b) =>
      ((norm(b.name) === key ? 1 : 0) - (norm(a.name) === key ? 1 : 0)) || (b.popularity - a.popularity));

    const out = { candidates: candidates.slice(0, 8) };
    cache.set(key, { at: Date.now(), data: out });
    res.json(out);
  } catch (e: any) {
    console.error('[artist-lookup] GET /', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/artist-lookup/avatar?url= — proxy a whitelisted external image so the
// browser can turn it into a File for the avatar (avoids CORS + SSRF).
router.get('/avatar', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const url = String(req.query.url || '');
    let host = '';
    try { host = new URL(url).hostname; } catch { return res.status(400).json({ error: 'bad url' }); }
    if (!AVATAR_HOSTS.has(host)) return res.status(400).json({ error: 'host not allowed' });
    const r = await fetch(url);
    if (!r.ok) return res.status(502).end();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
