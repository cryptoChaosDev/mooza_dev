/**
 * «Биржа лайнапов» — /api/lineups.
 *
 * Запрос «нужен артист на концерт» публикует ЛЮБОЙ авторизованный пользователь
 * (промоутер, клуб, организатор). Откликается админ/владелец артиста ОТ ИМЕНИ
 * артиста (права — только lib/artistAccess: ACCEPTED owner/admin); автор
 * запроса видит отклики карточками артиста (релизы, слушатели, концерты).
 *
 * Гость: лента и карточка запроса — через lib/publicData (белый список, автор
 * через toPublicPerson, без откликов — только их число).
 *
 * Все смены статусов — условные updateMany по текущему статусу: двойной клик,
 * две вкладки или автор и артист одновременно не проведут переход дважды.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { guestReadLimiter } from '../middleware/rateLimiter';
import { sendPublic } from '../middleware/guest';
import { notify, notifyMany } from '../utils/notify';
import { getPublicLineup, getPublicLineupsPage, notBlockedWhere } from '../lib/publicData';
import {
  artistAdminIds, isArtistAdmin, managedArtistIds, isUniqueViolation,
} from '../lib/artistAccess';
import {
  LINEUP_SLOT_TYPES, LINEUP_FEE_TYPES, LINEUP_MAX_SLOTS, LINEUP_MAX_GENRES, LINEUP_LIVE_STATUS_LIST,
  LINEUP_ARTIST_CARD_SELECT, parseLineupListFilters, buildLineupListWhere, lineupListOrderBy,
  serializeLineupArtistCard, formatEventMsk,
} from '../lib/lineupQuery';
import { notifyMatchingArtists, sendPersonalInvite, InviteResult, LineupForMatching } from '../lib/lineupMatching';

const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
/** Не больше 10 новых запросов от одного автора за сутки (антиспам). */
export const LINEUP_CREATE_DAILY_LIMIT = 10;
/** Дата события — не дальше двух лет вперёд. */
const MAX_EVENT_AHEAD_MS = 2 * 365 * DAY_MS;

// ─────────────────────────────────────────────────────────────────────────────
// Валидация
// ─────────────────────────────────────────────────────────────────────────────

const optionalText = (max: number, label: string) =>
  z.preprocess(
    (v) => (v === undefined || v === null ? null : typeof v === 'string' ? (v.trim() || null) : v),
    z.string({ invalid_type_error: `${label}: ожидается текст` }).max(max, `${label} — до ${max} символов`).nullable(),
  );

const optionalInt = z.preprocess(
  (v) => (v === undefined || v === null || v === '' ? null : typeof v === 'string' ? Number(v) : v),
  z.number({ invalid_type_error: 'Сумма гонорара — число' }).int('Сумма гонорара — целое число').min(0, 'Сумма гонорара не может быть отрицательной').max(100_000_000, 'Слишком большая сумма').nullable(),
);

