import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitToUser } from '../socket';
import { tgEvent } from '../utils/telegram';

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

async function notify(userId: string, actorId: string | null, type: string, title: string, body: string, link: string) {
  try {
    const data: any = { userId, type, title, body, link };
    if (actorId) data.actorId = actorId;
    const notif = await prisma.notification.create({ data });
    emitToUser(userId, 'new_notification', notif);
  } catch {}
}

// GET /api/deals — my deals (customer + executor)
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { role, status } = req.query as { role?: string; status?: string };
    const where: any = { OR: [{ customerId: meId }, { executorId: meId }] };
    if (role === 'customer') where.OR = undefined, where.customerId = meId;
    if (role === 'executor') where.OR = undefined, where.executorId = meId;
    if (status) where.status = status;
    const deals = await prisma.deal.findMany({ where, include: DEAL_INCLUDE, orderBy: { updatedAt: 'desc' } });
    res.json(deals);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/deals/:id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id }, include: DEAL_INCLUDE });
    if (!deal) return res.status(404).json({ error: 'Not found' });
    if (deal.customerId !== meId && deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    res.json(deal);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/deals — create deal (customer)
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { title, executorId, serviceId, userServiceId, price, deadline, acceptDeadline, revisionCount, result, dealType, eventDate, deposit } = req.body;
    if (!executorId || !title) return res.status(400).json({ error: 'executorId and title required' });
    if (executorId === meId) return res.status(400).json({ error: 'Cannot create deal with yourself' });

    const dt = dealType === 'event' ? 'event' : 'process';
    if (dt === 'event' && !eventDate) return res.status(400).json({ error: 'eventDate required for event deal' });

    const data: any = {
      title, customerId: meId, executorId,
      serviceId: serviceId || null,
      userServiceId: userServiceId || null,
      price: price != null ? Number(price) : null,
      result: result || null,
      dealType: dt,
    };
    if (dt === 'event') {
      data.eventDate = new Date(eventDate);
      data.deposit = deposit != null ? Number(deposit) : null;
    } else {
      data.deadline = deadline ? new Date(deadline) : null;
      data.acceptDeadline = acceptDeadline ? new Date(acceptDeadline) : null;
      data.revisionCount = revisionCount != null ? Number(revisionCount) : 3;
    }

    const deal = await prisma.deal.create({
      data,
      include: DEAL_INCLUDE,
    });

    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    const ex = await prisma.user.findUnique({ where: { id: executorId }, select: { firstName: true, lastName: true } });
    await notify(executorId, meId, 'deal_created',
      `${me?.firstName} ${me?.lastName} создал(а) сделку`,
      `«${title}». Ознакомьтесь с условиями и примите или отклоните.`,
      `/deals/${deal.id}`
    );
    tgEvent.deal('создана', `${me?.firstName} ${me?.lastName}`, `${ex?.firstName} ${ex?.lastName}`, title, 'PENDING');

    res.status(201).json(deal);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/deals/:id/accept — executor accepts → AWAITING_PAYMENT
router.patch('/:id/accept', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'PENDING') return res.status(400).json({ error: 'Invalid status' });
    const updated = await prisma.deal.update({ where: { id: deal.id }, data: { status: 'AWAITING_PAYMENT' }, include: DEAL_INCLUDE });
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(deal.customerId, meId, 'deal_accepted',
      `${me?.firstName} ${me?.lastName} принял(а) сделку`,
      `«${deal.title}» ожидает оплаты.`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/deals/:id/reject — executor rejects → CANCELLED
router.patch('/:id/reject', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'PENDING') return res.status(400).json({ error: 'Invalid status' });
    const { reason } = req.body;
    const updated = await prisma.deal.update({ where: { id: deal.id }, data: { status: 'CANCELLED', cancelReason: reason || null }, include: DEAL_INCLUDE });
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(deal.customerId, meId, 'deal_rejected',
      `${me?.firstName} ${me?.lastName} отклонил(а) сделку`,
      `«${deal.title}» отклонена.`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/deals/:id/cancel — any party cancels
router.patch('/:id/cancel', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal) return res.status(404).json({ error: 'Not found' });
    if (deal.customerId !== meId && deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (['COMPLETED', 'CANCELLED'].includes(deal.status)) return res.status(400).json({ error: 'Cannot cancel' });
    const { reason } = req.body;
    const updated = await prisma.deal.update({ where: { id: deal.id }, data: { status: 'CANCELLED', cancelReason: reason || null }, include: DEAL_INCLUDE });
    const otherId = meId === deal.customerId ? deal.executorId : deal.customerId;
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(otherId, meId, 'deal_cancelled',
      `${me?.firstName} ${me?.lastName} отменил(а) сделку`,
      `«${deal.title}» отменена.`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/deals/:id/pay — customer pays → IN_PROGRESS (process) | AWAITING_EVENT (event)
router.patch('/:id/pay', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.customerId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'AWAITING_PAYMENT') return res.status(400).json({ error: 'Invalid status' });
    const newStatus = deal.dealType === 'event' ? 'AWAITING_EVENT' : 'IN_PROGRESS';
    const updated = await prisma.deal.update({ where: { id: deal.id }, data: { status: newStatus }, include: DEAL_INCLUDE });

    // Auto-create/find DM and set type='business' for both parties
    try {
      const all = await prisma.conversation.findMany({
        where: { isGroup: false },
        include: { members: true },
      });
      let conv = all.find((c: any) => {
        const ids = c.members.map((m: any) => m.userId);
        return ids.includes(meId) && ids.includes(deal.executorId) && ids.length === 2;
      });
      if (!conv) {
        conv = await prisma.conversation.create({
          data: { isGroup: false, members: { create: [{ userId: meId }, { userId: deal.executorId }] } },
          include: { members: true },
        });
      }
      await prisma.conversationMember.updateMany({
        where: { conversationId: conv.id },
        data: { type: 'business' },
      });
    } catch {}

    await notify(deal.executorId, meId, 'deal_paid',
      'Сделка оплачена!',
      `«${deal.title}» начата. Чат переведён в Деловые.`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/deals/:id/submit — executor submits work → REVIEW
router.patch('/:id/submit', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (!['IN_PROGRESS', 'REVISION'].includes(deal.status)) return res.status(400).json({ error: 'Invalid status' });
    const updated = await prisma.deal.update({ where: { id: deal.id }, data: { status: 'REVIEW' }, include: DEAL_INCLUDE });
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(deal.customerId, meId, 'deal_submitted',
      `${me?.firstName} ${me?.lastName} сдал(а) работу`,
      `«${deal.title}» — примите или отправьте на доработку.`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/deals/:id/approve — customer approves → COMPLETED + auto-connection
router.patch('/:id/approve', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.customerId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'REVIEW') return res.status(400).json({ error: 'Invalid status' });

    const updated = await prisma.deal.update({ where: { id: deal.id }, data: { status: 'COMPLETED' }, include: DEAL_INCLUDE });

    // Auto-create connection (CUSTOMER ↔ EXECUTOR) if doesn't exist
    const existing = await prisma.connection.findFirst({
      where: { status: 'ACCEPTED', OR: [
        { requesterId: meId, receiverId: deal.executorId },
        { requesterId: deal.executorId, receiverId: meId },
      ]},
    });
    if (!existing) {
      await prisma.connection.create({
        data: {
          requesterId: meId, receiverId: deal.executorId,
          status: 'ACCEPTED',
          requesterRole: 'CUSTOMER', receiverRole: 'EXECUTOR',
          services: deal.serviceId ? { create: [{ serviceId: deal.serviceId }] } : undefined,
        },
      });
    }

    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(deal.executorId, meId, 'deal_completed',
      'Сделка завершена!',
      `${me?.firstName} ${me?.lastName} принял(а) работу по «${deal.title}».`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/deals/:id/revision — customer requests revision → REVISION
router.patch('/:id/revision', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || deal.customerId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'REVIEW') return res.status(400).json({ error: 'Invalid status' });
    if (deal.revisionsUsed >= deal.revisionCount) return res.status(400).json({ error: 'Revision limit reached' });
    const { comment } = req.body;
    const updated = await prisma.deal.update({
      where: { id: deal.id },
      data: { status: 'REVISION', revisionsUsed: deal.revisionsUsed + 1 },
      include: DEAL_INCLUDE,
    });
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(deal.executorId, meId, 'deal_revision',
      `${me?.firstName} ${me?.lastName} отправил(а) на доработку`,
      comment ? `«${deal.title}»: ${comment}` : `«${deal.title}» требует доработки.`,
      `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/deals/:id/edit-request — propose changes
router.post('/:id/edit-request', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal) return res.status(404).json({ error: 'Not found' });
    if (deal.customerId !== meId && deal.executorId !== meId) return res.status(403).json({ error: 'Forbidden' });
    if (['PENDING', 'COMPLETED', 'CANCELLED'].includes(deal.status)) {
      return res.status(400).json({ error: 'Cannot edit in current status' });
    }
    const { deadline, acceptDeadline, revisionCount } = req.body;
    const changes: any = {};
    if (deadline !== undefined) changes.deadline = deadline;
    if (acceptDeadline !== undefined) changes.acceptDeadline = acceptDeadline;
    if (revisionCount !== undefined) changes.revisionCount = revisionCount;
    if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'No changes' });

    const request = await prisma.dealEditRequest.create({
      data: { dealId: deal.id, requesterId: meId, changes },
    });

    const otherId = meId === deal.customerId ? deal.executorId : deal.customerId;
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
    await notify(otherId, meId, 'deal_edit_request',
      `${me?.firstName} ${me?.lastName} предлагает изменить условия сделки`,
      `Сделка «${deal.title}» — требует вашего согласования.`,
      `/deals/${deal.id}`
    );
    res.json(request);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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
    if (editReq.status !== 'PENDING') return res.status(400).json({ error: 'Already processed' });

    const changes = editReq.changes as any;
    const dealUpdate: any = {};
    if (changes.deadline !== undefined) dealUpdate.deadline = changes.deadline ? new Date(changes.deadline) : null;
    if (changes.acceptDeadline !== undefined) dealUpdate.acceptDeadline = changes.acceptDeadline ? new Date(changes.acceptDeadline) : null;
    if (changes.revisionCount !== undefined) dealUpdate.revisionCount = Number(changes.revisionCount);

    await prisma.$transaction([
      prisma.deal.update({ where: { id: editReq.dealId }, data: dealUpdate }),
      prisma.dealEditRequest.update({ where: { id: editReq.id }, data: { status: 'APPROVED' } }),
    ]);

    await notify(editReq.requesterId, meId, 'deal_edit_accepted',
      'Изменения условий приняты',
      `Сделка «${editReq.deal.title}» — обновлена.`,
      `/deals/${editReq.dealId}`
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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
    await prisma.dealEditRequest.update({ where: { id: editReq.id }, data: { status: 'REJECTED' } });
    await notify(editReq.requesterId, meId, 'deal_edit_rejected',
      'Изменения условий отклонены',
      `Сделка «${editReq.deal.title}»`, `/deals/${editReq.dealId}`
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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

    const updated = await prisma.deal.update({
      where: { id: deal.id },
      data: { status: 'COMPLETED' },
      include: DEAL_INCLUDE,
    });

    // Auto-create connection if doesn't exist
    const existing = await prisma.connection.findFirst({
      where: { status: 'ACCEPTED', OR: [
        { requesterId: meId, receiverId: deal.executorId },
        { requesterId: deal.executorId, receiverId: meId },
      ]},
    });
    if (!existing) {
      await prisma.connection.create({
        data: {
          requesterId: meId, receiverId: deal.executorId,
          status: 'ACCEPTED',
          requesterRole: 'CUSTOMER', receiverRole: 'EXECUTOR',
        },
      });
    }

    await notify(deal.executorId, meId, 'deal_completed',
      'Услуга подтверждена',
      `Заказчик подтвердил оказание услуги «${deal.title}»`, `/deals/${deal.id}`
    );
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
