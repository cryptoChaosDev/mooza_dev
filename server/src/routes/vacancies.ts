import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { notify } from '../utils/notify';
import { uploadVacancyMedia } from '../middleware/upload';

const router = Router();

const MAX_REFERENCES_BYTES = 20 * 1024 * 1024; // 20MB total per vacancy / per response portfolio
const VALID_STATUS = new Set(['active', 'draft', 'archived']);
const VALID_WORK_FORMAT = new Set(['online', 'offline', 'hybrid']);
const VALID_GEOGRAPHY = new Set(['city', 'region', 'country', 'international']);
const VALID_EMPLOYMENT = new Set(['permanent', 'partial', 'project', 'intern', 'volunteer']);
const VALID_PAYMENT = new Set(['free', 'respect', 'barter', 'percent', 'rate']);

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

// Gate create/edit on artist ownership: only an ACCEPTED owner of the artist may
// manage its vacancies. Returns true when allowed.
async function assertArtistOwner(userId: string, artistId: string): Promise<boolean> {
  if (!artistId) return false;
  // The creator (Artist.submittedById) is always an owner, even without a
  // UserArtist owner row (matches the artist page's ownership semantics).
  const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { submittedById: true } });
  if (artist?.submittedById === userId) return true;
  const link = await prisma.userArtist.findFirst({
    where: { userId, artistId, isOwner: true, inviteStatus: 'ACCEPTED' },
    select: { id: true },
  });
  return !!link;
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

    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    if (!professionId) return res.status(400).json({ error: 'professionId required' });
    if (!VALID_WORK_FORMAT.has(workFormat)) return res.status(400).json({ error: 'Invalid workFormat' });
    if (!VALID_GEOGRAPHY.has(geography)) return res.status(400).json({ error: 'Invalid geography' });
    if (!VALID_EMPLOYMENT.has(employmentType)) return res.status(400).json({ error: 'Invalid employmentType' });
    if (!VALID_PAYMENT.has(paymentType)) return res.status(400).json({ error: 'Invalid paymentType' });

    const st = VALID_STATUS.has(status) ? status : 'draft';
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
        title: String(title).slice(0, 100),
        workFormat,
        geography,
        employmentType,
        paymentType,
        compensation: comp,
        description: description || null,
        requireComment: !!requireComment,
        requirePortfolio: !!requirePortfolio,
        status: st,
        selectedCustomFilterValues: { connect: cfvIds.map((id) => ({ id })) },
        referenceLinks: {
          create: links
            .filter((l) => l && l.url)
            .map((l) => ({ url: l.url, title: l.title || '', source: l.source || 'youtube' })),
        },
      },
    });

    if (st === 'active') {
      await syncVacancyPost(vacancy.id, vacancy.artistId, vacancy.authorId, vacancy.title, vacancy.description);
    }

    const full = await prisma.vacancy.findUnique({ where: { id: vacancy.id }, include: VACANCY_INCLUDE });
    res.status(201).json(full);
  } catch (e: any) {
    console.error('[vacancies] POST /', e);
    res.status(500).json({ error: e.message });
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
    if (workFormat !== undefined) {
      if (!VALID_WORK_FORMAT.has(workFormat)) return res.status(400).json({ error: 'Invalid workFormat' });
      data.workFormat = workFormat;
    }
    if (geography !== undefined) {
      if (!VALID_GEOGRAPHY.has(geography)) return res.status(400).json({ error: 'Invalid geography' });
      data.geography = geography;
    }
    if (employmentType !== undefined) {
      if (!VALID_EMPLOYMENT.has(employmentType)) return res.status(400).json({ error: 'Invalid employmentType' });
      data.employmentType = employmentType;
    }
    if (paymentType !== undefined) {
      if (!VALID_PAYMENT.has(paymentType)) return res.status(400).json({ error: 'Invalid paymentType' });
      data.paymentType = paymentType;
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
          .filter((l: any) => l && l.url)
          .map((l: any) => ({ url: l.url, title: l.title || '', source: l.source || 'youtube' })),
      };
    }

    const updated = await prisma.vacancy.update({ where: { id: vacancy.id }, data, include: VACANCY_INCLUDE });

    // Editing an active vacancy keeps its feed post title/description in sync.
    if (updated.status === 'active') {
      await syncVacancyPost(updated.id, updated.artistId, updated.authorId, updated.title, updated.description);
    }

    res.json(updated);
  } catch (e: any) {
    console.error('[vacancies] PATCH /:id', e);
    res.status(500).json({ error: e.message });
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
    console.error('[vacancies] PATCH /:id/status', e);
    res.status(500).json({ error: e.message });
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
    console.error('[vacancies] DELETE /:id', e);
    res.status(500).json({ error: e.message });
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
    console.error('[vacancies] GET /mine', e);
    res.status(500).json({ error: e.message });
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

    const isOwner = !!meId && vacancy.authorId === meId;
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

    res.json({
      ...rest,
      isOwner,
      responses: isOwner ? responses : undefined,
      myResponse,
    });
  } catch (e: any) {
    console.error('[vacancies] GET /:id', e);
    res.status(500).json({ error: e.message });
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
    const userWhere = (groups: { ids: string[] }[]) => ({
      id: { not: vacancy.authorId },
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
    console.error('[vacancies] GET /:id/matches', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/vacancies/:id/responses — applicant responds (upsert) ───────────
router.post('/:id/responses', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { comment, portfolioLinks } = req.body;
    const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });
    if (vacancy.authorId === meId) return res.status(400).json({ error: 'Cannot respond to your own vacancy' });
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
    if (vacancy.requirePortfolio) {
      const existing = await prisma.vacancyResponse.findUnique({
        where: { vacancyId_applicantId: { vacancyId: vacancy.id, applicantId: meId } },
        select: { _count: { select: { portfolioFiles: true } } },
      });
      const hasFiles = (existing?._count.portfolioFiles ?? 0) > 0;
      const hasLinks = links.filter((l) => l && l.url).length > 0;
      if (!hasFiles && !hasLinks) {
        return res.status(400).json({ error: 'Портфолио обязательно' });
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
            .filter((l) => l && l.url)
            .map((l) => ({ url: l.url, title: l.title || '', source: l.source || 'youtube' })),
        },
      },
      update: {
        comment: comment || null,
        portfolioLinks: {
          deleteMany: {},
          create: links
            .filter((l) => l && l.url)
            .map((l) => ({ url: l.url, title: l.title || '', source: l.source || 'youtube' })),
        },
      },
      include: RESPONSE_INCLUDE,
    });

    const name = await userName(meId);
    await notify({
      userId: vacancy.authorId,
      actorId: meId,
      type: 'vacancy_response',
      title: 'Отклик на вакансию',
      body: `${name} откликнулся на вакансию «${vacancy.title}»`,
      link: `/vacancies/${vacancy.id}`,
    });

    res.status(201).json(response);
  } catch (e: any) {
    console.error('[vacancies] POST /:id/responses', e);
    res.status(500).json({ error: e.message });
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

    res.status(201).json(created);
  } catch (e: any) {
    console.error('[vacancies] POST /:id/responses/:responseId/portfolio', e);
    res.status(500).json({ error: e.message });
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
    console.error('[vacancies] DELETE /:id/responses/:responseId/portfolio/:fileId', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/vacancies/:id/responses — responses list (owner only) ────────────
router.get('/:id/responses', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
    if (!vacancy) return res.status(404).json({ error: 'Not found' });
    if (vacancy.authorId !== meId && !(await assertArtistOwner(meId, vacancy.artistId))) {
      return res.status(404).json({ error: 'Not found' });
    }
    const responses = await prisma.vacancyResponse.findMany({
      where: { vacancyId: vacancy.id },
      orderBy: { createdAt: 'desc' },
      include: RESPONSE_INCLUDE,
    });
    res.json(responses);
  } catch (e: any) {
    console.error('[vacancies] GET /:id/responses', e);
    res.status(500).json({ error: e.message });
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

    const aName = await artistName(vacancy.artistId);
    await notify({
      userId: candidateId,
      actorId: meId,
      type: 'vacancy_offered',
      title: 'Вам предложили вакансию',
      body: `${aName} предлагает вакансию «${vacancy.title}»`,
      link: `/vacancies/${vacancy.id}`,
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[vacancies] POST /:id/offer', e);
    res.status(500).json({ error: e.message });
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

    if (!startDate) return res.status(400).json({ error: 'startDate required' });
    if (!conditions || !String(conditions).trim()) return res.status(400).json({ error: 'conditions required' });
    if (!compensation || !String(compensation).trim()) return res.status(400).json({ error: 'compensation required' });

    const offer = await prisma.vacancyOffer.create({
      data: {
        vacancyId: vacancy.id,
        responseId: response.id,
        applicantId: response.applicantId,
        startDate: new Date(startDate),
        conditions: String(conditions),
        compensation: String(compensation),
        extraDetails: extraDetails || null,
        status: 'pending',
      },
    });

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
    console.error('[vacancies] POST /:id/responses/:responseId/cooperation', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/vacancies/offers/:offerId/accept — applicant accepts ────────────
router.post('/offers/:offerId/accept', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const offer = await prisma.vacancyOffer.findUnique({
      where: { id: req.params.offerId },
      include: { vacancy: { select: { id: true, title: true, authorId: true } } },
    });
    if (!offer || offer.applicantId !== meId) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.vacancyOffer.update({
      where: { id: offer.id },
      data: { status: 'accepted' },
    });

    const name = await userName(meId);
    await notify({
      userId: offer.vacancy.authorId,
      actorId: meId,
      type: 'vacancy_offer_accepted',
      title: 'Предложение принято',
      body: `${name} принял предложение по вакансии «${offer.vacancy.title}»`,
      link: `/vacancies/${offer.vacancy.id}`,
    });

    res.json({ offer: updated, vacancyId: offer.vacancy.id });
  } catch (e: any) {
    console.error('[vacancies] POST /offers/:offerId/accept', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/vacancies/offers/:offerId/reject — applicant rejects ────────────
router.post('/offers/:offerId/reject', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const offer = await prisma.vacancyOffer.findUnique({
      where: { id: req.params.offerId },
      include: { vacancy: { select: { id: true, title: true, authorId: true } } },
    });
    if (!offer || offer.applicantId !== meId) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.vacancyOffer.update({
      where: { id: offer.id },
      data: { status: 'rejected' },
    });

    const name = await userName(meId);
    await notify({
      userId: offer.vacancy.authorId,
      actorId: meId,
      type: 'vacancy_offer_rejected',
      title: 'Предложение отклонено',
      body: `${name} отклонил предложение по вакансии «${offer.vacancy.title}»`,
      link: `/vacancies/${offer.vacancy.id}`,
    });

    res.json({ offer: updated, vacancyId: offer.vacancy.id });
  } catch (e: any) {
    console.error('[vacancies] POST /offers/:offerId/reject', e);
    res.status(500).json({ error: e.message });
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
    console.error('[vacancies] POST /:id/references', e);
    res.status(500).json({ error: e.message });
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
    console.error('[vacancies] DELETE /:id/references/:fileId', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