export const lineupSchema = z.object({
  title: z.string({ required_error: 'Укажите название события', invalid_type_error: 'Укажите название события' })
    .trim().min(3, 'Название — от 3 символов').max(120, 'Название — до 120 символов'),
  eventDate: z.string({ required_error: 'Укажите дату и время начала', invalid_type_error: 'Укажите дату и время начала' })
    .datetime({ offset: true, message: 'Укажите дату и время начала' })
    .transform((s) => new Date(s)),
  cityName: z.string({ required_error: 'Укажите город', invalid_type_error: 'Укажите город' })
    .trim().min(1, 'Укажите город').max(100, 'Слишком длинное название города'),
  venue: optionalText(200, 'Площадка'),
  genreIds: z.array(z.string().min(1).max(64), { invalid_type_error: 'Некорректный список жанров' })
    .max(LINEUP_MAX_GENRES, `Не больше ${LINEUP_MAX_GENRES} жанров`).optional().default([]),
  slots: z.coerce.number({ invalid_type_error: 'Укажите, сколько артистов нужно' })
    .int('Количество артистов — целое число').min(1, 'Нужен хотя бы один артист').max(LINEUP_MAX_SLOTS, `Не больше ${LINEUP_MAX_SLOTS} артистов`),
  slotType: z.enum(LINEUP_SLOT_TYPES, { errorMap: () => ({ message: 'Выберите слот: разогрев, хедлайнер или любой' }) }),
  feeType: z.enum(LINEUP_FEE_TYPES, { errorMap: () => ({ message: 'Выберите условия гонорара' }) }),
  feeAmount: optionalInt.optional(),
  description: z.string({ required_error: 'Опишите событие', invalid_type_error: 'Опишите событие' })
    .trim().min(10, 'Описание — от 10 символов').max(5000, 'Описание — до 5000 символов'),
  requirements: optionalText(3000, 'Требования'),
  status: z.enum(['active', 'draft'], { errorMap: () => ({ message: 'Некорректный статус' }) }).optional().default('active'),
  inviteArtistId: z.string().max(64).optional().nullable(),
}).superRefine((v, ctx) => {
  const t = v.eventDate.getTime();
  if (!Number.isFinite(t) || t <= Date.now()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventDate'], message: 'Дата и время события должны быть в будущем' });
  } else if (t > Date.now() + MAX_EVENT_AHEAD_MS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventDate'], message: 'Дата события — не дальше чем через 2 года' });
  }
  if (v.feeType === 'fixed' && !(v.feeAmount != null && v.feeAmount > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['feeAmount'], message: 'Укажите сумму гонорара' });
  }
  if (v.feeType === 'percent' && !(v.feeAmount != null && v.feeAmount >= 1 && v.feeAmount <= 100)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['feeAmount'], message: 'Процент от входа — от 1 до 100' });
  }
});

export type LineupInput = z.infer<typeof lineupSchema>;

const respondSchema = z.object({
  artistId: z.string({ required_error: 'Выберите артиста', invalid_type_error: 'Выберите артиста' }).min(1, 'Выберите артиста').max(64),
  message: z.string({ required_error: 'Напишите пару слов организатору', invalid_type_error: 'Напишите пару слов организатору' })
    .trim().min(1, 'Напишите пару слов организатору').max(2000, 'Сообщение — до 2000 символов'),
});

function zodFail(res: Response, err: z.ZodError) {
  const issue = err.issues[0];
  return res.status(400).json({ error: issue?.message || 'Некорректные данные', field: issue?.path?.join('.') || undefined });
}

// Детали ошибок — в лог, клиенту общий текст.
function serverError(res: Response, where: string, e: any) {
  console.error(`[lineups] ${where}`, e);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

/** Каноническое имя и id города из каталога; null — не из каталога. */
async function resolveCity(name: string): Promise<{ id: string; name: string } | null> {
  const city = await prisma.city.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  return city ? { id: city.id, name: city.name } : null;
}

/** Все жанры существуют → дедуплицированный список; иначе null. */
async function resolveGenres(raw: string[]): Promise<string[] | null> {
  const ids = [...new Set(raw)];
  if (!ids.length) return [];
  const found = await prisma.genre.count({ where: { id: { in: ids } } });
  return found === ids.length ? ids : null;
}

async function userName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Сериализация (авторизованный зритель)
// ─────────────────────────────────────────────────────────────────────────────

const LINEUP_SELECT = {
  id: true,
  authorId: true,
  title: true,
  eventDate: true,
  cityId: true,
  cityName: true,
  venue: true,
  slots: true,
  slotType: true,
  feeType: true,
  feeAmount: true,
  description: true,
  requirements: true,
  status: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  genres: { select: { genre: { select: { id: true, name: true } } } },
  author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, isVerified: true, isBlocked: true, blockedUntil: true } },
  _count: { select: { responses: { where: { status: { in: LINEUP_LIVE_STATUS_LIST } } } } },
} as const;

function isBlockedNow(u: { isBlocked?: boolean | null; blockedUntil?: Date | null } | null | undefined, now = new Date()): boolean {
  if (!u) return true;
  return !!u.isBlocked || !!(u.blockedUntil && new Date(u.blockedUntil) >= now);
}

