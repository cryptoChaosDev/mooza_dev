import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { notify, notifyMany } from '../utils/notify';
import { uploadVacancyMedia } from '../middleware/upload';
import { matchesLinkSource, detectLinkSource, isAllowedLinkUrl } from '../lib/materialLinks';
import { parseCalendarDay, endOfDayMsk } from '../lib/mskDate';
import { withAdvisoryLock } from '../lib/dealHelpers';
import { artistAdminIds, isArtistAdmin } from '../lib/artistAccess';

const router = Router();

const MAX_REFERENCES_BYTES = 20 * 1024 * 1024; // 20MB total per vacancy / per response portfolio
const VALID_STATUS = new Set(['active', 'draft', 'archived']);
const VALID_WORK_FORMAT = new Set(['online', 'offline', 'hybrid']);
const VALID_GEOGRAPHY = new Set(['city', 'region', 'country', 'international']);
const VALID_EMPLOYMENT = new Set(['permanent', 'partial', 'project', 'intern', 'volunteer']);
const VALID_PAYMENT = new Set(['free', 'barter', 'percent', 'rate']);

// Full vacancy shape returned to the owner / single-vacancy view.
const VACANCY_INCLUDE = {
  profession: { select: { id: true, name: true } },
  selectedCustomFilterValues: { select: { id: true, value: true, filter: { select: { id: true, name: true } } } },
  referenceFiles: { orderBy: { createdAt: 'asc' as const } },
  referenceLinks: { orderBy: { createdAt: 'asc' as const } },
  artist: { select: { id: true, name: true, avatar: true } },
  _count: { select: { responses: true } },
} as const;

// Compact shape for «Мои вакансии» tiles.
const VACANCY_MINE_SELECT = {
  id: true,
  title: true,
  status: true,
  workFormat: true,
  paymentType: true,
  createdAt: true,
  profession: { select: { id: true, name: true } },
  _count: { select: { responses: true } },
} as const;

// Portfolio include for a single response (links + files + offers).
const RESPONSE_INCLUDE = {
  applicant: { select: { id: true, firstName: true, lastName: true, avatar: true } },
  portfolioFiles: { orderBy: { createdAt: 'asc' as const } },
  portfolioLinks: { orderBy: { createdAt: 'asc' as const } },
  offers: { orderBy: { createdAt: 'desc' as const } },
} as const;

// Resolve a user's display name for notifications.
async function userName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
}

// Resolve an artist's display name for notifications.
async function artistName(artistId: string): Promise<string> {
  const a = await prisma.artist.findUnique({ where: { id: artistId }, select: { name: true } });
  return a?.name ?? '';
}

/**
 * Текущие управляющие артиста: ACCEPTED-участники с isOwner || isAdmin
 * (lib/artistAccess — единственный источник прав на артиста). Доступ к
 * вакансиям/откликам и уведомления идут им, а НЕ Vacancy.authorId (после
 * передачи владения бывший владелец видел отклики с портфолио, а
 * совладелец/админ — вакансию «как чужой»). Artist.submittedById прав не даёт:
 * легаси-артистам без строки владельца его проставила миграция
 * 20261009030600_artist_owner_backfill.
 */
async function artistManagerIds(artistId: string): Promise<string[]> {
  if (!artistId) return [];
  return artistAdminIds(artistId);
}

// Gate create/edit/view-responses on artist management rights. Returns true when allowed.
async function assertArtistOwner(userId: string, artistId: string): Promise<boolean> {
  if (!userId || !artistId) return false;
  return isArtistAdmin(artistId, userId);
}

// Отклик «полный»: если вакансия требует портфолио — есть хотя бы файл или ссылка.
// Неполный отклик (файлы ещё не догрузились) управляющим не показывается.
function isResponseComplete(
  vacancy: { requirePortfolio: boolean },
  r: { portfolioFiles?: unknown[]; portfolioLinks?: unknown[]; _count?: { portfolioFiles: number; portfolioLinks: number } },
): boolean {
  if (!vacancy.requirePortfolio) return true;
  const files = r._count ? r._count.portfolioFiles : (r.portfolioFiles?.length ?? 0);
  const links = r._count ? r._count.portfolioLinks : (r.portfolioLinks?.length ?? 0);
  return files + links > 0;
}

