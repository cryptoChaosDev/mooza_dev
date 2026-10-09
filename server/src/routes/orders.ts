import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { notify, notifyMany } from '../utils/notify';
import { uploadOrderMedia } from '../middleware/upload';
import { matchesLinkSource } from '../lib/materialLinks';
import { parseDeadlineField } from '../lib/mskDate';
import { checkDealParticipantsAge, withAdvisoryLock } from '../lib/dealHelpers';
import { guestReadLimiter } from '../middleware/rateLimiter';
import { sendPublic } from '../middleware/guest';
import { getPublicOrder } from '../lib/publicData';

const router = Router();

const MAX_REFERENCES_BYTES = 20 * 1024 * 1024; // 20MB total per order
// done = «Выполнен»: заказ завершён исполнителем; пост остаётся в ленте с бейджем.
const VALID_STATUS = new Set(['active', 'draft', 'archived', 'done']);

// Детали ошибок (Prisma и т.п.) — только в лог, клиенту общий текст.
function serverError(res: any, where: string, e: any) {
  console.error(`[orders] ${where}`, e);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

// Бюджет: пусто → null, иначе целое ≥ 0. undefined → поле не передано.
function parseBudget(v: unknown): number | null | undefined | 'invalid' {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 'invalid';
}

/**
 * Проверка перехода в статус. Возвращает текст ошибки (409) или null.
 *  - active: срок не должен быть в прошлом — иначе планировщик через минуту
 *    снова отправит заказ в архив («Опубликовать» не работало);
 *  - done («Выполнен»): только при выбранном исполнителе.
 */
function statusTransitionError(
  target: string,
  order: { deadline: Date | null; executorId: string | null },
): string | null {
  if (target === 'active' && order.deadline && order.deadline.getTime() < Date.now()) {
    return 'Срок выполнения заказа истёк — укажите новый срок, чтобы опубликовать заказ';
  }
  if (target === 'done' && !order.executorId) {
    return 'Отметить заказ выполненным можно только после выбора исполнителя';
  }
  return null;
}

// Full order shape returned to the author / single-order view.
const ORDER_INCLUDE = {
  service: { select: { id: true, name: true, section: { select: { id: true, name: true } } } },
  selectedCustomFilterValues: { select: { id: true, value: true, filter: { select: { id: true, name: true } } } },
  referenceFiles: { orderBy: { createdAt: 'asc' as const } },
  referenceLinks: { orderBy: { createdAt: 'asc' as const } },
  executor: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true } },
  _count: { select: { responses: true } },
} as const;

// Compact shape for «Мои заказы» tiles.
const ORDER_MINE_SELECT = {
  id: true,
  title: true,
  status: true,
  deadline: true,
  budgetFrom: true,
  budgetTo: true,
  createdAt: true,
  executorId: true,
  executor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
  service: { select: { id: true, name: true, section: { select: { id: true, name: true } } } },
  _count: { select: { responses: true } },
} as const;

// Resolve the author display name for notifications.
async function authorName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
}

// Build the post body that mirrors an order in the feed.
async function syncOrderPost(orderId: string, authorId: string, title: string, description: string | null) {
  const existing = await prisma.post.findFirst({ where: { orderId, type: 'order' } });
  if (existing) {
    await prisma.post.update({
      where: { id: existing.id },
      data: { title, content: description || '' },
    });
    return existing.id;
  }
  const post = await prisma.post.create({
    data: { type: 'order', authorId, orderId, title, content: description || '' },
  });
  return post.id;
}