function serializeLineup(l: any, acceptedCount: number, meId: string | null) {
  return {
    id: l.id,
    authorId: l.authorId,
    title: l.title,
    eventDate: l.eventDate,
    cityId: l.cityId ?? null,
    cityName: l.cityName,
    venue: l.venue ?? null,
    slots: l.slots,
    slotType: l.slotType,
    feeType: l.feeType,
    feeAmount: l.feeAmount ?? null,
    description: l.description,
    requirements: l.requirements ?? null,
    status: l.status,
    closedAt: l.closedAt ?? null,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    genres: (l.genres ?? []).map((g: any) => (g?.genre ? { id: g.genre.id, name: g.genre.name } : null)).filter(Boolean),
    author: l.author
      ? {
          id: l.author.id,
          firstName: l.author.firstName ?? '',
          lastName: l.author.lastName ?? '',
          nickname: l.author.nickname ?? null,
          avatar: l.author.avatar ?? null,
          isVerified: !!l.author.isVerified,
        }
      : null,
    responsesCount: l._count?.responses ?? 0,
    acceptedCount,
    isAuthor: !!meId && l.authorId === meId,
    indexable: l.status === 'active' && new Date(l.eventDate).getTime() > Date.now(),
  };
}

async function acceptedCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const grouped = await prisma.lineupResponse.groupBy({
    by: ['requestId'],
    where: { requestId: { in: ids }, status: 'accepted' },
    _count: { _all: true },
  });
  const rows: any[] = (grouped as any[]) ?? [];
  return new Map(rows.map((r) => [r.requestId, Number(r?._count?._all ?? 0)]));
}

const RESPONSE_ORDER: Record<string, number> = { accepted: 0, pending: 1, declined: 2, withdrawn: 3 };

/**
 * Полная карточка запроса для вошедшего:
 *  - автор — все отклики (кроме отозванных) карточками артиста + кому писать;
 *  - админ артиста — от имени каких своих артистов можно откликнуться и его отклики;
 *  - прочие — только счётчики.
 */