// Детали ошибок — в лог, клиенту общий текст.
function serverError(res: any, where: string, e: any) {
  console.error(`[vacancies] ${where}`, e);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

// Build/refresh the post that mirrors a vacancy in the feed. The vacancy post
// carries BOTH artistId (so the feed shows the artist) AND authorId (the owning
// person, used for «Написать»/notify).
async function syncVacancyPost(
  vacancyId: string,
  artistId: string,
  authorId: string,
  title: string,
  description: string | null,
) {
  const existing = await prisma.post.findFirst({ where: { vacancyId, type: 'vacancy' } });
  if (existing) {
    await prisma.post.update({
      where: { id: existing.id },
      data: { title, content: description || '' },
    });
    return existing.id;
  }
  const post = await prisma.post.create({
    data: { type: 'vacancy', artistId, authorId, vacancyId, title, content: description || '' },
  });
  return post.id;
}

// ── POST /api/vacancies — create vacancy ───────────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const {
      artistId, professionId, title, workFormat, geography, employmentType,
      paymentType, compensation, description, customFilterValueIds,
      requireComment, requirePortfolio, status, referenceLinks,
    } = req.body;

    if (!artistId) return res.status(400).json({ error: 'artistId required' });
    if (!(await assertArtistOwner(meId, artistId))) return res.status(403).json({ error: 'Forbidden' });

    if (!professionId) return res.status(400).json({ error: 'professionId required' });

    const st = VALID_STATUS.has(status) ? status : 'draft';
    // Format-validate single-selects only when provided (reject garbage values).
    // A draft may be saved incomplete (ТЗ: тихое автосохранение незавершённой формы).
    if (workFormat && !VALID_WORK_FORMAT.has(workFormat)) return res.status(400).json({ error: 'Invalid workFormat' });
    if (geography && !VALID_GEOGRAPHY.has(geography)) return res.status(400).json({ error: 'Invalid geography' });
    if (employmentType && !VALID_EMPLOYMENT.has(employmentType)) return res.status(400).json({ error: 'Invalid employmentType' });
    if (paymentType && !VALID_PAYMENT.has(paymentType)) return res.status(400).json({ error: 'Invalid paymentType' });
    // Publishing requires every mandatory field.
    if (st === 'active' && (!title || !String(title).trim() || !description || !String(description).trim()
      || !VALID_WORK_FORMAT.has(workFormat) || !VALID_GEOGRAPHY.has(geography)
      || !VALID_EMPLOYMENT.has(employmentType) || !VALID_PAYMENT.has(paymentType))) {
      return res.status(400).json({ error: 'Заполните все обязательные поля для публикации' });
    }
    const cfvIds: string[] = Array.isArray(customFilterValueIds) ? customFilterValueIds : [];
    const links: Array<{ url: string; title?: string; source: string }> = Array.isArray(referenceLinks) ? referenceLinks : [];
    // Compensation is only meaningful for percent/rate; null otherwise.
    const comp = (paymentType === 'percent' || paymentType === 'rate')
      && compensation != null && compensation !== '' ? Number(compensation) : null;

    const vacancy = await prisma.vacancy.create({
      data: {
        artistId,
        authorId: meId,
        professionId,
        title: String(title || '').slice(0, 100),
        workFormat: workFormat || '',
        geography: geography || '',
        employmentType: employmentType || '',
        paymentType: paymentType || '',
        compensation: comp,
        description: description || null,
        requireComment: !!requireComment,
        requirePortfolio: !!requirePortfolio,
        status: st,
        selectedCustomFilterValues: { connect: cfvIds.map((id) => ({ id })) },
        referenceLinks: {
          create: links
            .filter((l) => l && l.url && matchesLinkSource(l.source, l.url))
            .map((l) => ({ url: l.url, title: l.title || '', source: l.source })),
        },
      },
    });

    if (st === 'active') {
      await syncVacancyPost(vacancy.id, vacancy.artistId, vacancy.authorId, vacancy.title, vacancy.description);
    }

    const full = await prisma.vacancy.findUnique({ where: { id: vacancy.id }, include: VACANCY_INCLUDE });
    res.status(201).json(full);
  } catch (e: any) {
    return serverError(res, 'POST /', e);
  }
});

// ── PATCH /api/vacancies/:id — partial update (any status, no guard) ───────────
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });
    if (!(await assertArtistOwner(meId, vacancy.artistId))) return res.status(403).json({ error: 'Forbidden' });

    const {
      professionId, title, workFormat, geography, employmentType,
      paymentType, compensation, description, customFilterValueIds,
      requireComment, requirePortfolio, status, referenceLinks,
    } = req.body;

    const data: any = {};
    if (title !== undefined) data.title = String(title).slice(0, 100);
    if (professionId !== undefined) data.professionId = professionId;
    // Single-selects: validate format only when a non-empty value is provided
    // (drafts may be saved incomplete); store '' to clear.
    if (workFormat !== undefined) {
      if (workFormat && !VALID_WORK_FORMAT.has(workFormat)) return res.status(400).json({ error: 'Invalid workFormat' });
      data.workFormat = workFormat || '';
    }
    if (geography !== undefined) {
      if (geography && !VALID_GEOGRAPHY.has(geography)) return res.status(400).json({ error: 'Invalid geography' });
      data.geography = geography || '';
    }
    if (employmentType !== undefined) {
      if (employmentType && !VALID_EMPLOYMENT.has(employmentType)) return res.status(400).json({ error: 'Invalid employmentType' });
      data.employmentType = employmentType || '';
    }
    if (paymentType !== undefined) {
      if (paymentType && !VALID_PAYMENT.has(paymentType)) return res.status(400).json({ error: 'Invalid paymentType' });
      data.paymentType = paymentType || '';
    }
    if (description !== undefined) data.description = description || null;
    if (requireComment !== undefined) data.requireComment = !!requireComment;
    if (requirePortfolio !== undefined) data.requirePortfolio = !!requirePortfolio;
    if (status !== undefined && VALID_STATUS.has(status)) data.status = status;

    // Compensation is gated on the effective payment type (incoming or stored).
    const effPayment = paymentType !== undefined ? paymentType : vacancy.paymentType;
    if (compensation !== undefined || paymentType !== undefined) {
      data.compensation = (effPayment === 'percent' || effPayment === 'rate')
        && compensation != null && compensation !== '' ? Number(compensation) : null;
    }

    if (Array.isArray(customFilterValueIds)) {
      data.selectedCustomFilterValues = { set: [], connect: customFilterValueIds.map((id: string) => ({ id })) };
    }
    if (Array.isArray(referenceLinks)) {
      // Replace the link set wholesale (files are managed via dedicated endpoints).
      data.referenceLinks = {
        deleteMany: {},
        create: referenceLinks
          .filter((l: any) => l && l.url && matchesLinkSource(l.source, l.url))
          .map((l: any) => ({ url: l.url, title: l.title || '', source: l.source })),
      };
    }

    const updated = await prisma.vacancy.update({ where: { id: vacancy.id }, data, include: VACANCY_INCLUDE });

    // Editing an active vacancy keeps its feed post title/description in sync.
    if (updated.status === 'active') {
      await syncVacancyPost(updated.id, updated.artistId, updated.authorId, updated.title, updated.description);
    }

    res.json(updated);
  } catch (e: any) {
    return serverError(res, 'PATCH /:id', e);
  }
});