// ── POST /api/orders — create order ───────────────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const {
      title, serviceId, budgetFrom, budgetTo, deadline, description,
      customFilterValueIds, status, referenceLinks,
    } = req.body;

    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    if (!serviceId) return res.status(400).json({ error: 'serviceId required' });
    // «Выполнен» при создании невозможен (нет исполнителя) — такой статус → черновик.
    const st = VALID_STATUS.has(status) && status !== 'done' ? status : 'draft';
    const cfvIds: string[] = Array.isArray(customFilterValueIds) ? customFilterValueIds : [];
    const links: Array<{ url: string; title?: string; source: string }> = Array.isArray(referenceLinks) ? referenceLinks : [];

    const bFrom = parseBudget(budgetFrom);
    const bTo = parseBudget(budgetTo);
    if (bFrom === 'invalid' || bTo === 'invalid') return res.status(400).json({ error: 'Некорректный бюджет' });
    if (bFrom != null && bTo != null && bFrom > bTo) return res.status(400).json({ error: '«Бюджет от» не может быть больше «Бюджет до»' });
    // Срок — календарный день, хранится как конец дня по МСК.
    const dl = parseDeadlineField(deadline);
    if (dl === 'invalid') return res.status(400).json({ error: 'Некорректная дата срока' });
    if (st === 'active' && dl && dl.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Срок выполнения не может быть в прошлом' });
    }
    const svc = await prisma.service.findUnique({ where: { id: String(serviceId) }, select: { id: true } });
    if (!svc) return res.status(400).json({ error: 'Раздел каталога не найден' });

    const order = await prisma.order.create({
      data: {
        authorId: meId,
        serviceId: svc.id,
        title: String(title).slice(0, 50),
        budgetFrom: bFrom ?? null,
        budgetTo: bTo ?? null,
        deadline: dl ?? null,
        description: description || null,
        status: st,
        selectedCustomFilterValues: { connect: cfvIds.map((id) => ({ id })) },
        referenceLinks: {
          create: links
            .filter((l) => l && l.url && matchesLinkSource(l.source, l.url))
            .map((l) => ({ url: l.url, title: l.title || '', source: l.source })),
        },
      },
    });

    // Файлы-референсы загружаются отдельным запросом POST /:id/references уже
    // после создания заказа (у OrderReferenceFile обязательный orderId — «заранее
    // загруженных» файлов не бывает), поэтому здесь их не привязываем.

    if (st === 'active') {
      await syncOrderPost(order.id, meId, order.title, order.description);
    }

    const full = await prisma.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
    res.status(201).json(full);
  } catch (e: any) {
    return serverError(res, 'POST /', e);
  }
});

// ── PATCH /api/orders/:id — partial update ────────────────────────────────────
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.authorId !== meId) return res.status(404).json({ error: 'Not found' });

    const {
      title, serviceId, budgetFrom, budgetTo, deadline, description,
      customFilterValueIds, status, referenceLinks,
    } = req.body;

    // Editing is blocked once the order has any response — you can't change the terms
    // out from under people who already replied. Исключение — срок: его можно
    // продлить (иначе заказ с откликами, ушедший в архив по сроку, нельзя было
    // опубликовать снова: «Опубликовать» → 409/повторный автоархив). Any status is
    // otherwise editable directly (no more «move to draft first»).
    const respCount = await prisma.orderResponse.count({ where: { orderId: order.id } });
    if (respCount > 0) {
      const otherFields = { title, serviceId, budgetFrom, budgetTo, description, customFilterValueIds, status, referenceLinks };
      const touchesOther = Object.values(otherFields).some((v) => v !== undefined);
      if (touchesOther || deadline === undefined) {
        return res.status(409).json({ error: 'Нельзя редактировать заказ — на него уже есть отклики. Можно изменить только срок.' });
      }
    }

    const data: any = {};
    if (title !== undefined) data.title = String(title).slice(0, 50);
    if (serviceId !== undefined) {
      const svc = await prisma.service.findUnique({ where: { id: String(serviceId) }, select: { id: true } });
      if (!svc) return res.status(400).json({ error: 'Раздел каталога не найден' });
      data.serviceId = svc.id;
    }
    const bFrom = parseBudget(budgetFrom);
    const bTo = parseBudget(budgetTo);
    if (bFrom === 'invalid' || bTo === 'invalid') return res.status(400).json({ error: 'Некорректный бюджет' });
    if (bFrom !== undefined) data.budgetFrom = bFrom;
    if (bTo !== undefined) data.budgetTo = bTo;
    const effFrom = bFrom !== undefined ? bFrom : order.budgetFrom;
    const effTo = bTo !== undefined ? bTo : order.budgetTo;
    if (effFrom != null && effTo != null && effFrom > effTo) {
      return res.status(400).json({ error: '«Бюджет от» не может быть больше «Бюджет до»' });
    }
    const dl = parseDeadlineField(deadline);
    if (dl === 'invalid') return res.status(400).json({ error: 'Некорректная дата срока' });
    if (dl !== undefined) data.deadline = dl;
    if (description !== undefined) data.description = description || null;
    if (status !== undefined && VALID_STATUS.has(status)) data.status = status;

    // Итоговое состояние не должно сразу же уйти в автоархив / стать «Выполнен» без исполнителя.
    const effStatus: string = data.status ?? order.status;
    const effDeadline: Date | null = dl !== undefined ? dl : order.deadline;
    if (dl && dl.getTime() < Date.now() && (effStatus === 'active' || respCount > 0)) {
      return res.status(400).json({ error: 'Срок выполнения не может быть в прошлом' });
    }
    if (data.status !== undefined && data.status !== order.status) {
      const err = statusTransitionError(data.status, { deadline: effDeadline, executorId: order.executorId });
      if (err) return res.status(409).json({ error: err });
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

    const updated = await prisma.order.update({ where: { id: order.id }, data, include: ORDER_INCLUDE });

    // Publish-on-edit + keep the linked feed post in sync.
    if (updated.status === 'active') {
      await syncOrderPost(updated.id, updated.authorId, updated.title, updated.description);
    }

    res.json(updated);
  } catch (e: any) {
    return serverError(res, 'PATCH /:id', e);
  }
});

