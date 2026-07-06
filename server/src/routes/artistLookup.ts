import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { yoNorm } from '../utils/search';

// External-API helper that pre-fills the artist-create form: searches Deezer,
// Apple Music (iTunes) and MusicBrainz, merges matches by normalized name, and
// returns candidates (name, type, photo, genres mapped to our catalog, and links
// to streaming platforms incl. Яндекс.Музыка via MusicBrainz url-rels).

const router = Router();

// Image hosts the avatar proxy is allowed to fetch (SSRF guard).
const AVATAR_HOSTS = new Set([
  'cdn-images.dzcdn.net', 'e-cdns-images.dzcdn.net',
  'is1-ssl.mzstatic.com', 'is2-ssl.mzstatic.com', 'is3-ssl.mzstatic.com',
  'is4-ssl.mzstatic.com', 'is5-ssl.mzstatic.com', 'upload.wikimedia.org',
]);

const cache = new Map<string, { at: number; data: any }>();
const TTL = 10 * 60 * 1000;

const norm = (s: any) => yoNorm(String(s || '')).toLowerCase().replace(/[!?.,'"«»()\-\s&]+/g, '');

// External-genre keyword (normalized) → a catalog token, for fuzzy genre mapping.
const GENRE_SYNONYMS: Record<string, string> = {
  alternative: 'rock', альтернатива: 'rock', alternativerock: 'rock', altrock: 'rock', indierock: 'инди',
  metalcore: 'метал', deathmetal: 'метал', heavymetal: 'метал', numetal: 'метал', metal: 'метал', djent: 'метал',
  hardcore: 'панк', posthardcore: 'панк', postpunk: 'панк', emo: 'панк', хардкор: 'панк', grunge: 'rock',
  rap: 'рэп', trap: 'рэп', трэп: 'рэп', hiphop: 'рэп', хипхоп: 'рэп',
  house: 'electronic', techno: 'electronic', edm: 'electronic', dubstep: 'electronic', dnb: 'electronic',
  drumandbass: 'electronic', electronica: 'electronic', dance: 'electronic', trance: 'electronic', электроника: 'electronic',
  rnb: 'rb', randb: 'rb', soul: 'соул', funk: 'фанк',
  classical: 'классическаямузыка', opera: 'классическаямузыка', опера: 'классическаямузыка',
  worldmusic: 'world', этно: 'этно', folk: 'фолк',
};

async function safeJson(url: string, headers?: Record<string, string>): Promise<any> {
  // Short timeout so an unreachable source (e.g. MusicBrainz is unroutable from the
  // RU host) can't stall the whole lookup — we just drop that source.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
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
    // MusicBrainz is intentionally omitted — it is unroutable from the RU host
    // (connection times out). Deezer + iTunes cover name/photo/genre/links.
    const [dz, it, genreRows] = await Promise.all([
      safeJson(`https://api.deezer.com/search/artist?q=${enc}&limit=8`),
      safeJson(`https://itunes.apple.com/search?term=${enc}&entity=musicArtist&limit=8&country=RU`),
      prisma.genre.findMany({ select: { id: true, name: true } }),
    ]);

    const genreByNorm = new Map<string, string>(genreRows.map((g: any) => [norm(g.name), g.id]));
    // Token index — split each catalog genre name («Хип-хоп / Рэп, Hip-Hop / Rap»)
    // by «,» / «/» into normalized tokens so a partial external genre can match.
    const tokenToId = new Map<string, string>();
    for (const g of genreRows as any[]) {
      for (const part of String(g.name).split(/[,/]+/)) {
        const tok = norm(part);
        if (tok.length >= 2 && !tokenToId.has(tok)) tokenToId.set(tok, g.id);
      }
    }
    const matchGenreId = (name: string): string | null => {
      const n = norm(name);
      if (!n) return null;
      const exact = genreByNorm.get(n);
      if (exact) return exact;
      for (const [tok, id] of tokenToId) if (tok.length >= 3 && (n.includes(tok) || tok.includes(n))) return id;
      for (const k of Object.keys(GENRE_SYNONYMS)) {
        if (n === k || n.includes(k)) {
          const id = tokenToId.get(GENRE_SYNONYMS[k]) ?? genreByNorm.get(GENRE_SYNONYMS[k]);
          if (id) return id;
        }
      }
      return null;
    };
    const mapGenres = (names: string[]) => {
      const ids: string[] = []; const raw: string[] = [];
      for (const nm of names) {
        if (!nm) continue;
        if (!raw.some((r) => norm(r) === norm(nm))) raw.push(nm);
        const id = matchGenreId(nm);
        if (id && !ids.includes(id)) ids.push(id);
      }
      return { ids, raw };
    };

    const byName = new Map<string, any>();
    const ensure = (name: string) => {
      const k = norm(name);
      if (!byName.has(k)) byName.set(k, { name, type: null as string | null, imageUrl: null as string | null, genres: [] as string[], links: {} as any, deezerId: null as number | null, itunesId: null as number | null, sources: [] as string[], popularity: 0, disambiguation: undefined as string | undefined });
      return byName.get(k);
    };

    for (const a of (dz?.data || [])) {
      const c = ensure(a.name);
      if (!c.deezerId && a.id) c.deezerId = a.id;
      c.imageUrl = c.imageUrl || a.picture_xl || a.picture_big || a.picture_medium || null;
      if (a.link) c.links.deezer = a.link;
      c.popularity = Math.max(c.popularity, a.nb_fan || 0);
      if (!c.sources.includes('deezer')) c.sources.push('deezer');
      if ((a.name || '').length > c.name.length) c.name = a.name; // keep richer casing/punctuation
    }
    for (const a of (it?.results || [])) {
      const c = ensure(a.artistName);
      if (!c.itunesId && a.artistId) c.itunesId = a.artistId;
      if (a.primaryGenreName) c.genres.push(a.primaryGenreName);
      if (a.artistLinkUrl) c.links.appleMusic = a.artistLinkUrl;
      if (!c.sources.includes('apple')) c.sources.push('apple');
    }
    const candidates = [...byName.values()].map((c) => {
      const { ids, raw } = mapGenres(c.genres);
      const { genres, ...rest } = c;
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

// GET /api/artist-lookup/releases?itunesId= — the artist's albums from Apple Music
// (iTunes) for import as Release cards (Apple Music is a supported Release platform).
router.get('/releases', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const itunesId = String(req.query.itunesId || '').replace(/\D/g, '');
    if (!itunesId) return res.json({ releases: [], clips: [] });
    const [albums, videos] = await Promise.all([
      safeJson(`https://itunes.apple.com/lookup?id=${itunesId}&entity=album&limit=80&country=RU`),
      safeJson(`https://itunes.apple.com/lookup?id=${itunesId}&entity=musicVideo&limit=50&country=RU`),
    ]);
    const big = (u: any) => (String(u || '').replace('100x100', '600x600') || null);
    const byDate = (x: any, y: any) => String(y.releaseDate || '').localeCompare(String(x.releaseDate || ''));

    const relSeen = new Set<string>();
    const releases: any[] = [];
    for (const a of (albums?.results || [])) {
      if (a.wrapperType !== 'collection' || !a.collectionViewUrl || !a.collectionName) continue;
      const k = norm(a.collectionName);
      if (relSeen.has(k)) continue;
      relSeen.add(k);
      releases.push({
        title: a.collectionName,
        coverUrl: big(a.artworkUrl100) || a.artworkUrl60 || null,
        releaseDate: a.releaseDate || null,
        platform: 'APPLE_MUSIC',
        url: String(a.collectionViewUrl).split('?')[0],
      });
    }
    releases.sort(byDate);

    const clipSeen = new Set<string>();
    const clips: any[] = [];
    for (const a of (videos?.results || [])) {
      if (a.kind !== 'music-video' || !a.trackViewUrl || !a.trackName) continue;
      const k = norm(a.trackName);
      if (clipSeen.has(k)) continue;
      clipSeen.add(k);
      clips.push({
        title: a.trackName,
        coverUrl: big(a.artworkUrl100) || a.artworkUrl60 || null,
        releaseDate: a.releaseDate || null,
        platform: 'APPLE_MUSIC',
        url: String(a.trackViewUrl).split('?')[0],
      });
    }
    clips.sort(byDate);

    res.json({ releases, clips });
  } catch (e: any) {
    console.error('[artist-lookup] GET /releases', e);
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
