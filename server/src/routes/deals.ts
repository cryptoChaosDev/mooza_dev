import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { notify as sendNotification } from '../utils/notify';
import { tgEvent } from '../utils/telegram';
import logger from '../utils/logger';
import { parseCalendarDay, endOfDayMsk } from '../lib/mskDate';
import {
  ACCEPT_DAYS_DEFAULT, MAX_REVISIONS, checkDealParticipantsAge, ensureDealConnection, withAdvisoryLock,
} from '../lib/dealHelpers';

const router = Router();

const DEAL_INCLUDE = {
  customer: { select: { id: true, firstName: true, lastName: true, avatar: true } },
  executor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
  service: { select: { id: true, name: true } },
  userService: { select: { id: true, service: { select: { name: true } }, profession: { select: { name: true } } } },
  editRequests: {
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
};

// Отмена разрешена только до сдачи работы/события. В REVIEW, REVISION и
// AWAITING_CONFIRMATION работа уже выполнена (или выполняется по правкам) —
// отменить «в одну сторону» нельзя, только принять/отправить на доработку.
const CANCELLABLE_STATUSES = ['PENDING', 'AWAITING_PAYMENT', 'IN_PROGRESS', 'AWAITING_EVENT'];
// Изменение условий (срок сдачи/приёмки/правки) — только для процессных сделок
// после принятия и до завершения.
const EDITABLE_STATUSES = ['AWAITING_PAYMENT', 'IN_PROGRESS', 'REVIEW', 'REVISION'];

const DAY_MS = 24 * 60 * 60 * 1000;

function serverError(res: any, where: string, e: any) {
  logger.error(`[deals] ${where}: ${e?.message}`);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

// Прежняя сигнатура поверх utils/notify (настройки получателя, сокет, push). Never throws.
function notify(userId: string, actorId: string | null, type: string, title: string, body: string, link: string) {
  return sendNotification({ userId, actorId, type, title, body, link });
}

// GET /api/deals — my deals (customer + executor)
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { role, status } = req.query as { role?: string; status?: string };
    const where: any = { OR: [{ customerId: meId }, { executorId: meId }] };
    if (role === 'customer') where.OR = undefined, where.customerId = meId;
    if (role === 'executor') where.OR = undefined, where.executorId = meId;
    if (typeof status === 'string' && status) where.status = status;
    const deals = await prisma.deal.findMany({ where, include: DEAL_INCLUDE, orderBy: { updatedAt: 'desc' } });
    res.json(deals);
  } catch (e: any) { return serverError(res, 'GET /', e); }
});

// GET /api/deals/:id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id }, include: DEAL_INCLUDE });
    if (!deal) return res.status(404).json({ error: 'Not found' });
    if (deal.customerId !== meId && deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    // Отзыв по сделке хранится один на пару (author,target,type='deal') — отдаём
    // флаг с сервера, чтобы «Оценка отправлена» не терялась после перезагрузки.
    const partnerId = deal.customerId === meId ? deal.executorId : deal.customerId;
    const myReview = await prisma.review.findFirst({
      where: { authorId: meId, targetId: partnerId, type: 'deal' },
      select: { id: true },
    });
    res.json({ ...deal, myReviewSent: !!myReview });
  } catch (e: any) { return serverError(res, 'GET /:id', e); }
});