// ── PATCH /api/orders/:id/status — manual status change ───────────────────────
router.patch('/:id/status', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { status } = req.body;
    if (!VALID_STATUS.has(status)) return res.status(400).json({ error: 'Invalid status' });
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.authorId !== meId) return res.status(404).json({ error: 'Not found' });
    if (status !== order.status) {
      const err = statusTransitionError(status, order);
      if (err) return res.status(409).json({ error: err });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status },
      include: ORDER_INCLUDE,
    });

    // draft/archived → active = «Опубликовать»: create the feed post if missing.
    if (status === 'active') {
      await syncOrderPost(updated.id, updated.authorId, updated.title, updated.description);
    } else if (status === 'draft') {
      // Back to draft = снятие с публикации (для редактирования): remove the feed post.
      // Archived orders KEEP their feed post — they stay visible with an «В архиве» badge.
      await prisma.post.deleteMany({ where: { orderId: updated.id, type: 'order' } });
    }

    res.json(updated);
  } catch (e: any) {
    return serverError(res, 'PATCH /:id/status', e);
  }
});

// ── DELETE /api/orders/:id ────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { referenceFiles: { select: { url: true } } },
    });
    if (!order || order.authorId !== meId) return res.status(404).json({ error: 'Not found' });

    // Best-effort: remove reference files from disk before cascading the row.
    for (const f of order.referenceFiles) {
      try {
        const abs = path.join(process.cwd(), f.url.replace(/^\//, ''));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch {}
    }

    await prisma.order.delete({ where: { id: order.id } });
    res.json({ ok: true });
  } catch (e: any) {
    return serverError(res, 'DELETE /:id', e);
  }
});