// ── PATCH /api/vacancies/:id/status — manual status change ─────────────────────
router.patch('/:id/status', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { status } = req.body;
    if (!VALID_STATUS.has(status)) return res.status(400).json({ error: 'Invalid status' });
    const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });
    if (!(await assertArtistOwner(meId, vacancy.artistId))) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.vacancy.update({
      where: { id: vacancy.id },
      data: { status },
      include: VACANCY_INCLUDE,
    });

    if (status === 'active') {
      await syncVacancyPost(updated.id, updated.artistId, updated.authorId, updated.title, updated.description);
    } else if (status === 'draft') {
      // Back to draft = снятие с публикации: remove the feed post.
      // Archived vacancies KEEP their feed post (visible with an «В архиве» badge).
      await prisma.post.deleteMany({ where: { vacancyId: updated.id, type: 'vacancy' } });
    }

    res.json(updated);
  } catch (e: any) {
    return serverError(res, 'PATCH /:id/status', e);
  }
});

// ── DELETE /api/vacancies/:id ──────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: req.params.id },
      include: {
        referenceFiles: { select: { url: true } },
        responses: { select: { portfolioFiles: { select: { url: true } } } },
      },
    });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });
    if (!(await assertArtistOwner(meId, vacancy.artistId))) return res.status(403).json({ error: 'Forbidden' });

    // Best-effort: remove reference + portfolio files from disk before cascading.
    const urls = [
      ...vacancy.referenceFiles.map((f) => f.url),
      ...vacancy.responses.flatMap((r) => r.portfolioFiles.map((f) => f.url)),
    ];
    for (const url of urls) {
      try {
        const abs = path.join(process.cwd(), url.replace(/^\//, ''));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch {}
    }

    await prisma.vacancy.delete({ where: { id: vacancy.id } });
    res.json({ ok: true });
  } catch (e: any) {
    return serverError(res, 'DELETE /:id', e);
  }
});

// ── GET /api/vacancies/mine?artistId=&status= — artist-scoped list ─────────────
router.get('/mine', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { artistId, status } = req.query as { artistId?: string; status?: string };
    if (!artistId) return res.status(400).json({ error: 'artistId required' });
    if (!(await assertArtistOwner(meId, artistId))) return res.status(403).json({ error: 'Forbidden' });

    const where: any = { artistId };
    if (status && VALID_STATUS.has(status)) where.status = status;
    const vacancies = await prisma.vacancy.findMany({
      where,
      select: VACANCY_MINE_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(vacancies);
  } catch (e: any) {
    return serverError(res, 'GET /mine', e);
  }
});

// ── GET /api/vacancies/my-offers — cooperation offers sent TO me ──────────────
router.get('/my-offers', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const offers = await prisma.vacancyOffer.findMany({
      where: { applicantId: meId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: {
        vacancy: { select: { id: true, title: true, artist: { select: { id: true, name: true, avatar: true } } } },
      },
    });
    res.json(offers.map((o) => ({
      id: o.id,
      vacancy: {
        id: o.vacancy.id,
        title: o.vacancy.title,
        artist: {
          id: o.vacancy.artist.id,
          name: o.vacancy.artist.name,
          avatar: o.vacancy.artist.avatar,
        },
      },
      startDate: o.startDate,
      conditions: o.conditions,
      compensation: o.compensation,
      extraDetails: o.extraDetails,
      createdAt: o.createdAt,
    })));
  } catch (e: any) {
    return serverError(res, 'GET /my-offers', e);
  }
});