async function buildDetail(l: any, meId: string, now: Date = new Date()) {
  const acceptedCount = await prisma.lineupResponse.count({ where: { requestId: l.id, status: 'accepted' } });
  const base = serializeLineup(l, acceptedCount ?? 0, meId);

  if (base.isAuthor) {
    const rows: any[] = (await prisma.lineupResponse.findMany({
      where: { requestId: l.id, status: { not: 'withdrawn' } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, status: true, message: true, createdAt: true, updatedAt: true, artistId: true, submittedById: true,
        submittedBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        artist: { select: LINEUP_ARTIST_CARD_SELECT },
      },
    })) ?? [];
    const responses = [];
    for (const r of rows.filter((x) => x && x.status !== 'withdrawn')) {
      // «Написать» — админу, отправившему отклик (если он всё ещё админ), иначе
      // любому текущему админу/владельцу артиста.
      const admins = await artistAdminIds(r.artistId);
      const contactUserId = r.submittedById && admins.includes(r.submittedById) ? r.submittedById : (admins[0] ?? null);
      responses.push({
        id: r.id,
        status: r.status,
        message: r.message,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        artist: serializeLineupArtistCard(r.artist, now),
        submittedBy: r.submittedBy
          ? { id: r.submittedBy.id, firstName: r.submittedBy.firstName ?? '', lastName: r.submittedBy.lastName ?? '', avatar: r.submittedBy.avatar ?? null }
          : null,
        contactUserId,
      });
    }
    responses.sort((a, b) => (RESPONSE_ORDER[a.status] ?? 9) - (RESPONSE_ORDER[b.status] ?? 9));
    return { ...base, responses, respondAs: [], myResponses: [] };
  }

  const managed = await managedArtistIds(meId);
  if (!managed.length) return { ...base, respondAs: [], myResponses: [] };

  const [artists, mine, authorManaged] = await Promise.all([
    prisma.artist.findMany({
      where: { id: { in: managed } },
      select: { id: true, slug: true, name: true, avatar: true, status: true, city: true },
      orderBy: { name: 'asc' },
    }),
    prisma.lineupResponse.findMany({
      where: { requestId: l.id, artistId: { in: managed } },
      select: { id: true, artistId: true, status: true, message: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    managedArtistIds(l.authorId),
  ]);
  const authorSet = new Set(authorManaged);
  const managedSet = new Set(managed);
  const myResponses = ((mine ?? []) as any[])
    .filter((m) => m && managedSet.has(m.artistId))
    .map((m) => ({ id: m.id, artistId: m.artistId, status: m.status, message: m.message, createdAt: m.createdAt }));
  const respondAs = ((artists ?? []) as any[])
    .filter((a) => a && managedSet.has(a.id) && a.status !== 'REJECTED' && !authorSet.has(a.id))
    .map((a) => ({
      id: a.id,
      slug: a.slug ?? null,
      name: a.name,
      avatar: a.avatar ?? null,
      status: a.status,
      city: a.city ?? null,
      response: myResponses.find((m) => m.artistId === a.id) ?? null,
    }));
  return { ...base, respondAs, myResponses };
}

function toMatching(l: any, genreIds: string[]): LineupForMatching {
  return {
    id: l.id,
    authorId: l.authorId,
    title: l.title,
    eventDate: new Date(l.eventDate),
    cityName: l.cityName,
    slotType: l.slotType,
    genreIds,
  };
}

/** Публикация: персональное приглашение (если есть) и матчинг (в фоне). */
async function onPublished(l: any, genreIds: string[], inviteArtistId: string | null | undefined, meId: string): Promise<InviteResult | null> {
  const m = toMatching(l, genreIds);
  let invite: InviteResult | null = null;
  if (inviteArtistId) {
    try {
      invite = await sendPersonalInvite(m, inviteArtistId, await userName(meId));
    } catch (e) {
      console.error('[lineups] invite failed', e);
      invite = 'unavailable';
    }
  }
  // Матчинг — после приглашения: уже приглашённый артист повторно не уведомляется.
  void notifyMatchingArtists(m);
  return invite;
}

// ─────────────────────────────────────────────────────────────────────────────
// Лента и «мои»
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/lineups?city=&genre=id,id&dateFrom=&dateTo=&sort=new|date&page=&limit=
router.get('/', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      const f = parseLineupListFilters(req.query as Record<string, unknown>, { guest: true });
      return sendPublic(res, await getPublicLineupsPage(f));
    }
    const meId = req.userId;
    const now = new Date();
    const f = parseLineupListFilters(req.query as Record<string, unknown>);
    const where = buildLineupListWhere(f, notBlockedWhere(now), now);
    const [total, rows] = await Promise.all([
      prisma.lineupRequest.count({ where }),
      prisma.lineupRequest.findMany({ where, select: LINEUP_SELECT, orderBy: lineupListOrderBy(f.sort), skip: (f.page - 1) * f.limit, take: f.limit }),
    ]);
    const visible = ((rows ?? []) as any[]).filter((r) => r && r.status === 'active' && !isBlockedNow(r.author, now));
    const acc = await acceptedCounts(visible.map((r) => r.id));
    res.json({
      items: visible.map((r) => serializeLineup(r, acc.get(r.id) ?? 0, meId)),
      page: f.page,
      limit: f.limit,
      total: total ?? 0,
      hasMore: f.page * f.limit < (total ?? 0),
    });
  } catch (e) {
    return serverError(res, 'GET /', e);
  }
});