// ── GET /api/orders/for-service/:serviceId — заказы, подходящие моей услуге ───
// Владелец услуги видит открытые заказы по той же каталожной услуге: активные,
// без выбранного исполнителя, опубликованные (есть пост), не свои и куда он ещё
// не откликался. Обратный матчинг к GET /:id/matches (заказ→исполнители).
router.get('/for-service/:serviceId', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const orders = await prisma.order.findMany({
      where: {
        serviceId: req.params.serviceId,
        status: 'active',
        executorId: null,
        authorId: { not: meId },
        posts: { some: { type: 'order' } },
        responses: { none: { executorId: meId } },
      },
      select: {
        id: true, title: true, budgetFrom: true, budgetTo: true, deadline: true, createdAt: true,
        author: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        _count: { select: { responses: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(orders);
  } catch (e: any) {
    return serverError(res, 'GET /for-service/:serviceId', e);
  }
});

// ── GET /api/orders/mine?status= — author's orders ────────────────────────────
router.get('/mine', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { status } = req.query as { status?: string };
    const where: any = { authorId: meId };
    if (status && VALID_STATUS.has(status)) where.status = status;
    const orders = await prisma.order.findMany({
      where,
      select: ORDER_MINE_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(orders);
  } catch (e: any) {
    return serverError(res, 'GET /mine', e);
  }
});

// ── GET /api/orders/responses/incoming — responses to orders I authored ───────
router.get('/responses/incoming', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const responses = await prisma.orderResponse.findMany({
      where: { order: { authorId: meId } },
      include: {
        order: { select: { id: true, title: true } },
        executor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      responses.map((r) => ({
        id: r.id,
        order: r.order,
        executor: r.executor,
        price: r.price,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
    );
  } catch (e: any) {
    return serverError(res, 'GET /responses/incoming', e);
  }
});

// ── GET /api/orders/:id — full order ──────────────────────────────────────────
router.get('/:id', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res) => {
  try {
    // Гость: draft / без поста → 404; материалы — только количество; отклики и
    // контакты не отдаются; автор без согласия — «Заказчик на Moooza».
    if (!req.userId) {
      return sendPublic(res, await getPublicOrder(req.params.id), 'Not found');
    }
    const meId = req.userId ?? null;
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        ...ORDER_INCLUDE,
        responses: {
          orderBy: { createdAt: 'desc' as const },
          include: { executor: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        },
      },
    });
    if (!order) return res.status(404).json({ error: 'Not found' });

    const isOwner = !!meId && order.authorId === meId;
    // Resolve the linked feed post: gates the non-owner view AND is surfaced as
    // `postId` so the client can deep-link «Посмотреть в Потоке» straight to it.
    const post = await prisma.post.findFirst({ where: { orderId: order.id, type: 'order' }, select: { id: true } });
    if (!isOwner && !post) return res.status(404).json({ error: 'Not found' });

    const { responses, ...rest } = order;
    // Откликнувшемуся отдаём ЕГО отклик — иначе после перезагрузки снова
    // показывалась кнопка «Откликнуться».
    const myResponse = !isOwner && meId
      ? (() => {
        const r = responses.find((x) => x.executorId === meId);
        return r ? { id: r.id, price: r.price, comment: r.comment, createdAt: r.createdAt } : null;
      })()
      : undefined;
    // Кому автор уже предложил заказ (дедуп «Предложить заказ» переживает перезагрузку).
    const offeredExecutorIds = isOwner
      ? [...new Set((await prisma.notification.findMany({
        where: { type: 'order_offered', link: `/orders/${order.id}`, actorId: meId },
        select: { userId: true },
      })).map((n) => n.userId))]
      : undefined;
    res.json({
      ...rest, isOwner, postId: post?.id ?? null,
      responses: isOwner ? responses : undefined,
      myResponse,
      offeredExecutorIds,
    });
  } catch (e: any) {
    return serverError(res, 'GET /:id', e);
  }
});

// ── GET /api/orders/:id/matches — matching executors (fallback cascade) ───────
// Только автор заказа: это подборка пользователей под его бриф (раньше стоял
// optionalAuthenticate — список людей утекал кому угодно).
router.get('/:id/matches', authenticate, async (req: AuthRequest, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { selectedCustomFilterValues: { select: { id: true, filterId: true, filter: { select: { name: true } } } } },
    });
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (order.authorId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const pageNum = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limitNum = parseInt(String(req.query.limit ?? '20'), 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Group the order's selected filter values by their parent filter so we match
    // AND-between-filters / OR-within-a-filter (e.g. instrument=арфа AND genre∈{…}),
    // instead of a flat OR over all values — which matched anyone sharing a single
    // common value like «Уровень: средний» and surfaced the whole section.
    // «Уровень» is treated as a soft (relaxable) filter; everything else is key.
    const groupsMap = new Map<string, { ids: string[]; soft: boolean }>();
    for (const v of order.selectedCustomFilterValues as any[]) {
      const soft = String(v.filter?.name ?? '').trim().toLowerCase() === 'уровень';
      const g = groupsMap.get(v.filterId) ?? { ids: [], soft };
      g.ids.push(v.id);
      groupsMap.set(v.filterId, g);
    }
    const allGroups = [...groupsMap.values()];
    const keyGroups = allGroups.filter((g) => !g.soft);
    const softGroups = allGroups.filter((g) => g.soft);
    const serviceId = order.serviceId;
    // Budget → executor price: the offering's [priceFrom, priceTo] should overlap
    // the order's budget window (mirrors references service-search price logic).
    const priceMin = order.budgetFrom ?? null;
    const priceMax = order.budgetTo ?? null;

    const userSelect = {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      avatar: true,
      city: true,
      fieldOfActivity: { select: { id: true, name: true } },
      userProfessions: { select: { id: true, profession: { select: { id: true, name: true } } } },
      userServices: {
        include: {
          service: { select: { id: true, name: true } },
          genres: { select: { id: true, name: true } },
          workFormats: { select: { id: true, name: true } },
          employmentTypes: { select: { id: true, name: true } },
          skillLevels: { select: { id: true, name: true } },
          availabilities: { select: { id: true, name: true } },
          geographies: { select: { id: true, name: true } },
        },
      },
    } as const;

    // One `some` clause per filter group → AND between filters, OR within a filter.
    const groupClauses = (gs: { ids: string[] }[]) =>
      gs.map((g) => ({ selectedCustomFilterValues: { some: { id: { in: g.ids } } } }));
    const priceClause = () => {
      const c: any = {};
      if (priceMin != null) c.priceTo = { gte: priceMin };
      if (priceMax != null) c.priceFrom = { lte: priceMax };
      return c;
    };
    // A user matches if they have an offering for this service satisfying `extra`.
    const userWhere = (extra: any) => ({
      id: { not: order.authorId },
      userServices: { some: { serviceId, ...extra } },
    });

    const dedup = <T extends { id: string }>(arr: T[]) =>
      [...new Map(arr.map((x) => [x.id, x])).values()];

    const shape = (users: any[]) =>
      users.map((user) => {
        const { userServices, userProfessions, ...userData } = user;
        return {
          id: user.id,
          user: userData,
          searchProfile: {
            professions: dedup(userProfessions.map((up: any) => up.profession)),
            services: dedup(userServices.map((us: any) => us.service)),
            genres: dedup(userServices.flatMap((us: any) => us.genres)),
            workFormats: dedup(userServices.flatMap((us: any) => us.workFormats)),
            employmentTypes: dedup(userServices.flatMap((us: any) => us.employmentTypes)),
            skillLevels: dedup(userServices.flatMap((us: any) => us.skillLevels)),
            availabilities: dedup(userServices.flatMap((us: any) => us.availabilities)),
            geographies: dedup(userServices.flatMap((us: any) => us.geographies)),
          },
        };
      });

    // Fallback cascade. When the order specifies filters, the KEY filters are
    // REQUIRED (AND between filters); we relax only price and the soft «Уровень»
    // filter — never down to «everyone offering the service», so suggestions stay
    // relevant («запись арфы» won't list every session-recording user). When the
    // order has no filters at all, the service is the only available signal.
    const levels: Array<{ level: string; where: any }> = [];
    if (allGroups.length > 0) {
      levels.push({ level: 'full',     where: userWhere({ AND: groupClauses(allGroups), ...priceClause() }) });
      levels.push({ level: 'no_price', where: userWhere({ AND: groupClauses(allGroups) }) });
      if (keyGroups.length > 0 && softGroups.length > 0) {
        levels.push({ level: 'no_soft', where: userWhere({ AND: groupClauses(keyGroups) }) });
      }
      if (keyGroups.length === 0) {
        // Only soft filters were chosen → service becomes the strongest signal.
        levels.push({ level: 'service_price', where: userWhere({ ...priceClause() }) });
        levels.push({ level: 'service',       where: userWhere({}) });
      }
    } else {
      levels.push({ level: 'full',     where: userWhere({ ...priceClause() }) });
      levels.push({ level: 'no_price', where: userWhere({}) });
    }

    for (const { level, where } of levels) {
      const totalCount = await prisma.user.count({ where });
      if (totalCount === 0) continue;
      const users = await prisma.user.findMany({
        where, select: userSelect, skip, take: limitNum, orderBy: { createdAt: 'desc' },
      });
      return res.json({
        results: shape(users),
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

// ── POST /api/orders/:id/responses — executor responds (upsert) ───────────────
router.post('/:id/responses', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { price, comment } = req.body;
    if (price == null || price === '' || Number.isNaN(Number(price))) {
      return res.status(400).json({ error: 'price required' });
    }
    const priceNum = Number(price);
    if (!Number.isInteger(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: 'Цена — целое неотрицательное число' });
    }
    const commentText = typeof comment === 'string' && comment.trim() ? comment.trim().slice(0, 2000) : null;
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (order.authorId === meId) return res.status(400).json({ error: 'Cannot respond to your own order' });
    // Отклики принимаются только пока заказ активен («Ищем исполнителя»):
    // архивный/выполненный/черновик остаются видимыми, но отклики закрыты.
    if (order.status !== 'active') {
      const label = order.status === 'done' ? 'Заказ выполнен'
        : order.status === 'archived' ? 'Заказ в архиве'
        : 'Заказ не опубликован';
      return res.status(409).json({ error: `${label} — отклики закрыты` });
    }
    // Исполнитель уже выбран — отклики закрыты (заказ остаётся видимым всем).
    if (order.executorId) return res.status(409).json({ error: 'Исполнитель уже выбран — отклики закрыты' });
    // Non-authors may respond only to a published order.
    const post = await prisma.post.findFirst({ where: { orderId: order.id, type: 'order' }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Not found' });

    const existing = await prisma.orderResponse.findUnique({
      where: { orderId_executorId: { orderId: order.id, executorId: meId } },
      select: { id: true },
    });
    const response = await prisma.orderResponse.upsert({
      where: { orderId_executorId: { orderId: order.id, executorId: meId } },
      create: { orderId: order.id, executorId: meId, price: priceNum, comment: commentText },
      update: { price: priceNum, comment: commentText },
    });

    const name = await authorName(meId);
    await notify({
      userId: order.authorId,
      actorId: meId,
      type: 'order_response',
      title: existing ? 'Отклик на заказ изменён' : 'Отклик на заказ',
      body: existing
        ? `${name} изменил(а) отклик на заказ «${order.title}»`
        : `${name} откликнулся на заказ «${order.title}»`,
      link: `/orders/${order.id}`,
    });

    res.status(201).json(response);
  } catch (e: any) {
    return serverError(res, 'POST /:id/responses', e);
  }
});

// ── GET /api/orders/:id/responses — responses list (author only) ──────────────
router.get('/:id/responses', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.authorId !== meId) return res.status(404).json({ error: 'Not found' });
    const responses = await prisma.orderResponse.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
      include: { executor: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });
    res.json(responses);
  } catch (e: any) {
    return serverError(res, 'GET /:id/responses', e);
  }
});

// ── POST /api/orders/:id/offer — propose the order to an executor ─────────────
router.post('/:id/offer', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { executorId } = req.body;
    if (!executorId || typeof executorId !== 'string') return res.status(400).json({ error: 'executorId required' });
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.authorId !== meId) return res.status(404).json({ error: 'Not found' });
    if (executorId === meId) return res.status(400).json({ error: 'Cannot offer to yourself' });
    // Предлагать можно только открытый опубликованный заказ — иначе исполнитель
    // получит уведомление, а откликнуться не сможет.
    if (order.status !== 'active') return res.status(409).json({ error: 'Заказ не опубликован — предложить его нельзя' });
    if (order.executorId) return res.status(409).json({ error: 'Исполнитель уже выбран' });
    const post = await prisma.post.findFirst({ where: { orderId: order.id, type: 'order' }, select: { id: true } });
    if (!post) return res.status(409).json({ error: 'Заказ не опубликован — предложить его нельзя' });
    const target = await prisma.user.findUnique({ where: { id: executorId }, select: { id: true } });
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    const responded = await prisma.orderResponse.findUnique({
      where: { orderId_executorId: { orderId: order.id, executorId } },
      select: { id: true },
    });
    if (responded) return res.status(409).json({ error: 'Этот исполнитель уже откликнулся на заказ' });

    // Дедуп: повторное «Предложить заказ» тому же исполнителю не шлёт уведомление
    // снова (защита от спама). Факт предложения — уведомление order_offered.
    const already = await prisma.notification.findFirst({
      where: { userId: executorId, type: 'order_offered', link: `/orders/${order.id}` },
      select: { id: true },
    });
    if (already) return res.json({ ok: true, alreadyOffered: true });

    const name = await authorName(meId);
    await notify({
      userId: executorId,
      actorId: meId,
      type: 'order_offered',
      title: 'Вам предложили заказ',
      body: `${name} предложил(-а) вам заказ «${order.title}»`,
      link: `/orders/${order.id}`,
    });

    res.json({ ok: true });
  } catch (e: any) {
    return serverError(res, 'POST /:id/offer', e);
  }
});