// POST /api/deals — create deal (customer)
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { title, executorId, serviceId, userServiceId, price, deadline, acceptDeadline, revisionCount, result, dealType, eventDate, deposit } = req.body;
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    if (!executorId || typeof executorId !== 'string' || !cleanTitle) {
      return res.status(400).json({ error: 'executorId and title required' });
    }
    if (cleanTitle.length > 100) return res.status(400).json({ error: 'Название сделки — не длиннее 100 символов' });
    if (executorId === meId) return res.status(400).json({ error: 'Cannot create deal with yourself' });

    const executor = await prisma.user.findUnique({ where: { id: executorId }, select: { id: true, firstName: true, lastName: true } });
    if (!executor) return res.status(404).json({ error: 'Исполнитель не найден' });

    // Financial operations require 18+ (обе стороны; без даты рождения — нельзя).
    const ageErr = await checkDealParticipantsAge(meId, executorId);
    if (ageErr) return res.status(ageErr.status).json(ageErr.body);

    // Услуга исполнителя должна существовать и принадлежать ему (иначе FK → 500
    // или сделка со ссылкой на чужую услугу).
    let effServiceId: string | null = null;
    if (userServiceId) {
      const us = await prisma.userService.findUnique({ where: { id: String(userServiceId) }, select: { userId: true, serviceId: true } });
      if (!us || us.userId !== executorId) return res.status(400).json({ error: 'Услуга не найдена у исполнителя' });
      if (serviceId && serviceId !== us.serviceId) return res.status(400).json({ error: 'Услуга не соответствует разделу каталога' });
      effServiceId = us.serviceId;
    } else if (serviceId) {
      const svc = await prisma.service.findUnique({ where: { id: String(serviceId) }, select: { id: true } });
      if (!svc) return res.status(400).json({ error: 'Услуга не найдена' });
      effServiceId = svc.id;
    }

    let priceNum: number | null = null;
    if (price != null && price !== '') {
      priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Некорректная стоимость' });
    }

    const now = Date.now();
    const dt = dealType === 'event' ? 'event' : 'process';
    const data: any = {
      title: cleanTitle, customerId: meId, executorId,
      serviceId: effServiceId,
      userServiceId: userServiceId || null,
      price: priceNum,
      result: typeof result === 'string' && result.trim() ? result.trim().slice(0, 5000) : null,
      dealType: dt,
    };
    if (dt === 'event') {
      if (!eventDate) return res.status(400).json({ error: 'eventDate required for event deal' });
      const day = parseCalendarDay(eventDate);
      if (!day) return res.status(400).json({ error: 'Некорректная дата события' });
      const ev = endOfDayMsk(day);
      if (ev.getTime() < now) return res.status(400).json({ error: 'Дата события не может быть в прошлом' });
      data.eventDate = ev;
      if (deposit != null && deposit !== '') {
        const dep = Number(deposit);
        if (!Number.isFinite(dep) || dep < 0) return res.status(400).json({ error: 'Некорректный депозит' });
        if (priceNum != null && dep > priceNum) return res.status(400).json({ error: 'Депозит не может превышать стоимость' });
        data.deposit = dep;
      } else {
        data.deposit = null;
      }
    } else {
      let dl: Date | null = null;
      if (deadline) {
        const day = parseCalendarDay(deadline);
        if (!day) return res.status(400).json({ error: 'Некорректный срок сдачи' });
        dl = endOfDayMsk(day);
        if (dl.getTime() < now) return res.status(400).json({ error: 'Срок сдачи не может быть в прошлом' });
      }
      let adl: Date | null = null;
      if (acceptDeadline) {
        const day = parseCalendarDay(acceptDeadline);
        if (!day) return res.status(400).json({ error: 'Некорректный срок приёмки' });
        adl = endOfDayMsk(day);
        if (adl.getTime() < now) return res.status(400).json({ error: 'Срок приёмки не может быть в прошлом' });
        if (dl && adl.getTime() <= dl.getTime()) return res.status(400).json({ error: 'Срок приёмки должен быть позже срока сдачи' });
      }
      let rc = 3;
      if (revisionCount != null && revisionCount !== '') {
        rc = Number(revisionCount);
        if (!Number.isInteger(rc) || rc < 0 || rc > MAX_REVISIONS) {
          return res.status(400).json({ error: `Количество правок — целое число от 0 до ${MAX_REVISIONS}` });
        }
      }
      data.deadline = dl;
      data.acceptDeadline = adl;
      data.revisionCount = rc;
    }

    const deal = await prisma.deal.create({
      data,
      include: DEAL_INCLUDE,
    });

    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(executorId, meId, 'deal_created',
      `${me?.firstName} ${me?.lastName} создал(а) сделку`,
      `«${cleanTitle}». Ознакомьтесь с условиями и примите или отклоните.`,
      `/deals/${deal.id}`
    );
    tgEvent.deal('создана', `${me?.firstName} ${me?.lastName}`, `${executor.firstName} ${executor.lastName}`, cleanTitle, 'PENDING');

    res.status(201).json(deal);
  } catch (e: any) { return serverError(res, 'POST /', e); }
});