// GET /api/lineups/mine — мои запросы (все статусы)
router.get('/mine', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const rows: any[] = (await prisma.lineupRequest.findMany({
      where: { authorId: meId },
      select: LINEUP_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })) ?? [];
    const ids = rows.map((r) => r.id);
    const groupedRaw = ids.length
      ? await prisma.lineupResponse.groupBy({
          by: ['requestId', 'status'],
          where: { requestId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const grouped: any[] = (groupedRaw as any[]) ?? [];
    const countOf = (id: string, status: string) =>
      grouped.filter((g) => g.requestId === id && g.status === status).reduce((s, g) => s + Number(g?._count?._all ?? 0), 0);
    res.json(rows.filter((r) => r && r.authorId === meId).map((r) => ({
      ...serializeLineup(r, countOf(r.id, 'accepted'), meId),
      pendingCount: countOf(r.id, 'pending'),
    })));
  } catch (e) {
    return serverError(res, 'GET /mine', e);
  }
});

// GET /api/lineups/my-artists — артисты, от имени которых я могу откликаться
router.get('/my-artists', authenticate, async (req: AuthRequest, res) => {
  try {
    const managed = await managedArtistIds(req.userId!);
    if (!managed.length) return res.json([]);
    const rows: any[] = (await prisma.artist.findMany({
      where: { id: { in: managed }, status: { not: 'REJECTED' } },
      select: { id: true, slug: true, name: true, avatar: true, status: true, city: true },
      orderBy: { name: 'asc' },
    })) ?? [];
    const managedSet = new Set(managed);
    res.json(rows.filter((a) => a && managedSet.has(a.id) && a.status !== 'REJECTED').map((a) => ({
      id: a.id, slug: a.slug ?? null, name: a.name, avatar: a.avatar ?? null, status: a.status, city: a.city ?? null,
    })));
  } catch (e) {
    return serverError(res, 'GET /my-artists', e);
  }
});

// GET /api/lineups/responses/mine — отклики моих артистов
router.get('/responses/mine', authenticate, async (req: AuthRequest, res) => {
  try {
    const managed = await managedArtistIds(req.userId!);
    if (!managed.length) return res.json([]);
    const rows: any[] = (await prisma.lineupResponse.findMany({
      where: { artistId: { in: managed } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, status: true, message: true, createdAt: true, updatedAt: true, artistId: true,
        artist: { select: { id: true, slug: true, name: true, avatar: true } },
        request: {
          select: {
            id: true, title: true, eventDate: true, cityName: true, venue: true, status: true, slots: true,
            slotType: true, feeType: true, feeAmount: true, authorId: true,
            author: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
      },
    })) ?? [];
    const managedSet = new Set(managed);
    res.json(rows.filter((r) => r && managedSet.has(r.artistId) && r.request).map((r) => ({
      id: r.id,
      status: r.status,
      message: r.message,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      artist: r.artist ? { id: r.artist.id, slug: r.artist.slug ?? null, name: r.artist.name, avatar: r.artist.avatar ?? null } : null,
      request: {
        id: r.request.id,
        title: r.request.title,
        eventDate: r.request.eventDate,
        cityName: r.request.cityName,
        venue: r.request.venue ?? null,
        status: r.request.status,
        slots: r.request.slots,
        slotType: r.request.slotType,
        feeType: r.request.feeType,
        feeAmount: r.request.feeAmount ?? null,
        author: r.request.author
          ? { id: r.request.author.id, firstName: r.request.author.firstName ?? '', lastName: r.request.author.lastName ?? '', avatar: r.request.author.avatar ?? null }
          : null,
      },
    })));
  } catch (e) {
    return serverError(res, 'GET /responses/mine', e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Карточка запроса
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return sendPublic(res, await getPublicLineup(req.params.id), 'Запрос не найден');
    }
    const meId = req.userId;
    const l: any = await prisma.lineupRequest.findUnique({ where: { id: req.params.id }, select: LINEUP_SELECT });
    if (!l) return res.status(404).json({ error: 'Запрос не найден' });
    const isAuthor = l.authorId === meId;
    // Черновик видит только автор; запрос заблокированного автора — только сам автор.
    if (!isAuthor && (l.status === 'draft' || isBlockedNow(l.author))) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }
    res.json(await buildDetail(l, meId));
  } catch (e) {
    return serverError(res, 'GET /:id', e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Создание / редактирование / закрытие (автор)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const parsed = lineupSchema.safeParse(req.body ?? {});
    if (!parsed.success) return zodFail(res, parsed.error);
    const v = parsed.data;

    const recent = await prisma.lineupRequest.count({ where: { authorId: meId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
    if ((recent ?? 0) >= LINEUP_CREATE_DAILY_LIMIT) {
      return res.status(429).json({ error: `Не больше ${LINEUP_CREATE_DAILY_LIMIT} запросов в сутки — попробуйте завтра` });
    }

    const city = await resolveCity(v.cityName);
    if (!city) return res.status(400).json({ error: 'Выберите город из списка', field: 'cityName' });
    const genreIds = await resolveGenres(v.genreIds);
    if (genreIds === null) return res.status(400).json({ error: 'Указан несуществующий жанр', field: 'genreIds' });

    const created: any = await prisma.lineupRequest.create({
      data: {
        authorId: meId,
        title: v.title,
        eventDate: v.eventDate,
        cityId: city.id,
        cityName: city.name,
        venue: v.venue,
        slots: v.slots,
        slotType: v.slotType,
        feeType: v.feeType,
        feeAmount: v.feeType === 'fixed' || v.feeType === 'percent' ? (v.feeAmount ?? null) : null,
        description: v.description,
        requirements: v.requirements,
        status: v.status,
        genres: { create: genreIds.map((genreId) => ({ genreId })) },
      },
      select: LINEUP_SELECT,
    });

    const invite = created.status === 'active'
      ? await onPublished(created, genreIds, v.inviteArtistId, meId)
      : null;

    res.status(201).json({ ...(await buildDetail(created, meId)), invite });
  } catch (e) {
    return serverError(res, 'POST /', e);
  }
});

class LineupConflict extends Error {}

router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const existing: any = await prisma.lineupRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true, authorId: true, status: true, eventDate: true, cityName: true, venue: true, title: true },
    });
    if (!existing) return res.status(404).json({ error: 'Запрос не найден' });
    if (existing.authorId !== meId) return res.status(403).json({ error: 'Редактировать запрос может только его автор' });
    if (existing.status === 'closed') return res.status(409).json({ error: 'Запрос закрыт — редактирование недоступно' });

    const parsed = lineupSchema.safeParse(req.body ?? {});
    if (!parsed.success) return zodFail(res, parsed.error);
    const v = parsed.data;
    // Статус не передан — остаётся прежним (черновик не публикуется молча).
    const nextStatus: 'active' | 'draft' = req.body?.status === undefined ? existing.status : v.status;

    const city = await resolveCity(v.cityName);
    if (!city) return res.status(400).json({ error: 'Выберите город из списка', field: 'cityName' });
    const genreIds = await resolveGenres(v.genreIds);
    if (genreIds === null) return res.status(400).json({ error: 'Указан несуществующий жанр', field: 'genreIds' });

    try {
      await prisma.$transaction(async (tx) => {
        // Условно: автор закрыл запрос в соседней вкладке — правка не проходит.
        const upd = await tx.lineupRequest.updateMany({
          where: { id: existing.id, authorId: meId, status: { in: ['active', 'draft'] } },
          data: {
            title: v.title,
            eventDate: v.eventDate,
            cityId: city.id,
            cityName: city.name,
            venue: v.venue,
            slots: v.slots,
            slotType: v.slotType,
            feeType: v.feeType,
            feeAmount: v.feeType === 'fixed' || v.feeType === 'percent' ? (v.feeAmount ?? null) : null,
            description: v.description,
            requirements: v.requirements,
            status: nextStatus,
          },
        });
        if (!upd?.count) throw new LineupConflict();
        await tx.lineupRequestGenre.deleteMany({ where: { requestId: existing.id } });
        if (genreIds.length) {
          await tx.lineupRequestGenre.createMany({ data: genreIds.map((genreId) => ({ requestId: existing.id, genreId })), skipDuplicates: true });
        }
      });
    } catch (e) {
      if (e instanceof LineupConflict) return res.status(409).json({ error: 'Запрос закрыт — редактирование недоступно' });
      throw e;
    }

    const updated: any = await prisma.lineupRequest.findUnique({ where: { id: existing.id }, select: LINEUP_SELECT });
    if (!updated) return res.status(404).json({ error: 'Запрос не найден' });

    let invite: InviteResult | null = null;
    if (existing.status === 'draft' && updated.status === 'active') {
      invite = await onPublished(updated, genreIds, v.inviteArtistId, meId);
    } else if (existing.status === 'active') {
      // Сменились дата/город/площадка — сообщаем артистам с принятым откликом.
      const changed = new Date(existing.eventDate).getTime() !== new Date(updated.eventDate).getTime()
        || existing.cityName !== updated.cityName || (existing.venue ?? null) !== (updated.venue ?? null);
      if (changed) {
        const accepted: any[] = (await prisma.lineupResponse.findMany({
          where: { requestId: updated.id, status: 'accepted' },
          select: { artistId: true },
        })) ?? [];
        const userIds = new Set<string>();
        for (const a of accepted) for (const u of await artistAdminIds(a.artistId)) if (u !== meId) userIds.add(u);
        await notifyMany([...userIds], {
          actorId: meId,
          type: 'lineup_request_updated',
          title: `Изменения в запросе: ${updated.title}`,
          body: `${formatEventMsk(updated.eventDate)} · ${updated.cityName}${updated.venue ? ` · ${updated.venue}` : ''}`,
          link: `/lineups/${updated.id}`,
        });
      }
    }

    res.json({ ...(await buildDetail(updated, meId)), invite });
  } catch (e) {
    return serverError(res, 'PUT /:id', e);
  }
});