// ── POST /api/orders/:id/responses/:responseId/deal — open a deal ─────────────
router.post('/:id/responses/:responseId/deal', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.authorId !== meId) return res.status(404).json({ error: 'Not found' });
    const response = await prisma.orderResponse.findUnique({ where: { id: req.params.responseId } });
    if (!response || response.orderId !== order.id) return res.status(404).json({ error: 'Response not found' });
    if (response.executorId === meId) return res.status(400).json({ error: 'Cannot create deal with yourself' });
    // Сделка — только по открытому заказу и, если исполнитель уже выбран, только с ним.
    if (order.status !== 'active') return res.status(409).json({ error: 'Заказ не активен — оформить сделку нельзя' });
    if (order.executorId && order.executorId !== response.executorId) {
      return res.status(409).json({ error: 'По заказу уже выбран другой исполнитель' });
    }
    if (order.deadline && order.deadline.getTime() < Date.now()) {
      return res.status(409).json({ error: 'Срок заказа истёк — продлите срок, чтобы оформить сделку' });
    }
    // Финансовые операции — 18+ (обе стороны; без даты рождения — нельзя).
    const ageErr = await checkDealParticipantsAge(meId, response.executorId);
    if (ageErr) return res.status(ageErr.status).json(ageErr.body);

    const dealInclude = {
      customer: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      executor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
    };
    // Идемпотентность: повторный клик/гонка не создаёт дубль — если по этому
    // заказу уже есть незавершённая сделка с этим исполнителем, возвращаем её.
    const { deal, created } = await withAdvisoryLock(`order-deal:${order.id}:${response.executorId}`, async (tx) => {
      const existing = await tx.deal.findFirst({
        where: {
          customerId: meId,
          executorId: response.executorId,
          serviceId: order.serviceId,
          title: order.title,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        include: dealInclude,
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return { deal: existing, created: false };
      const d = await tx.deal.create({
        data: {
          title: order.title,
          customerId: meId,
          executorId: response.executorId,
          serviceId: order.serviceId,
          price: response.price,
          dealType: 'process',
          deadline: order.deadline ?? null,
        },
        include: dealInclude,
      });
      return { deal: d, created: true };
    });
    if (!created) return res.json({ deal, existing: true });

    const name = await authorName(meId);
    await notify({
      userId: response.executorId,
      actorId: meId,
      type: 'deal_created',
      title: `${name} создал(а) сделку`,
      body: `«${order.title}». Ознакомьтесь с условиями и примите или отклоните.`,
      link: `/deals/${deal.id}`,
    });

    res.status(201).json({ deal });
  } catch (e: any) {
    return serverError(res, 'POST /:id/responses/:responseId/deal', e);
  }
});