// Истёк ли срок, к которому привязана сделка (срок сдачи / дата события).
function dealDateExpired(deal: { dealType: string; deadline: Date | null; eventDate: Date | null }): boolean {
  const ref = deal.dealType === 'event' ? deal.eventDate : deal.deadline;
  return !!ref && ref.getTime() < Date.now();
}

// PATCH /api/deals/:id/accept — executor accepts → AWAITING_PAYMENT
router.patch('/:id/accept', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'PENDING') return res.status(400).json({ error: 'Invalid status' });
    if (dealDateExpired(deal)) {
      return res.status(409).json({ error: deal.dealType === 'event'
        ? 'Дата события уже прошла — отклоните сделку и договоритесь о новой'
        : 'Срок сдачи по сделке уже истёк — отклоните сделку и договоритесь о новом сроке' });
    }
    // Atomic transition: the status guard in WHERE prevents a concurrent
    // accept/reject/cancel from both committing (count===0 ⇒ already changed).
    const tr = await prisma.deal.updateMany({ where: { id: deal.id, status: 'PENDING' }, data: { status: 'AWAITING_PAYMENT' } });
    if (tr.count === 0) return res.status(409).json({ error: 'Статус сделки уже изменился' });
    const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: DEAL_INCLUDE });
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(deal.customerId, meId, 'deal_accepted',
      `${me?.firstName} ${me?.lastName} принял(а) сделку`,
      `«${deal.title}» ожидает оплаты.`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { return serverError(res, 'PATCH /:id/accept', e); }
});

// PATCH /api/deals/:id/reject — executor rejects → CANCELLED
router.patch('/:id/reject', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'PENDING') return res.status(400).json({ error: 'Invalid status' });
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';
    const tr = await prisma.deal.updateMany({ where: { id: deal.id, status: 'PENDING' }, data: { status: 'CANCELLED', cancelReason: reason || null } });
    if (tr.count === 0) return res.status(409).json({ error: 'Статус сделки уже изменился' });
    const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: DEAL_INCLUDE });
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(deal.customerId, meId, 'deal_rejected',
      `${me?.firstName} ${me?.lastName} отклонил(а) сделку`,
      `«${deal.title}» отклонена.`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { return serverError(res, 'PATCH /:id/reject', e); }
});