router.patch('/:id/close', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const l = await prisma.lineupRequest.findUnique({ where: { id: req.params.id }, select: { id: true, authorId: true } });
    if (!l) return res.status(404).json({ error: 'Запрос не найден' });
    if (l.authorId !== meId) return res.status(403).json({ error: 'Закрыть запрос может только его автор' });
    const upd = await prisma.lineupRequest.updateMany({
      where: { id: l.id, authorId: meId, status: { in: ['active', 'draft'] } },
      data: { status: 'closed', closedAt: new Date() },
    });
    if (!upd?.count) return res.status(409).json({ error: 'Запрос уже закрыт' });
    res.json({ ok: true, status: 'closed' });
  } catch (e) {
    return serverError(res, 'PATCH /:id/close', e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Отклики
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/lineups/:id/respond { artistId, message } — от имени артиста
router.post('/:id/respond', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const parsed = respondSchema.safeParse(req.body ?? {});
    if (!parsed.success) return zodFail(res, parsed.error);
    const { artistId, message } = parsed.data;

    const l: any = await prisma.lineupRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true, authorId: true, title: true, status: true, eventDate: true, author: { select: { isBlocked: true, blockedUntil: true } } },
    });
    if (!l || l.status === 'draft' || (l.authorId !== meId && isBlockedNow(l.author))) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }
    if (l.authorId === meId) return res.status(400).json({ error: 'Нельзя откликнуться на свой запрос' });
    if (l.status !== 'active') return res.status(409).json({ error: 'Запрос закрыт — отклики не принимаются' });
    if (new Date(l.eventDate).getTime() <= Date.now()) return res.status(409).json({ error: 'Событие уже прошло — отклики не принимаются' });

    if (!(await isArtistAdmin(artistId, meId))) {
      return res.status(403).json({ error: 'Откликаться от имени артиста может только его админ или владелец' });
    }
    // Артист, которым управляет сам автор запроса, — тоже «свой запрос».
    if (await isArtistAdmin(artistId, l.authorId)) {
      return res.status(400).json({ error: 'Нельзя откликнуться на свой запрос' });
    }
    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true, status: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });
    if (artist.status === 'REJECTED') return res.status(409).json({ error: 'Артист не прошёл модерацию — отклик недоступен' });

    let response: any;
    try {
      response = await prisma.lineupResponse.create({
        data: { requestId: l.id, artistId, submittedById: meId, message, status: 'pending' },
        select: { id: true, status: true, message: true, artistId: true, createdAt: true },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // Один отклик на артиста. Отозванный можно подать снова — условно по статусу.
      const revived = await prisma.lineupResponse.updateMany({
        where: { requestId: l.id, artistId, status: 'withdrawn' },
        data: { status: 'pending', message, submittedById: meId, createdAt: new Date() },
      });
      if (!revived?.count) return res.status(409).json({ error: 'Этот артист уже откликнулся на запрос' });
      response = await prisma.lineupResponse.findUnique({
        where: { requestId_artistId: { requestId: l.id, artistId } },
        select: { id: true, status: true, message: true, artistId: true, createdAt: true },
      });
    }

    await notify({
      userId: l.authorId,
      actorId: meId,
      type: 'lineup_response',
      title: `Новый отклик: ${artist.name}`,
      body: `На запрос «${l.title}»`,
      link: `/lineups/${l.id}`,
    });

    res.status(201).json(response);
  } catch (e) {
    return serverError(res, 'POST /:id/respond', e);
  }
});

