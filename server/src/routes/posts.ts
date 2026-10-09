import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sanitizeHtml from 'sanitize-html';
import { Prisma, ArtistType } from '@prisma/client';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { emitToUser } from '../socket';
import { notify, isNotificationEnabled } from '../utils/notify';
import { tgLog, tgEvent, escTg } from '../utils/telegram';

const router = Router();

// ── Limits ────────────────────────────────────────────────────────────────────
const MAX_PAGE = 50;                 // hard cap for any ?limit (guests can hit /feed)
const CONTENT_MAX = 20000;           // post HTML
const COMMENT_MAX = 2000;
const REPOST_COMMENT_MAX = 1000;
const TITLE_MAX = 140;
const CATEGORY_MAX = 60;
const POLL_OPTIONS_MIN = 2;
const POLL_OPTIONS_MAX = 10;
const POLL_OPTION_LEN = 100;
const MAX_IMAGES = 10;
const MAX_LINKS = 10;
const MAX_TAGS = 20;

// Типы, которые можно создать через POST /posts. «Заказ»/«Вакансия» создаются
// только из orders.ts / vacancies.ts (с привязкой orderId / vacancyId).
const CREATABLE_TYPES = ['blog', 'question', 'service', 'employment', 'poll'];
const EMPLOYMENT_STATUSES = ['open', 'considering', 'closed'];
const FEED_SORTS = ['new', 'popular', 'discussed', 'smart'];
// Должен совпадать с REACTION_EMOJIS в client/src/components/ReactionBar.tsx
const REACTION_EMOJIS = ['👍', '👎', '👌', '😢', '😂', '🔥', '❤️'];

// Только наши загрузки (multer ниже). Иначе `@evil.com/p.png` превращается
// клиентом в `https://moooza.ru@evil.com/p.png` — внешний хост.
const POST_IMAGE_RE = /^\/uploads\/posts\/post-[\w-]+\.(jpe?g|png|gif|webp)$/i;
const POST_AUDIO_RE = /^\/uploads\/posts\/post-[\w-]+\.[a-z0-9]{1,5}$/i;
const ID_RE = /^[\w-]{1,64}$/;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function parseLimit(v: unknown, def = 20): number {
  const n = parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, MAX_PAGE);
}

function parseOffset(v: unknown): number {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 0;
}

function qstr(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v);
}

/** (createdAt,id) cursor: `<ISO>|<id>` */
function parseTimeCursor(raw: string): { at: Date; id: string } | null {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\|([\w-]{1,64})$/.exec(raw);
  if (!m) return null;
  const at = new Date(m[1]);
  if (Number.isNaN(at.getTime())) return null;
  return { at, id: m[2] };
}

// Автор виден в ленте, если не заблокирован: isBlocked=false и нет активного
// blockedUntil, либо срок блокировки уже истёк (авто-разблокировка).
function visibleAuthorWhere(now = new Date()) {
  return { OR: [{ isBlocked: false, blockedUntil: null }, { blockedUntil: { lte: now } }] };
}

// ── HTML sanitization (TipTap output) ─────────────────────────────────────────
// Тот же whitelist, что в client/src/components/PostContent.tsx. class — только
// post-mention (иначе `<a class="fixed inset-0 z-[100]">` перекрывает экран).
const POST_ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 's', 'strike', 'del', 'u', 'ul', 'ol', 'li', 'blockquote', 'a', 'span'];

function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

function isMentionSpan(attribs: Record<string, string>): boolean {
  return attribs['data-type'] === 'mention' || /(^|\s)post-mention(\s|$)/.test(attribs.class || '');
}

function baseSanitizeOptions(span: sanitizeHtml.Transformer): sanitizeHtml.IOptions {
  return {
    allowedTags: POST_ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      span: ['class', 'data-type', 'data-id', 'data-label', 'data-mention-suggestion-char'],
    },
    allowedClasses: { span: ['post-mention'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_tag, attribs) => ({
        tagName: 'a',
        attribs: {
          ...(attribs.href ? { href: attribs.href } : {}),
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      }),
      span,
    },
  };
}

function plainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .trim();
}

type MentionRef = { id: string; type: 'user'; name: string };

/**
 * Санитизирует HTML поста и перепроверяет упоминания: data-id должен
 * существовать, подпись перестраивается по реальному имени (подделать
 * «@Админ» с чужим data-id нельзя). Plain-text (легаси) возвращается как есть —
 * клиент рендерит его текстом.
 */
async function sanitizePostContent(raw: string): Promise<{ html: string; mentions: MentionRef[] }> {
  if (!raw) return { html: '', mentions: [] };
  if (!looksLikeHtml(raw)) return { html: raw, mentions: [] };

  const ids = new Set<string>();
  const firstPass = sanitizeHtml(raw, baseSanitizeOptions((_tag, attribs) => {
    if (isMentionSpan(attribs)) {
      const id = attribs['data-id'] || attribs['data-mention-id'] || '';
      if (ID_RE.test(id)) ids.add(id);
      return { tagName: 'span', attribs: { ...attribs, 'data-id': id } };
    }
    return { tagName: 'span', attribs };
  }));

  const users = ids.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(ids).slice(0, 50) } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || 'user']));
  const mentions = new Map<string, MentionRef>();

  let html = sanitizeHtml(firstPass, baseSanitizeOptions((_tag, attribs): sanitizeHtml.Tag => {
    if (!isMentionSpan(attribs)) return { tagName: 'span', attribs: {} };
    const id = attribs['data-id'] || '';
    const name = byId.get(id);
    if (!name) return { tagName: 'span', attribs: {} }; // несуществующий — обычный текст
    mentions.set(id, { id, type: 'user', name });
    return {
      tagName: 'span',
      attribs: { class: 'post-mention', 'data-type': 'mention', 'data-id': id, 'data-label': name, 'data-mention-suggestion-char': '@' },
      text: `@${name}`,
    };
  })).trim();

  // Все теги вырезаны — оставляем HTML-обёртку, чтобы клиент не показал «&amp;» как текст.
  if (html && !looksLikeHtml(html)) html = `<p>${html}</p>`;
  return { html, mentions: Array.from(mentions.values()) };
}

// ── Field validators ──────────────────────────────────────────────────────────
function normalizeLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 500 || /\s/.test(s)) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    if (!u.hostname.includes('.')) return null;
    return s;
  } catch {
    return null;
  }
}

function normalizeStringList(raw: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const s = v.trim().slice(0, maxLen);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Canonical catalog city name, '' for empty input, null if not in catalog. */
async function resolveCity(raw: unknown): Promise<string | null> {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (!name) return '';
  const city = await prisma.city.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { name: true },
  });
  return city ? city.name : null;
}

// ── Upload ────────────────────────────────────────────────────────────────────
// Своя конфигурация multer: расширение берётся из mimetype (а не из
// originalname), чтобы имя файла всегда проходило POST_IMAGE_RE / POST_AUDIO_RE.
const POST_MEDIA_EXT: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/wave': '.wav', 'audio/x-wav': '.wav',
  'audio/ogg': '.ogg', 'audio/flac': '.flac', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac',
  'audio/x-aac': '.aac', 'audio/3gpp': '.3gp', 'audio/3gpp2': '.3g2',
};
const postMediaDir = path.join(process.cwd(), 'uploads', 'posts');