// ── GET /api/vacancies/responses/incoming — responses to vacancies I OWN ───────
router.get('/responses/incoming', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    // Vacancies I manage = artist has me as an ACCEPTED owner/admin (pending/
    // declined invites don't count). Artist.submittedById gives no rights.
    const owned = await prisma.vacancy.findMany({
      where: {
        artist: { userArtists: { some: { userId: meId, inviteStatus: 'ACCEPTED', OR: [{ isOwner: true }, { isAdmin: true }] } } },
      },
      select: { id: true },
    });
    const vacancyIds = owned.map((v) => v.id);
    const all = await prisma.vacancyResponse.findMany({
      where: { vacancyId: { in: vacancyIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        vacancy: { select: { id: true, title: true, requirePortfolio: true } },
        applicant: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        _count: { select: { portfolioFiles: true, portfolioLinks: true } },
      },
    });
    const responses = all.filter((r) => r.applicantId !== meId && isResponseComplete(r.vacancy, r));
    res.json(responses.map((r) => ({
      id: r.id,
      vacancy: { id: r.vacancy.id, title: r.vacancy.title },
      applicant: {
        id: r.applicant.id,
        firstName: r.applicant.firstName,
        lastName: r.applicant.lastName,
        avatar: r.applicant.avatar,
      },
      comment: r.comment,
      createdAt: r.createdAt,
    })));
  } catch (e: any) {
    return serverError(res, 'GET /responses/incoming', e);
  }
});

// ── GET /api/vacancies/:id — full vacancy ──────────────────────────────────────
router.get('/:id', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId ?? null;
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: req.params.id },
      include: {
        ...VACANCY_INCLUDE,
        responses: {
          orderBy: { createdAt: 'desc' as const },
          include: RESPONSE_INCLUDE,
        },
      },
    });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });

    // «Владелец» = текущий owner/admin артиста (не автор вакансии): после
    // передачи владения бывший владелец больше не видит отклики с портфолио.
    const isOwner = !!meId && (await assertArtistOwner(meId, vacancy.artistId));
    if (!isOwner) {
      // Non-owners may only view a vacancy that has a published feed post.
      const post = await prisma.post.findFirst({ where: { vacancyId: vacancy.id, type: 'vacancy' }, select: { id: true } });
      if (!post) return res.status(404).json({ error: 'Not found' });
    }

    const { responses, ...rest } = vacancy;
    // The current viewer's own response (with offers) — for the applicant view.
    const myResponse = !isOwner && meId
      ? (responses.find((r) => r.applicantId === meId) ?? null)
      : undefined;
    // Candidates the owner already nudged via «Предложить вакансию» (persisted).
    const offeredCandidateIds = isOwner
      ? (await prisma.vacancyCandidateOffer.findMany({ where: { vacancyId: vacancy.id }, select: { candidateId: true } })).map((o) => o.candidateId)
      : undefined;

    res.json({
      ...rest,
      isOwner,
      responses: isOwner ? responses.filter((r) => isResponseComplete(vacancy, r)) : undefined,
      myResponse,
      // Отклик создан, но обязательное портфолио не догрузилось — управляющие его
      // не видят; клиент предлагает прикрепить портфолио и отправить снова.
      myResponseIncomplete: myResponse ? !isResponseComplete(vacancy, myResponse) : undefined,
      offeredCandidateIds,
      // Кому писать по вакансии: текущий владелец артиста (а не автор вакансии,
      // который после передачи владения мог уйти из артиста).
      contactUserId: isOwner ? undefined : await (async () => {
        const owner = await prisma.userArtist.findFirst({
          where: { artistId: vacancy.artistId, isOwner: true, inviteStatus: 'ACCEPTED' },
          select: { userId: true },
        });
        return owner?.userId ?? (await artistManagerIds(vacancy.artistId))[0] ?? vacancy.authorId;
      })(),
    });
  } catch (e: any) {
    return serverError(res, 'GET /:id', e);
  }
});