async function loadResponse(id: string) {
  return prisma.lineupResponse.findUnique({
    where: { id },
    select: {
      id: true, status: true, artistId: true, requestId: true,
      artist: { select: { id: true, name: true } },
      request: { select: { id: true, authorId: true, title: true, slots: true, status: true } },
    },
  }) as Promise<any>;
}

// PATCH /api/lineups/responses/:id/accept — автор запроса
router.patch('/responses/:id/accept', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const r = await loadResponse(req.params.id);
    if (!r || !r.request) return res.status(404).json({ error: 'Отклик не найден' });
    if (r.request.authorId !== meId) return res.status(403).json({ error: 'Принимать отклики может только автор запроса' });
    if (r.request.status !== 'active') return res.status(409).json({ error: 'Запрос закрыт' });

    const upd = await prisma.lineupResponse.updateMany({
      where: { id: r.id, status: 'pending', request: { status: 'active', authorId: meId } },
      data: { status: 'accepted' },
    });
    if (!upd?.count) return res.status(409).json({ error: 'Отклик уже обработан' });

    // Переполнение мест при параллельных «Принять»: откатываем свой переход.
    const acceptedCount = (await prisma.lineupResponse.count({ where: { requestId: r.requestId, status: 'accepted' } })) ?? 0;
    if (acceptedCount > r.request.slots) {
      await prisma.lineupResponse.updateMany({ where: { id: r.id, status: 'accepted' }, data: { status: 'pending' } });
      return res.status(409).json({ error: 'Все места уже заняты' });
    }

    const admins = (await artistAdminIds(r.artistId)).filter((u) => u !== meId);
    await notifyMany(admins, {
      actorId: meId,
      type: 'lineup_response_accepted',
      title: `Отклик принят: ${r.request.title}`,
      body: `Организатор принял отклик «${r.artist?.name ?? 'артиста'}». Напишите ему, чтобы обсудить детали.`,
      link: `/lineups/${r.requestId}`,
    });

    res.json({
      ok: true,
      status: 'accepted',
      acceptedCount,
      slots: r.request.slots,
      // Все места заняты — клиент предложит закрыть запрос.
      slotsFilled: acceptedCount >= r.request.slots,
    });
  } catch (e) {
    return serverError(res, 'PATCH /responses/:id/accept', e);
  }
});