const uploadPostMedia = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try { fs.mkdirSync(postMediaDir, { recursive: true }); } catch {}
      cb(null, postMediaDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `post-${uniqueSuffix}${POST_MEDIA_EXT[file.mimetype] || ''}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (POST_MEDIA_EXT[file.mimetype]) cb(null, true);
    else cb(new Error('Unsupported file type'));
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Upload post media (image, gif, audio).
// Ошибки multer (формат/размер) — понятный 400, а не «Внутренняя ошибка сервера».
router.post('/upload', authenticate, (req, res, next) => {
  uploadPostMedia.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Файл больше 20 МБ' });
    }
    return res.status(400).json({ error: 'Неподдерживаемый формат файла (JPG, PNG, GIF, WebP или аудио)' });
  });
}, async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const isAudio = req.file.mimetype.startsWith('audio/');
    const url = `/uploads/posts/${req.file.filename}`;
    // Fix encoding: multer receives filename as latin1, convert to utf-8
    let originalName = req.file.originalname;
    try { originalName = Buffer.from(originalName, 'latin1').toString('utf8'); } catch {}
    res.json({ url, type: isAudio ? 'audio' : 'image', originalName });
  } catch (error) {
    console.error('Post media upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /api/posts/my-authors — list authors user can post as
router.get('/my-authors', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const user = await prisma.user.findUnique({
      where: { id: meId },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    const channel = await prisma.channel.findUnique({
      where: { ownerId: meId },
      select: { id: true, name: true, avatar: true },
    });
    const artistMemberships = await prisma.userArtist.findMany({
      where: { userId: meId, isOwner: true, inviteStatus: 'ACCEPTED' },
      include: { artist: { select: { id: true, name: true, avatar: true } } },
    });
    res.json({
      user,
      channel,
      artists: artistMemberships.map((m: any) => m.artist),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Shared post include used by /feed, /:id and /saved/list.
// Kept as a factory so each query gets its own per-user `where` for likes/savedBy.
// Комментарии в ленте НЕ тянутся целиком: только _count и 3 последних
// (полный список — GET /posts/:id/comments при открытии шторки).
// Реакции — только моя; сводка по эмодзи считается groupBy в decoratePosts().
const buildFeedInclude = (userId: string | undefined) => {
  // Guest safety: Prisma treats `{ userId: undefined }` as NO filter, which would
  // return ALL likes/savedBy rows and make isLiked/isSaved wrongly true for guests.
  // Fall back to a non-matching UUID so the relations come back empty.
  const meId = userId ?? '00000000-0000-0000-0000-000000000000';
  return {
  author: {
    select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, isPremium: true, isVerified: true, isBlocked: true }
  },
  channel: { select: { id: true, name: true, avatar: true } },
  artist: { select: { id: true, name: true, avatar: true } },
  // Structured «Услуга» post — the linked offering, used to render the feed card
  // (title, section, price) and power the «Детали услуги»/«Написать»/«Сделка» buttons.
  service: {
    select: {
      id: true,
      name: true,
      priceFrom: true,
      priceTo: true,
      priceItems: true,
      service: { select: { name: true, section: { select: { name: true } } } },
      profession: { select: { name: true } },
      user: { select: { id: true, firstName: true, lastName: true, city: true } },
    },
  },
  // Structured «Заказ» post — the linked customer brief, for the «Посмотреть детали» button.
  order: {
    select: {
      id: true,
      title: true,
      budgetFrom: true,
      budgetTo: true,
      deadline: true,
      status: true,
      executorId: true,
      service: { select: { name: true, section: { select: { name: true } } } },
    },
  },
  // Structured «Вакансия» post — the linked artist hiring post, for the «Посмотреть детали» button.
  vacancy: {
    select: {
      id: true,
      title: true,
      workFormat: true,
      geography: true,
      paymentType: true,
      compensation: true,
      status: true,
      profession: { select: { name: true } },
    },
  },
  repostOf: {
    include: {
      author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, isPremium: true, isVerified: true } }
    }
  },
  likes: {
    where: { userId: meId },
    select: { id: true }
  },
  savedBy: {
    where: { userId: meId },
    select: { id: true }
  },
  pollVotes: {
    where: { userId: meId },
    select: { userId: true, optionIndex: true }
  },
  comments: {
    where: { parentCommentId: null },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true, content: true, imageUrl: true, createdAt: true,
      author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true } },
    },
  },
  reactions: {
    where: { userId: meId },
    select: { id: true, emoji: true, userId: true }
  },
  _count: {
    select: {
      likes: true,
      comments: true,
      savedBy: true,
      reactions: true,
      reposts: { where: { repostDeleted: false } },
    }
  }
  } satisfies Prisma.PostInclude;
};

/** Adds isLiked/isSaved/myVote/myReaction/reactionSummary to posts loaded with buildFeedInclude. */
async function decoratePosts(posts: any[]): Promise<any[]> {
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);
  const grouped = await prisma.postReaction.groupBy({
    by: ['postId', 'emoji'],
    where: { postId: { in: ids } },
    _count: { _all: true },
  });
  const summary = new Map<string, { emoji: string; count: number }[]>();
  for (const g of grouped) {
    const list = summary.get(g.postId) ?? [];
    list.push({ emoji: g.emoji, count: g._count._all });
    summary.set(g.postId, list);
  }
  for (const list of summary.values()) {
    list.sort((a, b) => b.count - a.count || REACTION_EMOJIS.indexOf(a.emoji) - REACTION_EMOJIS.indexOf(b.emoji));
  }
  return posts.map((post) => {
    const { reactions, ...rest } = post;
    return {
      ...rest,
      isLiked: (post.likes?.length ?? 0) > 0,
      isSaved: (post.savedBy?.length ?? 0) > 0,
      myVote: post.pollVotes?.[0]?.optionIndex ?? null,
      myReaction: reactions?.[0]?.emoji ?? null,
      reactionSummary: summary.get(post.id) ?? [],
    };
  });
}

// System team account — its posts are pinned to the top of the feed for brand-new users.
// See server/prisma/seeds/welcome-posts.ts
const TEAM_EMAIL = 'team@moooza.ru';

// ── Smart feed («Для вас») ───────────────────────────────────────────────────
// Per-(viewer+filters) ranked id list, cached briefly.
const SMART_TTL_MS = 3 * 60 * 1000;
const smartCache = new Map<string, { ids: string[]; at: number }>();

// Снапшоты порядка для ранжированных сортировок (smart/popular/discussed):
// курсор `s:<token>:<index>` листает один и тот же список, поэтому
// refetch/новые реакции не дают дублей и пропусков между страницами.
const SNAPSHOT_TTL_MS = 15 * 60 * 1000;
// Первая страница в пределах этого окна переиспользует снапшот того же
// зрителя+фильтров (refetchInterval клиента не плодит новые снапшоты).
const SNAPSHOT_REUSE_MS = 2 * 60 * 1000;
const SNAPSHOT_MAX = 300; // ≤ 300 × ~600 id — ограничение памяти
const rankSnapshots = new Map<string, { ids: string[]; at: number }>();
const snapshotTokenByKey = new Map<string, string>();

function putSnapshot(token: string, ids: string[]) {
  const now = Date.now();
  for (const [k, v] of rankSnapshots) if (now - v.at > SNAPSHOT_TTL_MS) rankSnapshots.delete(k);
  // Map хранит порядок вставки — вытесняем самые старые.
  while (rankSnapshots.size >= SNAPSHOT_MAX) {
    const oldest = rankSnapshots.keys().next().value;
    if (oldest === undefined) break;
    rankSnapshots.delete(oldest);
  }
  rankSnapshots.set(token, { ids, at: now });
}

function getSnapshot(token: string): string[] | null {
  const s = rankSnapshots.get(token);
  if (!s) return null;
  if (Date.now() - s.at > SNAPSHOT_TTL_MS) { rankSnapshots.delete(token); return null; }
  return s.ids;
}

// Greedy author-diversity pass: avoid the same author within `window` slots.
function diversifyByAuthor<T extends { authorId: string }>(items: T[], window = 4): T[] {
  const out: T[] = [];
  const recent: string[] = [];
  const pool = items.slice();
  while (pool.length) {
    let i = pool.findIndex((p) => !recent.includes(p.authorId));
    if (i === -1) i = 0;
    const [picked] = pool.splice(i, 1);
    out.push(picked);
    recent.push(picked.authorId);
    if (recent.length > window) recent.shift();
  }
  return out;
}

interface RankCtx {
  where: any;
  sort: string;
  vid: string | null;
  cacheKey: string;
  kind: string;
  typeTypes: string[];
  teamUserId: string | null;
}

async function computeSmartIds(ctx: RankCtx): Promise<string[]> {
  const { where, vid, kind, teamUserId } = ctx;
  const nowMs = Date.now();
  const cached = smartCache.get(ctx.cacheKey);
  if (cached && nowMs - cached.at <= SMART_TTL_MS) return cached.ids;

  // Viewer affinity signals (empty for guests → global "trending" ranking).
  let friendIds = new Set<string>(), connIds = new Set<string>(), subChannelIds = new Set<string>(),
      favUserIds = new Set<string>(), myArtistIds = new Set<string>(), vGenres = new Set<string>();
  let vCity: string | null = null, vField: string | null = null;
  if (vid) {
    const [friendships, connections, subs, favorites, myArtists, viewer] = await Promise.all([
      prisma.friendship.findMany({ where: { status: 'accepted', OR: [{ requesterId: vid }, { receiverId: vid }] }, select: { requesterId: true, receiverId: true } }),
      prisma.connection.findMany({ where: { status: { in: ['ACCEPTED', 'BREAK_REQUESTED'] }, OR: [{ requesterId: vid }, { receiverId: vid }] }, select: { requesterId: true, receiverId: true } }),
      prisma.channelSubscription.findMany({ where: { userId: vid }, select: { channelId: true } }),
      prisma.favorite.findMany({ where: { userId: vid }, select: { targetId: true } }),
      prisma.userArtist.findMany({ where: { userId: vid }, select: { artistId: true } }),
      prisma.user.findUnique({ where: { id: vid }, select: { city: true, genres: true, fieldOfActivityId: true } }),
    ]);
    friendIds = new Set(friendships.map((f) => (f.requesterId === vid ? f.receiverId : f.requesterId)));
    connIds = new Set(connections.map((c) => (c.requesterId === vid ? c.receiverId : c.requesterId)));
    subChannelIds = new Set(subs.map((s) => s.channelId));
    favUserIds = new Set(favorites.map((f) => f.targetId));
    myArtistIds = new Set(myArtists.map((a) => a.artistId));
    vGenres = new Set(viewer?.genres ?? []);
    vCity = viewer?.city ?? null;
    vField = viewer?.fieldOfActivityId ?? null;
  }

  // Candidate pool: the 600 most-recent posts matching the active filters
  // (team excluded — handled separately below).
  const candidates: any[] = await prisma.post.findMany({
    where,
    select: {
      id: true, createdAt: true, authorId: true, channelId: true, artistId: true, city: true, genres: true,
      author: { select: { fieldOfActivityId: true } },
      _count: { select: { reactions: true, comments: true, likes: true, savedBy: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 600,
  });

  // score = freshness × (1 + engagement + affinity + relevance)
  const HALF_LIFE_H = 20;
  const scored = candidates.map((p) => {
    const ageH = Math.max(0, (nowMs - new Date(p.createdAt).getTime()) / 3_600_000);
    const freshness = Math.pow(0.5, ageH / HALF_LIFE_H);
    const c = p._count;
    const eng = Math.log1p(c.reactions + 2 * c.comments + 0.5 * c.likes + 1.5 * c.savedBy);
    let aff = 0;
    if (friendIds.has(p.authorId)) aff += 1.2; else if (connIds.has(p.authorId)) aff += 0.8;
    if (favUserIds.has(p.authorId)) aff += 0.6;
    if (p.channelId && subChannelIds.has(p.channelId)) aff += 1.0;
    if (p.artistId && myArtistIds.has(p.artistId)) aff += 1.0;
    let rel = 0;
    if (p.city && vCity && p.city === vCity) rel += 0.4;
    if (vGenres.size && p.genres?.length) {
      const o = p.genres.filter((g: string) => vGenres.has(g)).length;
      if (o) rel += Math.min(0.6, 0.3 * o);
    }
    if (p.author?.fieldOfActivityId && vField && p.author.fieldOfActivityId === vField) rel += 0.3;
    return { id: p.id, authorId: p.authorId, score: freshness * (1 + 0.6 * eng + aff + rel) };
  });
  scored.sort((a, b) => b.score - a.score);
  const ranked = diversifyByAuthor(scored);

  // Посты официального аккаунта Moooza закрепляются сверху ТОЛЬКО для новичков
  // без собственных постов (онбординг, старые→новые) — как и в остальных
  // сортировках. Для всех прочих они ранжируются наравне со всеми и тонут
  // по свежести (раньше висели сверху у всех — жалоба «вечно вижу старые посты Музы»).
  let teamIds: string[] = [];
  if (teamUserId && kind === 'all' && vid) {
    const newUser = (await prisma.post.count({ where: { authorId: vid } })) === 0;
    if (newUser) {
      const teamWhere: any = { authorId: teamUserId };
      if (ctx.typeTypes.length) teamWhere.type = ctx.typeTypes.length > 1 ? { in: ctx.typeTypes } : ctx.typeTypes[0];
      if (where.createdAt) teamWhere.createdAt = where.createdAt;
      if (where.city) teamWhere.city = where.city;
      const teamPosts = await prisma.post.findMany({ where: teamWhere, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 25 });
      teamIds = teamPosts.map((p) => p.id);
    }
  }
  const teamSet = new Set(teamIds);
  const ids = [...teamIds, ...ranked.filter((p) => !teamSet.has(p.id)).map((p) => p.id)];
  if (smartCache.size > 1000) smartCache.clear();
  smartCache.set(ctx.cacheKey, { ids, at: nowMs });
  return ids;
}

async function computeRankedIds(ctx: RankCtx): Promise<string[]> {
  if (ctx.sort === 'smart') return computeSmartIds(ctx);
  if (ctx.sort === 'popular') {
    // «Популярные» — суммарная вовлечённость (лайки + реакции + сохранения + чуть комментов).
    // Prisma не умеет orderBy по сумме relation-count'ов — ранжируем пул из 600
    // свежих кандидатов в памяти.
    const cands = await prisma.post.findMany({
      where: ctx.where,
      select: { id: true, createdAt: true, _count: { select: { likes: true, reactions: true, comments: true, savedBy: true } } },
      orderBy: { createdAt: 'desc' },
      take: 600,
    });
    const scored = cands.map((p) => ({
      id: p.id,
      t: new Date(p.createdAt).getTime(),
      s: p._count.likes + p._count.reactions + 1.5 * p._count.savedBy + 0.5 * p._count.comments,
    }));
    scored.sort((a, b) => b.s - a.s || b.t - a.t);
    return scored.map((x) => x.id);
  }
  // discussed
  const rows = await prisma.post.findMany({
    where: ctx.where,
    select: { id: true },
    orderBy: [{ comments: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }],
    take: 600,
  });
  return rows.map((r) => r.id);
}

// Get feed (all posts from the social network). Supports:
//   type       — post type (blog | question | poll | service | employment | …)
//   authorKind — all | resident (profile) | channel | artist | mine
//   sort       — new (default) | popular | discussed | smart («Для вас»)
//   cursor     — курсорная пагинация (ответ `{ items, nextCursor }`); '' — первая страница
//   limit/offset — легаси-пагинация (ответ — массив), для старых клиентов
router.get('/feed', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const { type, authorKind, period, city, employment, artistType, genre } = req.query;
    const limitNum = parseLimit(req.query.limit);
    const offsetNum = parseOffset(req.query.offset);
    const useCursor = req.query.cursor !== undefined;
    const cursor = qstr(req.query.cursor);
    const sortStr = FEED_SORTS.includes(qstr(req.query.sort)) ? qstr(req.query.sort) : 'new';
    const kindRaw = authorKind ? qstr(authorKind) : 'all';
    const kind = kindRaw === 'mine' && !req.userId ? 'all' : kindRaw;

    const include = buildFeedInclude(req.userId);

    // Team welcome account — its posts are pinned for brand-new users and kept
    // out of the normal chronological stream (avoids duplicates across pages).
    const teamUser = await prisma.user.findUnique({
      where: { email: TEAM_EMAIL },
      select: { id: true },
    });
    const teamUserId = teamUser?.id ?? null;

    // Build the where clause from filters.
    const where: any = {};
    const typeStr = qstr(type);
    const typeTypes = typeStr && typeStr !== 'all'
      ? typeStr.split(',').map(t => t.trim()).filter(Boolean).slice(0, 20)
      : [];
    if (typeTypes.length) where.type = typeTypes.length > 1 ? { in: typeTypes } : typeTypes[0];
    if (kind === 'resident') { where.channelId = null; where.artistId = null; }
    else if (kind === 'channel') where.channelId = { not: null };
    else if (kind === 'artist') where.artistId = { not: null };
    else if (kind === 'mine') where.authorId = req.userId;
    else if (teamUserId) where.authorId = { not: teamUserId }; // exclude team from default/other views

    // Hide «Услуга» posts whose offering is no longer active (archived/draft) — an
    // archived/unpublished service must not show in the feed. Also hide degenerate
    // structured service posts whose linked offering was deleted (serviceId null):
    // those would render as an empty «Услуга» card with no data. Non-service posts
    // are unaffected.
    where.NOT = [
      { type: 'service', service: { status: { not: 'active' } } },
      { type: 'service', serviceId: null },
    ];

    // Посты заблокированных авторов в ленту не попадают.
    where.author = { ...visibleAuthorWhere() };

    // period — date lower bound on createdAt (server-computed)
    const periodStr = period ? qstr(period) : 'all';
    if (periodStr && periodStr !== 'all') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (periodStr === 'today') {
        where.createdAt = { gte: startOfToday };
      } else if (periodStr === 'yesterday') {
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        where.createdAt = { gte: startOfYesterday, lt: startOfToday };
      } else {
        const since = new Date(now);
        let known = true;
        switch (periodStr) {
          case '3days': since.setDate(since.getDate() - 3); break;
          case 'week': since.setDate(since.getDate() - 7); break;
          case 'month': since.setMonth(since.getMonth() - 1); break;
          case '3months': since.setMonth(since.getMonth() - 3); break;
          case 'year': since.setFullYear(since.getFullYear() - 1); break;
          default: known = false; break;
        }
        if (known) where.createdAt = { gte: since };
      }
    }

    // city — comma-separated list, exact match on stored names
    if (city) {
      const cityNames = qstr(city)
        .split(',')
        .map(c => c.trim())
        .filter(Boolean)
        .slice(0, 50);
      if (cityNames.length > 0) where.city = { in: cityNames };
    }

    // ── Contextual filters (E4) ──────────────────────────────────────────────
    // Employment status — filter by the post author's occupancy status
    // (shown in UI for «Резидент» author or «Апдейт занятости» type).
    const employmentStr = qstr(employment);
    if (employmentStr && employmentStr !== 'all' && EMPLOYMENT_STATUSES.includes(employmentStr)) {
      where.author = { ...where.author, occupancyStatus: employmentStr };
    }
    // Artist type — only artist posts have an artist relation (shown for «Артист»).
    const artistTypeStr = qstr(artistType);
    if (artistTypeStr && artistTypeStr !== 'all' && (Object.values(ArtistType) as string[]).includes(artistTypeStr)) {
      where.artist = { ...(where.artist || {}), type: artistTypeStr };
    }
    // Genre — artist posts whose artist is tagged with the given genre.
    const genreStr = qstr(genre);
    if (genreStr && genreStr !== 'all') {
      where.artist = { ...(where.artist || {}), genres: { some: { genre: { name: genreStr.slice(0, 100) } } } };
    }

    let posts: any[];
    let nextCursor: string | null = null;
    let isFirstPage: boolean;

    if (sortStr !== 'new') {
      // ── Ранжированные сортировки: snapshot id-списка ─────────────────────
      const ctx: RankCtx = {
        where,
        sort: sortStr,
        vid: req.userId || null,
        cacheKey: `${req.userId || 'guest'}|${typeStr}|${kind}|${periodStr}|${qstr(city)}|${employmentStr}|${artistTypeStr}|${genreStr}`,
        kind,
        typeTypes,
        teamUserId,
      };
      let ids: string[];
      let start: number;
      let token = '';
      if (useCursor) {
        const m = /^s:([\w-]{8,64}):(\d{1,6})$/.exec(cursor);
        if (m) {
          token = m[1];
          start = Number(m[2]);
          const snap = getSnapshot(token);
          if (snap) ids = snap;
          else { ids = await computeRankedIds(ctx); putSnapshot(token, ids); }
        } else {
          start = 0;
          const snapKey = `${sortStr}|${ctx.cacheKey}`;
          const prevToken = snapshotTokenByKey.get(snapKey);
          const prev = prevToken ? rankSnapshots.get(prevToken) : undefined;
          if (prevToken && prev && Date.now() - prev.at < SNAPSHOT_REUSE_MS) {
            token = prevToken;
            ids = prev.ids;
          } else {
            token = crypto.randomUUID();
            ids = await computeRankedIds(ctx);
            putSnapshot(token, ids);
            if (snapshotTokenByKey.size > 2000) snapshotTokenByKey.clear();
            snapshotTokenByKey.set(snapKey, token);
          }
        }
      } else {
        ids = await computeRankedIds(ctx);
        start = offsetNum;
      }
      const pageIds = ids.slice(start, start + limitNum);
      posts = pageIds.length ? await prisma.post.findMany({ where: { id: { in: pageIds } }, include }) : [];
      const orderMap = new Map(pageIds.map((id, i) => [id, i]));
      posts.sort((a, b) => (orderMap.get(a.id)! - orderMap.get(b.id)!));
      if (useCursor && start + limitNum < ids.length) nextCursor = `s:${token}:${start + limitNum}`;
      isFirstPage = start === 0;
    } else if (useCursor) {
      // ── «Новые»: курсор (createdAt, id) ──────────────────────────────────
      const c = parseTimeCursor(cursor);
      const cursorWhere = c
        ? { OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] }
        : null;
      const rows = await prisma.post.findMany({
        where: cursorWhere ? { AND: [where, cursorWhere] } : where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limitNum + 1,
      });
      posts = rows.slice(0, limitNum);
      if (rows.length > limitNum) {
        const last = posts[posts.length - 1];
        nextCursor = `${new Date(last.createdAt).toISOString()}|${last.id}`;
      }
      isFirstPage = !c;
    } else {
      posts = await prisma.post.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limitNum,
        skip: offsetNum,
      });
      isFirstPage = offsetNum === 0;
    }

    // Pin team welcome posts at the top — only on the first page of the default
    // feed (no type/author filter) and only for users with no posts of their own.
    // Для «Для вас» они уже в начале снапшота.
    let pinnedPosts: any[] = [];
    const isDefaultFeed = typeTypes.length === 0 && kind === 'all';
    if (sortStr !== 'smart' && isDefaultFeed && isFirstPage && req.userId && teamUserId) {
      const myPostsCount = await prisma.post.count({ where: { authorId: req.userId } });
      if (myPostsCount === 0) {
        pinnedPosts = await prisma.post.findMany({
          where: { authorId: teamUserId },
          include,
          orderBy: { createdAt: 'asc' },
          take: 7,
        });
      }
    }

    const pinnedIds = new Set(pinnedPosts.map(p => p.id));
    const items = await decoratePosts([
      ...pinnedPosts,
      ...posts.filter(p => !pinnedIds.has(p.id)),
    ]);

    if (useCursor) res.json({ items, nextCursor });
    else res.json(items);
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

// Create post
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      content, imageUrl, audioUrl, audioName, employmentStatus, pollOptions, pollEndsAt, channelId, artistId,
      images, tags, genres, links, city, title, category, serviceId,
    } = req.body;
    const type: string = req.body.type === undefined || req.body.type === null || req.body.type === '' ? 'blog' : req.body.type;

    if (typeof type !== 'string' || !CREATABLE_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Недопустимый тип поста' });
    }
    if (content !== undefined && content !== null && typeof content !== 'string') {
      return res.status(400).json({ error: 'Некорректный текст поста' });
    }
    if (typeof content === 'string' && content.length > CONTENT_MAX) {
      return res.status(400).json({ error: 'Слишком длинный пост' });
    }
    if (title !== undefined && title !== null && (typeof title !== 'string' || title.trim().length > TITLE_MAX)) {
      return res.status(400).json({ error: `Заголовок — не длиннее ${TITLE_MAX} символов` });
    }
    if (category !== undefined && category !== null && (typeof category !== 'string' || category.trim().length > CATEGORY_MAX)) {
      return res.status(400).json({ error: 'Некорректная категория' });
    }

    // Media — только наши загрузки
    if (images !== undefined && images !== null && !Array.isArray(images)) {
      return res.status(400).json({ error: 'Некорректные фото' });
    }
    const imagesArr: string[] = Array.isArray(images) ? images : [];
    if (imagesArr.length > MAX_IMAGES) {
      return res.status(400).json({ error: `Не больше ${MAX_IMAGES} фото` });
    }
    if (imagesArr.some((u) => typeof u !== 'string' || !POST_IMAGE_RE.test(u))) {
      return res.status(400).json({ error: 'Некорректная ссылка на фото' });
    }
    if (imageUrl && (typeof imageUrl !== 'string' || !POST_IMAGE_RE.test(imageUrl))) {
      return res.status(400).json({ error: 'Некорректная ссылка на фото' });
    }
    if (audioUrl && (typeof audioUrl !== 'string' || !POST_AUDIO_RE.test(audioUrl))) {
      return res.status(400).json({ error: 'Некорректная ссылка на аудио' });
    }
    const audioNameStr = typeof audioName === 'string' ? audioName.trim().slice(0, 200) : '';

    // Links — только http(s)
    if (links !== undefined && links !== null && !Array.isArray(links)) {
      return res.status(400).json({ error: 'Некорректные ссылки' });
    }
    const linksRaw: unknown[] = Array.isArray(links) ? links : [];
    if (linksRaw.length > MAX_LINKS) {
      return res.status(400).json({ error: `Не больше ${MAX_LINKS} ссылок` });
    }
    const linksArr: string[] = [];
    for (const l of linksRaw) {
      const n = normalizeLink(l);
      if (!n) return res.status(400).json({ error: `Некорректная ссылка: ${String(l).slice(0, 80)}` });
      if (!linksArr.includes(n)) linksArr.push(n);
    }
    const tagsArr = normalizeStringList(tags, MAX_TAGS, 40).map((t) => t.replace(/^#+/, '')).filter(Boolean);
    const genresArr = normalizeStringList(genres, MAX_TAGS, 60);

    // City — только из каталога
    const cityName = await resolveCity(city);
    if (cityName === null) return res.status(400).json({ error: 'Выберите город из списка' });

    if (type === 'employment' && employmentStatus !== undefined && employmentStatus !== null && employmentStatus !== ''
      && !EMPLOYMENT_STATUSES.includes(employmentStatus)) {
      return res.status(400).json({ error: 'Некорректный статус занятости' });
    }
    const employmentStatusStr: string | null = type === 'employment' && EMPLOYMENT_STATUSES.includes(employmentStatus) ? employmentStatus : null;

    const { html: safeContent, mentions } = await sanitizePostContent(typeof content === 'string' ? content : '');
    const hasText = plainText(safeContent).length > 0;

    const isPoll = type === 'poll';
    let pollOptionsArr: { text: string; votes: number }[] = [];
    let pollEndsAtDate: Date | null = null;
    if (isPoll) {
      if (!Array.isArray(pollOptions)) {
        return res.status(400).json({ error: 'Poll requires at least 2 non-empty options' });
      }
      const opts = pollOptions
        .filter((o: unknown): o is string => typeof o === 'string')
        .map((o) => o.trim())
        .filter(Boolean);
      if (opts.length < POLL_OPTIONS_MIN) {
        return res.status(400).json({ error: 'Poll requires at least 2 non-empty options' });
      }
      if (opts.length > POLL_OPTIONS_MAX) {
        return res.status(400).json({ error: `Не больше ${POLL_OPTIONS_MAX} вариантов ответа` });
      }
      if (opts.some((o) => o.length > POLL_OPTION_LEN)) {
        return res.status(400).json({ error: `Вариант ответа — не длиннее ${POLL_OPTION_LEN} символов` });
      }
      pollOptionsArr = opts.map((text) => ({ text, votes: 0 }));
      if (pollEndsAt) {
        const d = new Date(pollEndsAt);
        const maxEnd = Date.now() + 366 * 24 * 60 * 60 * 1000;
        if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now() || d.getTime() > maxEnd) {
          return res.status(400).json({ error: 'Некорректная дата окончания опроса' });
        }
        pollEndsAtDate = d;
      }
    } else if (type === 'question') {
      if (!(typeof title === 'string' && title.trim()) || !hasText) {
        return res.status(400).json({ error: 'Вопрос требует заголовок и текст' });
      }
    } else if (
      !hasText && !imageUrl && !audioUrl && imagesArr.length === 0
      && !(type === 'employment' && employmentStatusStr)
      // Структурный пост «Услуга»: карточка услуги — само содержимое,
      // текст-комментарий опционален.
      && !(type === 'service' && serviceId)
    ) {
      return res.status(400).json({ error: 'Пост не может быть пустым' });
    }

    // Structured «Услуга» post — validate the linked offering belongs to the author.
    // (Freeform service posts without a serviceId keep working unchanged.)
    let linkedServiceId: string | null = null;
    if (type === 'service' && serviceId) {
      const owned = await prisma.userService.findFirst({
        where: { id: String(serviceId), userId: req.userId! },
        select: { id: true },
      });
      if (!owned) {
        return res.status(403).json({ error: 'Услуга не найдена или не принадлежит вам' });
      }
      linkedServiceId = owned.id;
    }

    // E8 — service update rate limit (per-user, lite): max 1 service post / 24h.
    // TODO: per-service once serviceId is modeled
    if (type === 'service') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await prisma.post.findFirst({
        where: { authorId: req.userId!, type: 'service', createdAt: { gte: since } },
        select: { id: true },
      });
      if (recent) {
        return res.status(429).json({ error: 'Апдейт услуги можно публиковать не чаще 1 раза в 24 часа' });
      }
    }

    // Validate author choice: channelId / artistId mutually exclusive, and user must own them
    if (channelId && artistId) {
      return res.status(400).json({ error: 'Cannot post as both channel and artist' });
    }
    if (channelId) {
      const channel = await prisma.channel.findUnique({ where: { id: String(channelId) }, select: { ownerId: true } });
      if (!channel || channel.ownerId !== req.userId) {
        return res.status(403).json({ error: 'Not allowed to post as this channel' });
      }
    }
    if (artistId) {
      const membership = await prisma.userArtist.findFirst({
        where: { userId: req.userId!, artistId: String(artistId), isOwner: true, inviteStatus: 'ACCEPTED' },
      });
      if (!membership) {
        return res.status(403).json({ error: 'Not allowed to post as this artist' });
      }
    }
    // Employment posts are only from the user (not channel/artist)
    const effectiveChannelId = type === 'employment' ? null : (channelId ? String(channelId) : null);
    const effectiveArtistId = type === 'employment' ? null : (artistId ? String(artistId) : null);

    const post = await prisma.post.create({
      data: {
        content: safeContent,
        type,
        imageUrl: imageUrl || null,
        audioUrl: audioUrl || null,
        audioName: audioUrl ? (audioNameStr || null) : null,
        authorId: req.userId!,
        channelId: effectiveChannelId,
        artistId: effectiveArtistId,
        images: imagesArr,
        tags: tagsArr,
        genres: genresArr,
        links: linksArr,
        city: cityName || null,
        ...(mentions.length ? { mentions } : {}),
        title: typeof title === 'string' && title.trim() ? title.trim() : null,
        category: typeof category === 'string' && category.trim() ? category.trim() : null,
        serviceId: linkedServiceId,
        ...(isPoll ? {
          pollOptions: pollOptionsArr,
          pollEndsAt: pollEndsAtDate,
        } : {}),
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, isPremium: true, isVerified: true, isBlocked: true } },
        channel: { select: { id: true, name: true, avatar: true } },
        artist: { select: { id: true, name: true, avatar: true } },
        service: {
          select: {
            id: true,
            name: true,
            priceFrom: true,
            priceTo: true,
            priceItems: true,
            service: { select: { name: true, section: { select: { name: true } } } },
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      }
    });

    // If employment post — auto-update user's occupancyStatus
    if (type === 'employment' && employmentStatusStr && req.userId) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { occupancyStatus: employmentStatusStr },
      });
    }

    // В админ-чат — только событие + id/автор (текст поста — HTML TipTap, не шлём).
    const author = post.author;
    const media = [(imageUrl || imagesArr.length) && '🖼', audioUrl && '🎵'].filter(Boolean).join(' ');
    tgLog(`📝 <b>Новый пост</b> (${escTg(type)})\n👤 ${escTg(`${author.firstName} ${author.lastName}`)}\n🆔 ${escTg(post.id)}${media ? '\n' + media : ''}`);
    res.status(201).json(post);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// POST /api/posts/:id/repost — repost an existing post to the feed
router.post('/:id/repost', authenticate, async (req: AuthRequest, res) => {
  try {
    const { comment } = req.body;
    if (comment !== undefined && comment !== null && typeof comment !== 'string') {
      return res.status(400).json({ error: 'Некорректный комментарий' });
    }
    const commentStr = typeof comment === 'string' ? comment.trim() : '';
    if (commentStr.length > REPOST_COMMENT_MAX) {
      return res.status(400).json({ error: `Комментарий — не длиннее ${REPOST_COMMENT_MAX} символов` });
    }

    // Verify the original exists (don't allow reposting a deleted/nonexistent post)
    const original = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!original) return res.status(404).json({ error: 'Post not found' });

    // repostComment рендерится через PostContent — HTML санитизируем так же, как пост.
    const { html: safeComment } = await sanitizePostContent(commentStr);

    const post = await prisma.post.create({
      data: {
        authorId: req.userId!,
        type: 'blog',
        content: '',
        repostOfId: req.params.id,
        repostComment: safeComment || null,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, isPremium: true, isVerified: true, isBlocked: true } },
        repostOf: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, isPremium: true, isVerified: true } }
          }
        },
      },
    });

    res.status(201).json(post);
  } catch (error) {
    console.error('Repost error:', error);
    res.status(500).json({ error: 'Failed to repost' });
  }
});

// POST /api/posts/:id/save — save / unsave post.
// Body `{ saved: boolean }` задаёт состояние явно (идемпотентно — двойной клик
// не переворачивает его обратно); без тела — легаси-переключатель.
router.post('/:id/save', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const postId = req.params.id;
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    let saved: boolean;
    if (typeof req.body?.saved === 'boolean') {
      saved = req.body.saved;
    } else {
      const existing = await prisma.savedPost.findUnique({
        where: { userId_postId: { userId: meId, postId } },
        select: { id: true },
      });
      saved = !existing;
    }

    if (saved) {
      const created = await prisma.savedPost.createMany({ data: [{ userId: meId, postId }], skipDuplicates: true });
      if (created.count > 0) {
        try {
          const saver = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
          tgEvent.postSave(`${saver?.firstName} ${saver?.lastName}`);
        } catch {}
      }
    } else {
      await prisma.savedPost.deleteMany({ where: { userId: meId, postId } });
    }
    res.json({ saved });
  } catch (e: any) {
    console.error('Save post error:', e);
    res.status(500).json({ error: 'Failed to save post' });
  }
});

// GET /api/posts/saved/list — saved posts of current user.
// `?cursor=` (пусто — первая страница) → `{ items, nextCursor }`; без cursor —
// легаси-массив (не больше 50 последних).
router.get('/saved/list', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const useCursor = req.query.cursor !== undefined;
    const limitNum = parseLimit(req.query.limit, useCursor ? 20 : MAX_PAGE);
    const c = useCursor ? parseTimeCursor(qstr(req.query.cursor)) : null;
    const rows = await prisma.savedPost.findMany({
      where: {
        userId: meId,
        ...(c ? { OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limitNum + 1,
      include: { post: { include: buildFeedInclude(meId) } },
    });
    const page = rows.slice(0, limitNum);
    const decorated = await decoratePosts(page.map((s) => s.post));
    const items = decorated.map((p, i) => ({ ...p, savedAt: page[i].createdAt, isSaved: true }));
    if (!useCursor) return res.json(items);
    const last = page[page.length - 1];
    res.json({
      items,
      nextCursor: rows.length > limitNum && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    });
  } catch (e: any) {
    console.error('Saved posts error:', e);
    res.status(500).json({ error: 'Failed to get saved posts' });
  }
});

// POST /api/posts/:id/vote — vote in poll
// Голос и пересчёт — в одной транзакции под блокировкой строки поста: параллельные
// голоса не затирают счётчики друг друга и не ловят P2002.
router.post('/:id/vote', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const postId = req.params.id;
    const { optionIndex } = req.body;
    if (!Number.isInteger(optionIndex) || optionIndex < 0) {
      return res.status(400).json({ error: 'optionIndex required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${postId} FOR UPDATE`;
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { id: true, type: true, pollOptions: true, pollEndsAt: true },
      });
      if (!post || post.type !== 'poll') throw new HttpError(404, 'Poll not found');
      if (post.pollEndsAt && new Date(post.pollEndsAt) < new Date()) throw new HttpError(400, 'Poll ended');
      const options = (Array.isArray(post.pollOptions) ? post.pollOptions : []) as any[];
      if (optionIndex >= options.length) throw new HttpError(400, 'Нет такого варианта');

      await tx.pollVote.upsert({
        where: { postId_userId: { postId, userId: meId } },
        update: { optionIndex },
        create: { postId, userId: meId, optionIndex },
      });
      const counts = await tx.pollVote.groupBy({
        by: ['optionIndex'],
        where: { postId },
        _count: { _all: true },
      });
      const byIndex = new Map(counts.map((c) => [c.optionIndex, c._count._all]));
      const updated = options.map((opt: any, i: number) => ({ text: opt?.text ?? '', votes: byIndex.get(i) ?? 0 }));
      // Raw UPDATE: не трогаем updatedAt (иначе голос помечает пост «Изменена»).
      await tx.$executeRaw`UPDATE "Post" SET "pollOptions" = ${JSON.stringify(updated)}::jsonb WHERE "id" = ${postId}`;
      return { options, updated };
    });

    try {
      const voter = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
      tgEvent.pollVote(`${voter?.firstName} ${voter?.lastName}`, result.options[optionIndex]?.text || `#${optionIndex}`);
    } catch {}

    res.json({ ok: true, options: result.updated, myVote: optionIndex });
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error('Poll vote error:', e);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// GET /api/posts/:id/comments — комментарии поста постранично (шторка комментариев).
// Верхний уровень — от старых к новым, курсор `<createdAt>|<id>`; ответы — вложенно.
router.get('/:id/comments', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const postId = req.params.id;
    const limitNum = parseLimit(req.query.limit, 20);
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const c = parseTimeCursor(qstr(req.query.cursor));
    const authorSelect = { id: true, firstName: true, lastName: true, nickname: true, avatar: true };
    const reactionSelect = { id: true, emoji: true, userId: true };
    const rows = await prisma.comment.findMany({
      where: {
        postId,
        parentCommentId: null,
        ...(c ? { OR: [{ createdAt: { gt: c.at } }, { createdAt: c.at, id: { gt: c.id } }] } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limitNum + 1,
      include: {
        author: { select: authorSelect },
        reactions: { select: reactionSelect },
        replies: {
          include: { author: { select: authorSelect }, reactions: { select: reactionSelect } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 100,
        },
        _count: { select: { replies: true } },
      },
    });
    const items = rows.slice(0, limitNum);
    const last = items[items.length - 1];
    res.json({
      items,
      nextCursor: rows.length > limitNum && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// Get post by ID (deep link ?post=… — доступно и гостю, как лента)
router.get('/:id', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const post = await prisma.post.findFirst({
      where: { id: req.params.id, author: visibleAuthorWhere() },
      include: buildFeedInclude(req.userId),
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const [decorated] = await decoratePosts([post]);
    res.json(decorated);
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// Like post (идемпотентно: повторный лайк — не ошибка)
router.post('/:id/like', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      select: { authorId: true, author: { select: { firstName: true, lastName: true } } },
    });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.authorId === meId) return res.status(400).json({ error: 'Нельзя лайкать свой пост' });

    const created = await prisma.like.createMany({
      data: [{ userId: meId, postId: req.params.id }],
      skipDuplicates: true,
    });

    if (created.count > 0) {
      try {
        const liker = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
        tgEvent.postLike(`${liker?.firstName} ${liker?.lastName}`, `${post.author.firstName} ${post.author.lastName}`);
      } catch {}
    }

    res.status(201).json({ liked: true });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Unlike post
router.delete('/:id/like', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.like.deleteMany({
      where: {
        userId: req.userId,
        postId: req.params.id,
      }
    });

    // Return success even if no like was deleted (idempotent)
    res.status(204).send();
  } catch (error) {
    console.error('Unlike post error:', error);
    res.status(500).json({ error: 'Failed to unlike post' });
  }
});

function commentPreview(text: string): string {
  if (!text) return '📷 Картинка';
  return text.length > 60 ? text.slice(0, 60) + '…' : text;
}

// Comment on post
router.post('/:id/comments', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const postId = req.params.id;
    const { content, parentCommentId, imageUrl } = req.body;

    if (content !== undefined && content !== null && typeof content !== 'string') {
      return res.status(400).json({ error: 'Некорректный текст комментария' });
    }
    const text = typeof content === 'string' ? content.trim() : '';
    if (text.length > COMMENT_MAX) {
      return res.status(400).json({ error: `Комментарий — не длиннее ${COMMENT_MAX} символов` });
    }
    if (imageUrl && (typeof imageUrl !== 'string' || !POST_IMAGE_RE.test(imageUrl))) {
      return res.status(400).json({ error: 'Некорректная картинка' });
    }
    if (!text && !imageUrl) {
      return res.status(400).json({ error: 'Нужен текст или картинка' });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    let parent: { id: string; postId: string; parentCommentId: string | null; authorId: string } | null = null;
    if (parentCommentId) {
      parent = await prisma.comment.findUnique({
        where: { id: String(parentCommentId) },
        select: { id: true, postId: true, parentCommentId: true, authorId: true },
      });
      if (!parent || parent.postId !== postId) {
        return res.status(400).json({ error: 'Комментарий не найден в этом посте' });
      }
      if (parent.parentCommentId) {
        return res.status(400).json({ error: 'Нельзя ответить на ответ' });
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content: text,
        imageUrl: imageUrl || null,
        authorId: meId,
        postId,
        ...(parent ? { parentCommentId: parent.id } : {}),
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true }
        }
      }
    });

    const actorName = `${comment.author.firstName} ${comment.author.lastName}`;
    const body = `${actorName}: ${commentPreview(text)}`;
    const link = `/?post=${postId}`;

    // Уведомления — через общий notify() (запись + сокет + push, с учётом настроек).
    if (!parent) {
      // Notify post author (unless they commented on their own post)
      if (post.authorId !== meId) {
        await notify({ userId: post.authorId, actorId: meId, type: 'post_reply', title: 'Новый комментарий', body, link });
        if (await isNotificationEnabled(post.authorId, 'post_reply')) {
          emitToUser(post.authorId, 'post_reply', { comment, postId });
        }
      }
    } else {
      // Автор родительского комментария — об ответе ему
      if (parent.authorId !== meId) {
        await notify({ userId: parent.authorId, actorId: meId, type: 'post_reply', title: 'Ответ на комментарий', body, link });
      }
      // Автор поста — об ответах в обсуждении под его постом
      if (post.authorId !== meId && post.authorId !== parent.authorId) {
        await notify({ userId: post.authorId, actorId: meId, type: 'post_reply', title: 'Новый ответ под вашим постом', body, link });
      }
    }

    try {
      const postAuthor = await prisma.user.findUnique({ where: { id: post.authorId }, select: { firstName: true, lastName: true } });
      tgEvent.postComment(
        actorName,
        `${postAuthor?.firstName ?? '?'} ${postAuthor?.lastName ?? ''}`,
        text || '📷',
      );
    } catch {}

    res.status(201).json(comment);
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Failed to comment' });
  }
});

// Edit post — меняется только то, что передано. images[] поддерживается
// (удалить/заменить фото); новые фото — только наши загрузки, уже
// прикреплённые к посту — допускаются как есть (легаси-имена).
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.authorId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    const { content, imageUrl, images, audioUrl, audioName } = req.body;
    const existingMedia = new Set<string>([...(post.images || []), ...(post.imageUrl ? [post.imageUrl] : [])]);
    const okImage = (u: unknown) => typeof u === 'string' && (POST_IMAGE_RE.test(u) || existingMedia.has(u));

    const data: Prisma.PostUpdateInput = {};

    if (content !== undefined) {
      if (content !== null && typeof content !== 'string') return res.status(400).json({ error: 'Некорректный текст поста' });
      if (typeof content === 'string' && content.length > CONTENT_MAX) return res.status(400).json({ error: 'Слишком длинный пост' });
      const { html, mentions } = await sanitizePostContent(content || '');
      data.content = html;
      data.mentions = mentions.length ? mentions : Prisma.DbNull;
    }

    let nextImages = post.images || [];
    let nextImageUrl = post.imageUrl;
    if (images !== undefined) {
      if (!Array.isArray(images)) return res.status(400).json({ error: 'Некорректные фото' });
      if (images.length > MAX_IMAGES) return res.status(400).json({ error: `Не больше ${MAX_IMAGES} фото` });
      if (!images.every(okImage)) return res.status(400).json({ error: 'Некорректная ссылка на фото' });
      nextImages = Array.from(new Set(images as string[]));
      data.images = nextImages;
      // Легаси-поле одной картинки держим синхронным с первой из images
      if (imageUrl === undefined) {
        nextImageUrl = nextImages[0] ?? null;
        data.imageUrl = nextImageUrl;
      }
    }
    if (imageUrl !== undefined) {
      if (imageUrl && !okImage(imageUrl)) return res.status(400).json({ error: 'Некорректная ссылка на фото' });
      nextImageUrl = imageUrl || null;
      data.imageUrl = nextImageUrl;
    }
    let nextAudio = post.audioUrl;
    if (audioUrl !== undefined) {
      if (audioUrl && (typeof audioUrl !== 'string' || !(POST_AUDIO_RE.test(audioUrl) || audioUrl === post.audioUrl))) {
        return res.status(400).json({ error: 'Некорректная ссылка на аудио' });
      }
      nextAudio = audioUrl || null;
      data.audioUrl = nextAudio;
      if (!nextAudio) data.audioName = null;
    }
    if (audioName !== undefined && nextAudio) {
      data.audioName = typeof audioName === 'string' && audioName.trim() ? audioName.trim().slice(0, 200) : null;
    }

    // Обычный пост не должен стать пустым после правки
    const nextContent = data.content !== undefined ? String(data.content) : post.content;
    const structured = ['poll', 'service', 'employment', 'order', 'vacancy'].includes(post.type) || !!post.repostOfId;
    if (!structured && !plainText(nextContent) && nextImages.length === 0 && !nextImageUrl && !nextAudio) {
      return res.status(400).json({ error: 'Пост не может быть пустым' });
    }
    if (post.type === 'question' && !plainText(nextContent)) {
      return res.status(400).json({ error: 'Вопрос требует текст' });
    }

    const updated = await prisma.post.update({
      where: { id: req.params.id },
      data,
      include: {
        author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, isPremium: true, isVerified: true, isBlocked: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Edit post error:', error);
    res.status(500).json({ error: 'Failed to edit post' });
  }
});

// Edit comment
router.put('/:postId/comments/:commentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'Content is required' });
    if (content.trim().length > COMMENT_MAX) {
      return res.status(400).json({ error: `Комментарий — не длиннее ${COMMENT_MAX} символов` });
    }

    const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.postId !== req.params.postId) return res.status(400).json({ error: 'Comment does not belong to this post' });
    if (comment.authorId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    const updated = await prisma.comment.update({
      where: { id: req.params.commentId },
      data: { content: content.trim() },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Edit comment error:', error);
    res.status(500).json({ error: 'Failed to edit comment' });
  }
});

// Delete comment
router.delete('/:postId/comments/:commentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: req.params.commentId },
      include: { post: { select: { authorId: true } } }
    });

    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.postId !== req.params.postId) return res.status(400).json({ error: 'Comment does not belong to this post' });

    // Удалить может автор комментария или автор поста (модерация своего треда)
    if (comment.authorId !== req.userId && comment.post.authorId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.comment.delete({ where: { id: req.params.commentId } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// React to post (add or change reaction)
router.post('/:id/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    const { emoji } = req.body;
    if (typeof emoji !== 'string' || !REACTION_EMOJIS.includes(emoji)) {
      return res.status(400).json({ error: 'Недопустимая реакция' });
    }
    const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const reaction = await prisma.postReaction.upsert({
      where: { userId_postId: { userId: req.userId!, postId: req.params.id } },
      update: { emoji },
      create: { emoji, userId: req.userId!, postId: req.params.id },
    });

    try {
      const reactor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { firstName: true, lastName: true } });
      tgEvent.postReaction(`${reactor?.firstName} ${reactor?.lastName}`, emoji);
    } catch {}

    res.json(reaction);
  } catch (error: any) {
    // Гонка двух первых реакций одного пользователя — запись уже есть.
    if (error?.code === 'P2002') return res.json({ ok: true });
    console.error('Post reaction error:', error);
    res.status(500).json({ error: 'Failed to react' });
  }
});