// ── POST /api/orders/:id/responses/:responseId/choose — выбрать исполнителя ───
// Автор выбирает исполнителя из откликов. Однократно: после выбора отклики
// закрыты (гейт в POST /:id/responses), заказ остаётся видимым всем.
router.post('/:id/responses/:responseId/choose', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.authorId !== meId) return res.status(404).json({ error: 'Not found' });
    if (order.executorId) return res.status(409).json({ error: 'Исполнитель уже выбран' });
    // Выбор — только в активном заказе (архив/черновик/выполнен: сначала опубликуйте,
    // при истёкшем сроке — продлите его). Клиент показывает кнопку только в active.
    if (order.status !== 'active') {
      return res.status(409).json({ error: 'Выбрать исполнителя можно только в активном заказе — опубликуйте его снова' });
    }
    const response = await prisma.orderResponse.findUnique({
      where: { id: req.params.responseId },
      include: { executor: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });
    if (!response || response.orderId !== order.id) return res.status(404).json({ error: 'Response not found' });

    // Атомарно против гонки двойного выбора (executorId ещё пуст) и автоархива.
    const updated = await prisma.order.updateMany({
      where: { id: order.id, executorId: null, status: 'active' },
      data: { executorId: response.executorId, executorChosenAt: new Date() },
    });
    if (updated.count === 0) return res.status(409).json({ error: 'Исполнитель уже выбран или заказ больше не активен' });

    const name = await authorName(meId);
    await notify({
      userId: response.executorId,
      actorId: meId,
      type: 'order_executor_chosen',
      title: '🎉 Вас выбрали исполнителем',
      body: `${name} выбрал(а) вас исполнителем заказа «${order.title}». Обсудите детали в сообщениях.`,
      link: `/orders/${order.id}`,
    });
    // Остальным откликнувшимся — что отклики закрыты (иначе они ждут ответа вечно).
    const others = await prisma.orderResponse.findMany({
      where: { orderId: order.id, executorId: { not: response.executorId } },
      select: { executorId: true },
    });
    await notifyMany(others.map((o) => o.executorId), {
      actorId: meId,
      type: 'order_executor_chosen_other',
      title: 'Исполнитель по заказу выбран',
      body: `По заказу «${order.title}» выбран другой исполнитель. Спасибо за отклик!`,
      link: `/orders/${order.id}`,
    });

    const fresh = await prisma.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
    res.json(fresh);
  } catch (e: any) {
    return serverError(res, 'POST /:id/responses/:responseId/choose', e);
  }
});