// ── GET /api/vacancies/:id/matches — matching candidates (residents) ──────────
router.get('/:id/matches', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: req.params.id },
      include: { selectedCustomFilterValues: { select: { id: true, filterId: true } } },
    });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });

    const pageNum = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limitNum = parseInt(String(req.query.limit ?? '5'), 10) || 5;
    const skip = (pageNum - 1) * limitNum;

    // Group the vacancy's selected filter values by their parent filter so we match
    // AND-between-filters / OR-within-a-filter against the candidate's profession.
    const groupsMap = new Map<string, { ids: string[] }>();
    for (const v of vacancy.selectedCustomFilterValues as any[]) {
      const g = groupsMap.get(v.filterId) ?? { ids: [] };
      g.ids.push(v.id);
      groupsMap.set(v.filterId, g);
    }
    const allGroups = [...groupsMap.values()];
    const professionId = vacancy.professionId;

    // One `some` clause per filter group → AND between filters, OR within a filter.
    const groupClauses = (gs: { ids: string[] }[]) =>
      gs.map((g) => ({ selectedCustomFilterValues: { some: { id: { in: g.ids } } } }));

    // A user matches if they have the required profession satisfying `extra` filters.
    // Сами управляющие артиста кандидатами не предлагаются.
    const excludeIds = [...new Set([vacancy.authorId, ...(await artistManagerIds(vacancy.artistId))])];
    const userWhere = (groups: { ids: string[] }[]) => ({
      id: { notIn: excludeIds },
      userProfessions: { some: { professionId, ...(groups.length ? { AND: groupClauses(groups) } : {}) } },
    });

    const userSelect = {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      avatar: true,
      city: true,
      occupancyStatus: true,
      userProfessions: { select: { profession: { select: { name: true } } } },
    } as const;

    // occupancyStatus rank (ТЗ 3.4): open/considering first, unset middle, closed last.
    const rank = (s: string | null | undefined): number => {
      const v = (s ?? '').trim().toLowerCase();
      if (v === 'open' || v === 'considering') return 0;
      if (v === 'closed') return 2;
      return 1; // '' / null / anything else
    };

    const shape = (users: any[]) =>
      users.map((u) => {
        const { userProfessions, occupancyStatus, ...userData } = u;
        return {
          id: u.id,
          user: { ...userData, occupancyStatus },
          occupancyStatus: occupancyStatus ?? null,
          professions: [...new Set((userProfessions as any[]).map((up) => up.profession?.name).filter(Boolean))],
        };
      });

    // Fallback cascade by profession (profession is REQUIRED — without it no match):
    //   full       → profession + all filter groups
    //   no_filters → profession only
    const levels: Array<{ level: string; where: any }> = [];
    if (allGroups.length > 0) {
      levels.push({ level: 'full', where: userWhere(allGroups) });
      levels.push({ level: 'no_filters', where: userWhere([]) });
    } else {
      levels.push({ level: 'full', where: userWhere([]) });
    }

    for (const { level, where } of levels) {
      const totalCount = await prisma.user.count({ where });
      if (totalCount === 0) continue;
      // Load a generous slice, sort by occupancy rank in JS, then paginate.
      const pool = await prisma.user.findMany({
        where, select: userSelect, take: 200, orderBy: { createdAt: 'desc' },
      });
      const sorted = pool.sort((a, b) => {
        const ra = rank(a.occupancyStatus);
        const rb = rank(b.occupancyStatus);
        if (ra !== rb) return ra - rb;
        return 0; // pool already createdAt desc within a rank
      });
      const pageSlice = sorted.slice(skip, skip + limitNum);
      return res.json({
        results: shape(pageSlice),
        fallbackLevel: level,
        pagination: { page: pageNum, limit: limitNum, totalCount, totalPages: Math.ceil(totalCount / limitNum) },
      });
    }

    res.json({
      results: [],
      fallbackLevel: 'empty',
      pagination: { page: pageNum, limit: limitNum, totalCount: 0, totalPages: 0 },
    });
  } catch (e: any) {
    return serverError(res, 'GET /:id/matches', e);
  }
});

// ── POST /api/vacancies/:id/responses — applicant responds (upsert) ───────────
router.post('/:id/responses', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { comment, portfolioLinks } = req.body;
    const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });
    const managerIds = await artistManagerIds(vacancy.artistId);
    if (vacancy.authorId === meId || managerIds.includes(meId)) {
      return res.status(400).json({ error: 'Cannot respond to your own vacancy' });
    }
    // Отклики принимаются только на активную вакансию: архивная остаётся
    // видимой (пост в ленте сохраняется), но отклики закрыты.
    if (vacancy.status !== 'active') {
      const label = vacancy.status === 'archived' ? 'Вакансия в архиве' : 'Вакансия не опубликована';
      return res.status(409).json({ error: `${label} — отклики закрыты` });
    }
    // Non-owners may respond only to a published vacancy.
    const post = await prisma.post.findFirst({ where: { vacancyId: vacancy.id, type: 'vacancy' }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Not found' });

    const links: Array<{ url: string; title?: string; source: string }> = Array.isArray(portfolioLinks) ? portfolioLinks : [];

    // Validate requirements. Comment is strict; portfolio is soft — files may be
    // uploaded by a separate request, so we only block when there are neither
    // incoming links nor previously uploaded files.
    if (vacancy.requireComment && (!comment || !String(comment).trim())) {
      return res.status(400).json({ error: 'Комментарий обязателен' });
    }
    // Портфолио проверяется по данным сервера, клиентскому флагу не доверяем.
    // Файлы догружаются отдельным запросом (нужен id отклика), поэтому при
    // hasPortfolioFiles отклик создаётся «неполным»: управляющие его не видят и
    // уведомление уходит только когда файлы реально загрузятся (POST …/portfolio).
    let portfolioPending = false;
    if (vacancy.requirePortfolio) {
      const existing = await prisma.vacancyResponse.findUnique({
        where: { vacancyId_applicantId: { vacancyId: vacancy.id, applicantId: meId } },
        select: { _count: { select: { portfolioFiles: true } } },
      });
      const hasStoredFiles = (existing?._count.portfolioFiles ?? 0) > 0;
      const hasLinks = links.filter((l) => l && l.url && isAllowedLinkUrl(l.url)).length > 0;
      if (!hasStoredFiles && !hasLinks) {
        if (req.body.hasPortfolioFiles !== true) {
          return res.status(400).json({ error: 'Портфолио обязательно' });
        }
        portfolioPending = true;
      }
    }

    const response = await prisma.vacancyResponse.upsert({
      where: { vacancyId_applicantId: { vacancyId: vacancy.id, applicantId: meId } },
      create: {
        vacancyId: vacancy.id,
        applicantId: meId,
        comment: comment || null,
        portfolioLinks: {
          create: links
            .filter((l) => l && l.url && isAllowedLinkUrl(l.url))
            .map((l) => ({ url: l.url, title: l.title || '', source: detectLinkSource(l.url) || l.source })),
        },
      },
      update: {
        comment: comment || null,
        portfolioLinks: {
          deleteMany: {},
          create: links
            .filter((l) => l && l.url && isAllowedLinkUrl(l.url))
            .map((l) => ({ url: l.url, title: l.title || '', source: detectLinkSource(l.url) || l.source })),
        },
      },
      include: RESPONSE_INCLUDE,
    });

    if (!portfolioPending) {
      const name = await userName(meId);
      await notifyMany(managerIds, {
        actorId: meId,
        type: 'vacancy_response',
        title: 'Отклик на вакансию',
        body: `${name} откликнулся на вакансию «${vacancy.title}»`,
        link: `/vacancies/${vacancy.id}`,
      });
    }

    res.status(201).json({ ...response, portfolioPending });
  } catch (e: any) {
    return serverError(res, 'POST /:id/responses', e);
  }
});