// Remove reaction from post
router.delete('/:id/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.postReaction.deleteMany({
      where: { userId: req.userId!, postId: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Remove post reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// React to comment
router.post('/:postId/comments/:commentId/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    const { emoji } = req.body;
    if (typeof emoji !== 'string' || !REACTION_EMOJIS.includes(emoji)) {
      return res.status(400).json({ error: 'Недопустимая реакция' });
    }
    const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId }, select: { postId: true } });
    if (!comment || comment.postId !== req.params.postId) return res.status(404).json({ error: 'Comment not found' });

    const reaction = await prisma.commentReaction.upsert({
      where: { userId_commentId: { userId: req.userId!, commentId: req.params.commentId } },
      update: { emoji },
      create: { emoji, userId: req.userId!, commentId: req.params.commentId },
    });

    res.json(reaction);
  } catch (error: any) {
    if (error?.code === 'P2002') return res.json({ ok: true });
    console.error('Comment reaction error:', error);
    res.status(500).json({ error: 'Failed to react' });
  }
});

// Remove reaction from comment
router.delete('/:postId/comments/:commentId/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.commentReaction.deleteMany({
      where: { userId: req.userId!, commentId: req.params.commentId },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Remove comment reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// Delete post
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.authorId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // E5 — mark reposts of this post so the frontend can render a "Пост удалён"
    // placeholder. onDelete SetNull will null their repostOfId on delete below.
    await prisma.post.updateMany({
      where: { repostOfId: req.params.id },
      data: { repostDeleted: true },
    });

    // Remove stale notifications referencing this post before deleting it
    await prisma.notification.deleteMany({
      where: { link: { contains: post.id } },
    });

    await prisma.post.delete({
      where: { id: req.params.id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

export default router;