// PATCH /api/deals/:id/cancel — any party cancels (only before work is handed over)
router.patch('/:id/cancel', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal) return res.status(404).json({ error: 'Not found' });
    if (deal.customerId !== meId && deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (!CANCELLABLE_STATUSES.includes(deal.status)) {
      return res.status(400).json({ error: 'Сделку нельзя отменить на этом этапе' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';
    const tr = await prisma.deal.updateMany({ where: { id: deal.id, status: { in: CANCELLABLE_STATUSES } }, data: { status: 'CANCELLED', cancelReason: reason || null } });
    if (tr.count === 0) return res.status(409).json({ error: 'Статус сделки уже изменился' });
    const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: DEAL_INCLUDE });
    const otherId = meId === deal.customerId ? deal.executorId : deal.customerId;
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(otherId, meId, 'deal_cancelled',
      `${me?.firstName} ${me?.lastName} отменил(а) сделку`,
      `«${deal.title}» отменена.`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { return serverError(res, 'PATCH /:id/cancel', e); }
});

// PATCH /api/deals/:id/pay — customer pays → IN_PROGRESS (process) | AWAITING_EVENT (event)
router.patch('/:id/pay', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.customerId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'AWAITING_PAYMENT') return res.status(400).json({ error: 'Invalid status' });
    if (dealDateExpired(deal)) {
      return res.status(409).json({ error: deal.dealType === 'event'
        ? 'Дата события уже прошла — отмените сделку'
        : 'Срок сдачи уже истёк — сначала согласуйте новый срок через «Изменить условия»' });
    }
    const newStatus = deal.dealType === 'event' ? 'AWAITING_EVENT' : 'IN_PROGRESS';
    const tr = await prisma.deal.updateMany({ where: { id: deal.id, status: 'AWAITING_PAYMENT' }, data: { status: newStatus } });
    if (tr.count === 0) return res.status(409).json({ error: 'Статус сделки уже изменился' });
    const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: DEAL_INCLUDE });

    // Auto-create/find DM and set type='business' for both parties. Ищем личный
    // диалог именно этой пары, а не грузим все диалоги платформы.
    try {
      let conv = await prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: [
            { members: { some: { userId: meId } } },
            { members: { some: { userId: deal.executorId } } },
            { members: { every: { userId: { in: [meId, deal.executorId] } } } },
          ],
        },
        select: { id: true },
      });
      if (!conv) {
        conv = await prisma.conversation.create({
          data: { isGroup: false, members: { create: [{ userId: meId }, { userId: deal.executorId }] } },
          select: { id: true },
        });
      }
      await prisma.conversationMember.updateMany({
        where: { conversationId: conv.id },
        data: { type: 'business' },
      });
    } catch (e: any) {
      logger.warn(`[deals] pay: business chat setup failed for deal ${deal.id}: ${e?.message}`);
    }

    await notify(deal.executorId, meId, 'deal_paid',
      'Сделка оплачена!',
      `«${deal.title}» начата. Чат переведён в Деловые.`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { return serverError(res, 'PATCH /:id/pay', e); }
});

// PATCH /api/deals/:id/submit — executor submits work → REVIEW
router.patch('/:id/submit', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.dealType !== 'process') return res.status(400).json({ error: 'Only for process deals' });
    if (!['IN_PROGRESS', 'REVISION'].includes(deal.status)) return res.status(400).json({ error: 'Invalid status' });
    // Срок приёмки отсчитывается от момента сдачи: минимум ACCEPT_DAYS_DEFAULT
    // дней. Если согласованный срок позже — сохраняем его. Так REVIEW не висит
    // вечно (раньше acceptDeadline мог быть null), а сдача после старого срока
    // не автозавершается в ту же минуту.
    const minAccept = new Date(Date.now() + ACCEPT_DAYS_DEFAULT * DAY_MS);
    const acceptDeadline = deal.acceptDeadline && deal.acceptDeadline.getTime() > minAccept.getTime()
      ? deal.acceptDeadline
      : minAccept;
    const tr = await prisma.deal.updateMany({
      where: { id: deal.id, status: { in: ['IN_PROGRESS', 'REVISION'] } },
      data: { status: 'REVIEW', acceptDeadline },
    });
    if (tr.count === 0) return res.status(409).json({ error: 'Статус сделки уже изменился' });
    const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: DEAL_INCLUDE });
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(deal.customerId, meId, 'deal_submitted',
      `${me?.firstName} ${me?.lastName} сдал(а) работу`,
      `«${deal.title}» — примите или отправьте на доработку до ${acceptDeadline.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}.`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { return serverError(res, 'PATCH /:id/submit', e); }
});