// ── POST /api/vacancies/:id/responses/:responseId/portfolio — upload files ────
router.post('/:id/responses/:responseId/portfolio', authenticate, uploadVacancyMedia.array('files'), async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const response = await prisma.vacancyResponse.findUnique({ where: { id: req.params.responseId } });
    if (!response || response.vacancyId !== req.params.id || response.applicantId !== meId) {
      for (const f of (req.files as Express.Multer.File[] | undefined) ?? []) {
        try { fs.unlinkSync(f.path); } catch {}
      }
      return res.status(404).json({ error: 'Not found' });
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ error: 'No files' });

    const agg = await prisma.vacancyResponseFile.aggregate({
      where: { responseId: response.id },
      _sum: { size: true },
    });
    const existingBytes = agg._sum.size ?? 0;
    const incomingBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (existingBytes + incomingBytes > MAX_REFERENCES_BYTES) {
      for (const f of files) { try { fs.unlinkSync(f.path); } catch {} }
      return res.status(400).json({ error: 'Суммарный размер портфолио превышает 20 МБ' });
    }

    // Был ли отклик «неполным» (обязательное портфолио ещё не приложено)?
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: response.vacancyId },
      select: { id: true, title: true, artistId: true, requirePortfolio: true },
    });
    const [linksBefore, filesBefore] = await Promise.all([
      prisma.vacancyResponseLink.count({ where: { responseId: response.id } }),
      prisma.vacancyResponseFile.count({ where: { responseId: response.id } }),
    ]);
    const wasIncomplete = !!vacancy?.requirePortfolio && linksBefore === 0 && filesBefore === 0;

    const created = await prisma.$transaction(
      files.map((f) =>
        prisma.vacancyResponseFile.create({
          data: {
            responseId: response.id,
            url: `/uploads/vacancies/${f.filename}`,
            originalName: f.originalname,
            size: f.size,
            mimeType: f.mimetype,
          },
        }),
      ),
    );

    // Портфолио догрузилось — теперь отклик полный: уведомляем управляющих.
    if (wasIncomplete && vacancy) {
      const name = await userName(meId);
      await notifyMany(await artistManagerIds(vacancy.artistId), {
        actorId: meId,
        type: 'vacancy_response',
        title: 'Отклик на вакансию',
        body: `${name} откликнулся на вакансию «${vacancy.title}»`,
        link: `/vacancies/${vacancy.id}`,
      });
    }

    res.status(201).json(created);
  } catch (e: any) {
    return serverError(res, 'POST /:id/responses/:responseId/portfolio', e);
  }
});

// ── DELETE /api/vacancies/:id/responses/:responseId/portfolio/:fileId ─────────
router.delete('/:id/responses/:responseId/portfolio/:fileId', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const response = await prisma.vacancyResponse.findUnique({ where: { id: req.params.responseId } });
    if (!response || response.vacancyId !== req.params.id || response.applicantId !== meId) {
      return res.status(404).json({ error: 'Not found' });
    }
    const file = await prisma.vacancyResponseFile.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.responseId !== response.id) return res.status(404).json({ error: 'File not found' });

    try {
      const abs = path.join(process.cwd(), file.url.replace(/^\//, ''));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {}

    await prisma.vacancyResponseFile.delete({ where: { id: file.id } });
    res.json({ ok: true });
  } catch (e: any) {
    return serverError(res, 'DELETE /:id/responses/:responseId/portfolio/:fileId', e);
  }
});

// ── GET /api/vacancies/:id/responses — responses list (owner only) ────────────
router.get('/:id/responses', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });
    // Только текущие owner/admin артиста (бывший автор после передачи — нет).
    if (!(await assertArtistOwner(meId, vacancy.artistId))) {
      return res.status(404).json({ error: 'Not found' });
    }
    const responses = await prisma.vacancyResponse.findMany({
      where: { vacancyId: vacancy.id },
      orderBy: { createdAt: 'desc' },
      include: RESPONSE_INCLUDE,
    });
    res.json(responses.filter((r) => isResponseComplete(vacancy, r)));
  } catch (e: any) {
    return serverError(res, 'GET /:id/responses', e);
  }
});