// PATCH /api/lineups/responses/:id/decline — автор запроса (из ожидания или принятого)
router.patch('/responses/:id/decline', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const r = await loadResponse(req.params.id);
    if (!r || !r.request) return res.status(404).json({ error: 'Отклик не найден' });
    if (r.request.authorId !== meId) return res.status(403).json({ error: 'Отклонять отклики может только автор запроса' });

    const upd = await prisma.lineupResponse.updateMany({
      where: { id: r.id, status: { in: ['pending', 'accepted'] }, request: { authorId: meId } },
      data: { status: 'declined' },
    });
    if (!upd?.count) return res.status(409).json({ error: 'Отклик уже обработан' });

    const admins = (await artistAdminIds(r.artistId)).filter((u) => u !== meId);
    await notifyMany(admins, {
      actorId: meId,
      type: 'lineup_response_declined',
      title: `Отклик отклонён: ${r.request.title}`,
      body: `Организатор выбрал других артистов для «${r.request.title}».`,
      link: `/lineups/${r.requestId}`,
    });
    res.json({ ok: true, status: 'declined' });
  } catch (e) {
    return serverError(res, 'PATCH /responses/:id/decline', e);
  }
});

// PATCH /api/lineups/responses/:id/withdraw — админ артиста
router.patch('/responses/:id/withdraw', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const r = await loadResponse(req.params.id);
    if (!r || !r.request) return res.status(404).json({ error: 'Отклик не найден' });
    if (!(await isArtistAdmin(r.artistId, meId))) {
      return res.status(403).json({ error: 'Отозвать отклик может только админ или владелец артиста' });
    }
    // Сначала из «ожидает», затем из «принят» — так известно, был ли он принят.
    let wasAccepted = false;
    let upd = await prisma.lineupResponse.updateMany({ where: { id: r.id, status: 'pending' }, data: { status: 'withdrawn' } });
    if (!upd?.count) {
      upd = await prisma.lineupResponse.updateMany({ where: { id: r.id, status: 'accepted' }, data: { status: 'withdrawn' } });
      wasAccepted = !!upd?.count;
    }
    if (!upd?.count) return res.status(409).json({ error: 'Отклик уже обработан' });

    if (wasAccepted && r.request.authorId !== meId) {
      await notify({
        userId: r.request.authorId,
        actorId: meId,
        type: 'lineup_response_withdrawn',
        title: `Артист отозвал отклик: ${r.artist?.name ?? ''}`.trim(),
        body: `Запрос «${r.request.title}» — место снова свободно.`,
        link: `/lineups/${r.requestId}`,
      });
    }
    res.json({ ok: true, status: 'withdrawn' });
  } catch (e) {
    return serverError(res, 'PATCH /responses/:id/withdraw', e);
  }
});

export default router;