// PATCH /api/deals/:id/approve — customer approves → COMPLETED + auto-connection
router.patch('/:id/approve', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.customerId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'REVIEW') return res.status(400).json({ error: 'Invalid status' });

    const tr = await prisma.deal.updateMany({ where: { id: deal.id, status: 'REVIEW' }, data: { status: 'COMPLETED' } });
    if (tr.count === 0) return res.status(409).json({ error: 'Статус сделки уже изменился' });
    const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: DEAL_INCLUDE });

    // Связь CUSTOMER ↔ EXECUTOR: без дублей, PENDING-заявка между ними принимается.
    await ensureDealConnection(meId, deal.executorId, deal.serviceId);

    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(deal.executorId, meId, 'deal_completed',
      'Сделка завершена!',
      `${me?.firstName} ${me?.lastName} принял(а) работу по «${deal.title}».`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { return serverError(res, 'PATCH /:id/approve', e); }
});

// PATCH /api/deals/:id/revision — customer requests revision → REVISION
router.patch('/:id/revision', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.customerId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'REVIEW') return res.status(400).json({ error: 'Invalid status' });
    if (deal.revisionsUsed >= deal.revisionCount) return res.status(400).json({ error: 'Revision limit reached' });
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 2000) : '';
    // Atomic: guard on both status and the revision limit, increment in-place so
    // two concurrent revision requests can't double-spend the revision budget.
    const tr = await prisma.deal.updateMany({
      where: { id: deal.id, status: 'REVIEW', revisionsUsed: { lt: deal.revisionCount } },
      data: { status: 'REVISION', revisionsUsed: { increment: 1 } },
    });
    if (tr.count === 0) return res.status(409).json({ error: 'Статус сделки уже изменился' });
    const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: DEAL_INCLUDE });
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(deal.executorId, meId, 'deal_revision',
      `${me?.firstName} ${me?.lastName} отправил(а) на доработку`,
      comment ? `«${deal.title}»: ${comment}` : `«${deal.title}» требует доработки.`,
      `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { return serverError(res, 'PATCH /:id/revision', e); }
});

type DealEditChanges = { deadline?: string | null; acceptDeadline?: string | null; revisionCount?: number };

/**
 * Валидация предлагаемых изменений условий относительно ТЕКУЩЕГО состояния
 * сделки. Возвращает текст ошибки или null. Используется и при создании
 * запроса, и повторно при его принятии (сделка могла измениться).
 */
function validateEditChanges(
  deal: { deadline: Date | null; acceptDeadline: Date | null; revisionsUsed: number },
  changes: DealEditChanges,
): { error: string } | { update: { deadline?: Date | null; acceptDeadline?: Date | null; revisionCount?: number } } {
  const now = Date.now();
  const update: { deadline?: Date | null; acceptDeadline?: Date | null; revisionCount?: number } = {};
  if (changes.deadline !== undefined) {
    if (changes.deadline === null || changes.deadline === '') {
      update.deadline = null;
    } else {
      const day = parseCalendarDay(changes.deadline);
      if (!day) return { error: 'Некорректный срок сдачи' };
      const d = endOfDayMsk(day);
      if (d.getTime() < now) return { error: 'Срок сдачи не может быть в прошлом' };
      update.deadline = d;
    }
  }
  if (changes.acceptDeadline !== undefined) {
    if (changes.acceptDeadline === null || changes.acceptDeadline === '') {
      update.acceptDeadline = null;
    } else {
      const day = parseCalendarDay(changes.acceptDeadline);
      if (!day) return { error: 'Некорректный срок приёмки' };
      const d = endOfDayMsk(day);
      if (d.getTime() < now) return { error: 'Срок приёмки не может быть в прошлом' };
      update.acceptDeadline = d;
    }
  }
  const effDeadline = update.deadline !== undefined ? update.deadline : deal.deadline;
  const effAccept = update.acceptDeadline !== undefined ? update.acceptDeadline : deal.acceptDeadline;
  if ((update.deadline !== undefined || update.acceptDeadline !== undefined)
    && effDeadline && effAccept && effAccept.getTime() <= effDeadline.getTime()) {
    return { error: 'Срок приёмки должен быть позже срока сдачи' };
  }
  if (changes.revisionCount !== undefined) {
    const rc = Number(changes.revisionCount);
    if (!Number.isInteger(rc) || rc < 0 || rc > MAX_REVISIONS) {
      return { error: `Количество правок — целое число от 0 до ${MAX_REVISIONS}` };
    }
    if (rc < deal.revisionsUsed) return { error: `Уже использовано правок: ${deal.revisionsUsed} — меньше указать нельзя` };
    update.revisionCount = rc;
  }
  return { update };
}

// POST /api/deals/:id/edit-request — propose changes
router.post('/:id/edit-request', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal) return res.status(404).json({ error: 'Not found' });
    if (deal.customerId !== meId && deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.dealType !== 'process' || !EDITABLE_STATUSES.includes(deal.status)) {
      return res.status(400).json({ error: 'Cannot edit in current status' });
    }
    const { deadline, acceptDeadline, revisionCount } = req.body;
    const changes: DealEditChanges = {};
    if (deadline !== undefined) changes.deadline = deadline;
    if (acceptDeadline !== undefined) changes.acceptDeadline = acceptDeadline;
    if (revisionCount !== undefined && revisionCount !== '') changes.revisionCount = Number(revisionCount);
    if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'No changes' });

    const v = validateEditChanges(deal, changes);
    if ('error' in v) return res.status(400).json({ error: v.error });
    // Храним нормализованные значения (конец дня по МСК), а не сырой ввод.
    const stored: Record<string, unknown> = {};
    if (v.update.deadline !== undefined) stored.deadline = v.update.deadline ? v.update.deadline.toISOString() : null;
    if (v.update.acceptDeadline !== undefined) stored.acceptDeadline = v.update.acceptDeadline ? v.update.acceptDeadline.toISOString() : null;
    if (v.update.revisionCount !== undefined) stored.revisionCount = v.update.revisionCount;

    // Один PENDING-запрос на сделку: проверка и создание под advisory-блокировкой.
    const request = await withAdvisoryLock(`deal-edit:${deal.id}`, async (tx) => {
      const pending = await tx.dealEditRequest.findFirst({ where: { dealId: deal.id, status: 'PENDING' }, select: { id: true } });
      if (pending) return null;
      return tx.dealEditRequest.create({ data: { dealId: deal.id, requesterId: meId, changes: stored as any } });
    });
    if (!request) return res.status(409).json({ error: 'Уже есть запрос на изменение условий, ожидающий ответа' });

    const otherId = meId === deal.customerId ? deal.executorId : deal.customerId;
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(otherId, meId, 'deal_edit_request',
      `${me?.firstName} ${me?.lastName} предлагает изменить условия сделки`,
      `Сделка «${deal.title}» — требует вашего согласования.`,
      `/deals/${deal.id}`
    );
    res.json(request);
  } catch (e: any) { return serverError(res, 'POST /:id/edit-request', e); }
});

// PATCH /api/deals/edit-request/:reqId/accept
router.patch('/edit-request/:reqId/accept', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const editReq = await prisma.dealEditRequest.findUnique({
      where: { id: req.params.reqId },
      include: { deal: true },
    });
    if (!editReq) return res.status(404).json({ error: 'Not found' });
    if (editReq.requesterId === meId) return res.status(400).json({ error: 'Cannot accept own request' });
    if (editReq.deal.customerId !== meId && editReq.deal.executorId !== meId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (editReq.status !== 'PENDING') return res.status(409).json({ error: 'Запрос уже обработан' });

    // Сделка завершена/отменена — запрос неактуален: закрываем его, чтобы он не
    // висел вечно и не блокировал новые запросы.
    if (!EDITABLE_STATUSES.includes(editReq.deal.status)) {
      await prisma.dealEditRequest.updateMany({ where: { id: editReq.id, status: 'PENDING' }, data: { status: 'REJECTED' } });
      return res.status(409).json({ error: 'Сделка уже на другом этапе — изменение условий неактуально' });
    }

    const v = validateEditChanges(editReq.deal, (editReq.changes ?? {}) as DealEditChanges);
    if ('error' in v) {
      // Битые/устаревшие значения (например, срок уже в прошлом) — запрос
      // отклоняется автоматически, иначе он навсегда блокировал бы кнопку.
      await prisma.dealEditRequest.updateMany({ where: { id: editReq.id, status: 'PENDING' }, data: { status: 'REJECTED' } });
      return res.status(409).json({ error: `Изменение нельзя применить: ${v.error}. Запрос закрыт — отправьте новый.` });
    }

    // Атомарно: запрос PENDING→APPROVED и сделка в допустимом статусе.
    const applied = await prisma.$transaction(async (tx) => {
      const r = await tx.dealEditRequest.updateMany({ where: { id: editReq.id, status: 'PENDING' }, data: { status: 'APPROVED' } });
      if (r.count !== 1) return false;
      const d = await tx.deal.updateMany({
        where: { id: editReq.dealId, status: { in: EDITABLE_STATUSES }, revisionsUsed: { lte: v.update.revisionCount ?? MAX_REVISIONS } },
        data: v.update,
      });
      if (d.count !== 1) throw new Error('DEAL_STATE_CHANGED');
      return true;
    }).catch((err: any) => {
      if (err?.message === 'DEAL_STATE_CHANGED') return 'changed' as const;
      throw err;
    });
    if (applied === false) return res.status(409).json({ error: 'Запрос уже обработан' });
    if (applied === 'changed') return res.status(409).json({ error: 'Статус сделки уже изменился' });

    await notify(editReq.requesterId, meId, 'deal_edit_accepted',
      'Изменения условий приняты',
      `Сделка «${editReq.deal.title}» — обновлена.`,
      `/deals/${editReq.dealId}`
    );
    res.json({ ok: true });
  } catch (e: any) { return serverError(res, 'PATCH /edit-request/:reqId/accept', e); }
});

// PATCH /api/deals/edit-request/:reqId/reject
router.patch('/edit-request/:reqId/reject', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const editReq = await prisma.dealEditRequest.findUnique({
      where: { id: req.params.reqId },
      include: { deal: true },
    });
    if (!editReq) return res.status(404).json({ error: 'Not found' });
    if (editReq.requesterId === meId) return res.status(400).json({ error: 'Cannot reject own request' });
    if (editReq.deal.customerId !== meId && editReq.deal.executorId !== meId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const tr = await prisma.dealEditRequest.updateMany({ where: { id: editReq.id, status: 'PENDING' }, data: { status: 'REJECTED' } });
    if (tr.count === 0) return res.status(409).json({ error: 'Запрос уже обработан' });
    await notify(editReq.requesterId, meId, 'deal_edit_rejected',
      'Изменения условий отклонены',
      `Сделка «${editReq.deal.title}»`, `/deals/${editReq.dealId}`
    );
    res.json({ ok: true });
  } catch (e: any) { return serverError(res, 'PATCH /edit-request/:reqId/reject', e); }
});

// PATCH /api/deals/:id/confirm — customer confirms event happened → COMPLETED (Type B only)
router.patch('/:id/confirm', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.customerId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.dealType !== 'event') return res.status(400).json({ error: 'Only for event deals' });
    if (!['AWAITING_EVENT', 'AWAITING_CONFIRMATION'].includes(deal.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Атомарно: двойной клик/гонка с планировщиком не дадут двух уведомлений.
    const tr = await prisma.deal.updateMany({
      where: { id: deal.id, status: { in: ['AWAITING_EVENT', 'AWAITING_CONFIRMATION'] } },
      data: { status: 'COMPLETED' },
    });
    if (tr.count === 0) return res.status(409).json({ error: 'Статус сделки уже изменился' });
    const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: DEAL_INCLUDE });

    await ensureDealConnection(meId, deal.executorId, deal.serviceId);

    await notify(deal.executorId, meId, 'deal_completed',
      'Услуга подтверждена',
      `Заказчик подтвердил оказание услуги «${deal.title}»`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { return serverError(res, 'PATCH /:id/confirm', e); }
});

export default router;