// ── POST /api/vacancies/:id/offer — propose the vacancy to a candidate ────────
router.post('/:id/offer', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { candidateId } = req.body;
    if (!candidateId) return res.status(400).json({ error: 'candidateId required' });
    const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });
    if (!(await assertArtistOwner(meId, vacancy.artistId))) return res.status(403).json({ error: 'Forbidden' });
    if (candidateId === meId) return res.status(400).json({ error: 'Cannot offer to yourself' });
    // Предлагать можно только опубликованную активную вакансию (иначе кандидат
    // получит уведомление, а откликнуться не сможет).
    if (vacancy.status !== 'active') return res.status(409).json({ error: 'Вакансия не активна — предложить её нельзя' });
    const candidate = await prisma.user.findUnique({ where: { id: String(candidateId) }, select: { id: true } });
    if (!candidate) return res.status(404).json({ error: 'Пользователь не найден' });

    // Persist the nudge (idempotent) so «Предложено» survives reloads; notify the
    // candidate only the first time they are offered this vacancy.
    const existing = await prisma.vacancyCandidateOffer.findUnique({
      where: { vacancyId_candidateId: { vacancyId: vacancy.id, candidateId } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.vacancyCandidateOffer.create({ data: { vacancyId: vacancy.id, candidateId } });
      const aName = await artistName(vacancy.artistId);
      await notify({
        userId: candidateId,
        actorId: meId,
        type: 'vacancy_offered',
        title: 'Вам предложили вакансию',
        body: `${aName} предлагает вакансию «${vacancy.title}»`,
        link: `/vacancies/${vacancy.id}`,
      });
    }

    res.json({ ok: true });
  } catch (e: any) {
    return serverError(res, 'POST /:id/offer', e);
  }
});

// ── POST /api/vacancies/:id/responses/:responseId/cooperation — make offer ────
router.post('/:id/responses/:responseId/cooperation', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { startDate, conditions, compensation, extraDetails } = req.body;
    const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });
    if (!(await assertArtistOwner(meId, vacancy.artistId))) return res.status(403).json({ error: 'Forbidden' });
    const response = await prisma.vacancyResponse.findUnique({ where: { id: req.params.responseId } });
    if (!response || response.vacancyId !== vacancy.id) return res.status(404).json({ error: 'Response not found' });
    // Предложение — только по активной вакансии (архив = набор закрыт).
    if (vacancy.status !== 'active') {
      return res.status(409).json({ error: vacancy.status === 'archived' ? 'Вакансия в архиве — предложение отправить нельзя' : 'Вакансия не опубликована' });
    }

    if (!startDate) return res.status(400).json({ error: 'startDate required' });
    // Строгий разбор: «31.02» → ошибка (а не 3 марта), «13-й месяц» → 400 (а не 500).
    const startDay = parseCalendarDay(startDate);
    if (!startDay) return res.status(400).json({ error: 'Некорректная дата начала' });
    if (endOfDayMsk(startDay).getTime() < Date.now()) return res.status(400).json({ error: 'Дата начала не может быть в прошлом' });
    const conditionsText = typeof conditions === 'string' ? conditions.trim() : '';
    const compensationText = typeof compensation === 'string' ? compensation.trim() : '';
    if (!conditionsText) return res.status(400).json({ error: 'conditions required' });
    if (!compensationText) return res.status(400).json({ error: 'compensation required' });
    if (conditionsText.length > 2000 || compensationText.length > 500
      || (typeof extraDetails === 'string' && extraDetails.length > 2000)) {
      return res.status(400).json({ error: 'Слишком длинный текст предложения' });
    }

    // Не плодим офферы на каждый сабмит: пока есть ожидающий ответа или уже
    // принятый оффер этому кандидату — новый не создаём (под advisory-блокировкой).
    const offer = await withAdvisoryLock(`vacancy-offer:${response.id}`, async (tx) => {
      const open = await tx.vacancyOffer.findFirst({
        where: { responseId: response.id, status: { in: ['pending', 'accepted'] } },
        select: { id: true },
      });
      if (open) return null;
      return tx.vacancyOffer.create({
        data: {
          vacancyId: vacancy.id,
          responseId: response.id,
          applicantId: response.applicantId,
          // Календарный день храним полуночью UTC этого дня (отображается одинаково
          // во всех часовых поясах РФ).
          startDate: new Date(Date.UTC(startDay.y, startDay.m - 1, startDay.d)),
          conditions: conditionsText,
          compensation: compensationText,
          extraDetails: typeof extraDetails === 'string' && extraDetails.trim() ? extraDetails.trim() : null,
          status: 'pending',
        },
      });
    });
    if (!offer) return res.status(409).json({ error: 'Кандидату уже отправлено предложение' });

    await notify({
      userId: response.applicantId,
      actorId: meId,
      type: 'vacancy_cooperation_offer',
      title: 'Предложение о сотрудничестве',
      body: `По вакансии «${vacancy.title}» вам предложили сотрудничество`,
      link: `/vacancies/${vacancy.id}`,
    });

    res.status(201).json({ offer });
  } catch (e: any) {
    return serverError(res, 'POST /:id/responses/:responseId/cooperation', e);
  }
});