// ── POST /api/orders/:id/references — upload reference files (≤20MB total) ────
router.post('/:id/references', authenticate, uploadOrderMedia.array('files'), async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.authorId !== meId) {
      // Clean up any files multer already wrote before rejecting.
      for (const f of (req.files as Express.Multer.File[] | undefined) ?? []) {
        try { fs.unlinkSync(f.path); } catch {}
      }
      return res.status(404).json({ error: 'Not found' });
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ error: 'No files' });

    const agg = await prisma.orderReferenceFile.aggregate({
      where: { orderId: order.id },
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
        prisma.orderReferenceFile.create({
          data: {
            orderId: order.id,
            url: `/uploads/orders/${f.filename}`,
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

// ── DELETE /api/orders/:id/references/:fileId — remove a reference file ───────
router.delete('/:id/references/:fileId', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.authorId !== meId) return res.status(404).json({ error: 'Not found' });
    const file = await prisma.orderReferenceFile.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.orderId !== order.id) return res.status(404).json({ error: 'File not found' });

    try {
      const abs = path.join(process.cwd(), file.url.replace(/^\//, ''));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {}

    await prisma.orderReferenceFile.delete({ where: { id: file.id } });
    res.json({ ok: true });
  } catch (e: any) {
    return serverError(res, 'DELETE /:id/references/:fileId', e);
  }
});

export default router;