// ── POST /api/vacancies/offers/:offerId/accept — applicant accepts ────────────
router.post('/offers/:offerId/accept', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const offer = await prisma.vacancyOffer.findUnique({
      where: { id: req.params.offerId },
      include: { vacancy: { select: { id: true, title: true, authorId: true, artistId: true } } },
    });
    if (!offer || offer.applicantId !== meId) return res.status(404).json({ error: 'Not found' });

    // Атомарно и только из pending: принятый нельзя «переотклонить» и наоборот,
    // повторный клик не шлёт повторных уведомлений.
    const tr = await prisma.vacancyOffer.updateMany({
      where: { id: offer.id, status: 'pending' },
      data: { status: 'accepted' },
    });
    if (tr.count === 0) return res.status(409).json({ error: 'Предложение уже обработано' });
    const updated = await prisma.vacancyOffer.findUnique({ where: { id: offer.id } });

    const name = await userName(meId);
    await notifyMany(await artistManagerIds(offer.vacancy.artistId), {
      actorId: meId,
      type: 'vacancy_offer_accepted',
      title: 'Предложение принято',
      body: `${name} принял предложение по вакансии «${offer.vacancy.title}»`,
      link: `/vacancies/${offer.vacancy.id}`,
    });

    res.json({ offer: updated, vacancyId: offer.vacancy.id });
  } catch (e: any) {
    return serverError(res, 'POST /offers/:offerId/accept', e);
  }
});

// ── POST /api/vacancies/offers/:offerId/reject — applicant rejects ────────────
router.post('/offers/:offerId/reject', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const offer = await prisma.vacancyOffer.findUnique({
      where: { id: req.params.offerId },
      include: { vacancy: { select: { id: true, title: true, authorId: true, artistId: true } } },
    });
    if (!offer || offer.applicantId !== meId) return res.status(404).json({ error: 'Not found' });

    const tr = await prisma.vacancyOffer.updateMany({
      where: { id: offer.id, status: 'pending' },
      data: { status: 'rejected' },
    });
    if (tr.count === 0) return res.status(409).json({ error: 'Предложение уже обработано' });
    const updated = await prisma.vacancyOffer.findUnique({ where: { id: offer.id } });

    const name = await userName(meId);
    await notifyMany(await artistManagerIds(offer.vacancy.artistId), {
      actorId: meId,
      type: 'vacancy_offer_rejected',
      title: 'Предложение отклонено',
      body: `${name} отклонил предложение по вакансии «${offer.vacancy.title}»`,
      link: `/vacancies/${offer.vacancy.id}`,
    });

    res.json({ offer: updated, vacancyId: offer.vacancy.id });
  } catch (e: any) {
    return serverError(res, 'POST /offers/:offerId/reject', e);
  }
});

// ── POST /api/vacancies/:id/references — upload reference files (≤20MB total) ──
router.post('/:id/references', authenticate, uploadVacancyMedia.array('files'), async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
    if (!vacancy || !(await assertArtistOwner(meId, vacancy.artistId))) {
      for (const f of (req.files as Express.Multer.File[] | undefined) ?? []) {
        try { fs.unlinkSync(f.path); } catch {}
      }
      return res.status(404).json({ error: 'Not found' });
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ error: 'No files' });

    const agg = await prisma.vacancyReferenceFile.aggregate({
      where: { vacancyId: vacancy.id },
      _sum: { size: true },
    });
    const existingBytes = agg._sum.size ?? 0;
    const incomingBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (existingBytes + incomingBytes > MAX_REFERENCES_BYTES) {
      for (const f of files) { try { fs.unlinkSync(f.path); } catch {} }
      return res.status(400).json({ error: 'Суммарный размер референсов превышает 20 МБ' });
    }

    const created = await prisma.$transaction(
      files.map((f) =>
        prisma.vacancyReferenceFile.create({
          data: {
            vacancyId: vacancy.id,
            url: `/uploads/vacancies/${f.filename}`,
            originalName: f.originalname,
            size: f.size,
            mimeType: f.mimetype,
          },
        }),
      ),
    );

    res.status(201).json(created);
  } catch (e: any) {
    return serverError(res, 'POST /:id/references', e);
  }
});

// ── DELETE /api/vacancies/:id/references/:fileId — remove a reference file ─────
router.delete('/:id/references/:fileId', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
    if (!vacancy || !(await assertArtistOwner(meId, vacancy.artistId))) return res.status(404).json({ error: 'Not found' });
    const file = await prisma.vacancyReferenceFile.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.vacancyId !== vacancy.id) return res.status(404).json({ error: 'File not found' });

    try {
      const abs = path.join(process.cwd(), file.url.replace(/^\//, ''));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {}

    await prisma.vacancyReferenceFile.delete({ where: { id: file.id } });
    res.json({ ok: true });
  } catch (e: any) {
    return serverError(res, 'DELETE /:id/references/:fileId', e);
  }
});

export default router;
