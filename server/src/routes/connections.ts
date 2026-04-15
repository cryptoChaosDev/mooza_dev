import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const USER_SELECT = {
  id: true, firstName: true, lastName: true, avatar: true,
  role: true, city: true, isPremium: true, isVerified: true,
};

function formatConnection(conn: any, meId: string) {
  return {
    id: conn.id,
    status: conn.status,
    breakRequestedBy: conn.breakRequestedBy,
    services: conn.services?.map((cs: any) => cs.service) ?? [],
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
    requester: conn.requester,
    receiver: conn.receiver,
    partner: conn.requesterId === meId ? conn.receiver : conn.requester,
    iAmRequester: conn.requesterId === meId,
  };
}

const CONN_INCLUDE = {
  services: { include: { service: { select: { id: true, name: true } } } },
  requester: { select: USER_SELECT },
  receiver:  { select: USER_SELECT },
};

// ── POST /api/connections ─────────────────────────────────────────────────────
// Send a connection request
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { receiverId, serviceIds } = req.body as { receiverId: string; serviceIds: string[] };

    if (!receiverId || !serviceIds?.length) {
      return res.status(400).json({ error: 'receiverId и serviceIds обязательны' });
    }
    if (receiverId === meId) {
      return res.status(400).json({ error: 'Нельзя создать связь с собой' });
    }

    const existing = await prisma.connection.findFirst({
      where: {
        OR: [
          { requesterId: meId, receiverId },
          { requesterId: receiverId, receiverId: meId },
        ],
      },
    });
    if (existing) {
      return res.status(409).json({ error: 'Связь уже существует', connection: existing });
    }

    const conn = await prisma.connection.create({
      data: {
        requesterId: meId,
        receiverId,
        services: { create: serviceIds.map((sid: string) => ({ serviceId: sid })) },
      },
      include: CONN_INCLUDE,
    });

    // Notification for receiver
    try {
      const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
      await prisma.notification.create({
        data: {
          userId: receiverId,
          actorId: meId,
          type: 'connection_request',
          title: `${me?.firstName} ${me?.lastName} запрашивает связь`,
          body: `По услугам: ${conn.services.map((cs: any) => cs.service.name).join(', ')}`,
          link: `/friends?tab=connections`,
        },
      });
    } catch {}

    return res.status(201).json(formatConnection(conn, meId));
  } catch (err) {
    console.error('[connections] POST /', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/connections ──────────────────────────────────────────────────────
// My accepted connections
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conns = await prisma.connection.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: meId }, { receiverId: meId }],
      },
      include: CONN_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(conns.map(c => formatConnection(c, meId)));
  } catch (err) {
    console.error('[connections] GET /', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/connections/requests ─────────────────────────────────────────────
// Incoming pending requests to me
router.get('/requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conns = await prisma.connection.findMany({
      where: { receiverId: meId, status: 'PENDING' },
      include: CONN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return res.json(conns.map(c => formatConnection(c, meId)));
  } catch (err) {
    console.error('[connections] GET /requests', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/connections/sent ─────────────────────────────────────────────────
// My outgoing pending requests
router.get('/sent', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conns = await prisma.connection.findMany({
      where: { requesterId: meId, status: 'PENDING' },
      include: CONN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return res.json(conns.map(c => formatConnection(c, meId)));
  } catch (err) {
    console.error('[connections] GET /sent', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/connections/break-requests ──────────────────────────────────────
// Connections where the other party requested a break (awaiting my confirmation)
router.get('/break-requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conns = await prisma.connection.findMany({
      where: {
        status: 'BREAK_REQUESTED',
        OR: [{ requesterId: meId }, { receiverId: meId }],
        NOT: { breakRequestedBy: meId },
      },
      include: CONN_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(conns.map(c => formatConnection(c, meId)));
  } catch (err) {
    console.error('[connections] GET /break-requests', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/connections/with/:userId ─────────────────────────────────────────
// Get connection status with a specific user
router.get('/with/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const otherId = req.params.userId;
    const conn = await prisma.connection.findFirst({
      where: {
        OR: [
          { requesterId: meId, receiverId: otherId },
          { requesterId: otherId, receiverId: meId },
        ],
      },
      include: CONN_INCLUDE,
    });
    if (!conn) return res.json(null);
    return res.json(formatConnection(conn, meId));
  } catch (err) {
    console.error('[connections] GET /with/:userId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/connections/:id/accept ────────────────────────────────────────
router.patch('/:id/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conn = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Не найдено' });
    if (conn.receiverId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (conn.status !== 'PENDING') return res.status(400).json({ error: 'Неверный статус' });

    const updated = await prisma.connection.update({
      where: { id: conn.id },
      data: { status: 'ACCEPTED' },
      include: CONN_INCLUDE,
    });

    // Notify requester
    try {
      const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
      await prisma.notification.create({
        data: {
          userId: conn.requesterId,
          actorId: meId,
          type: 'connection_accepted',
          title: `${me?.firstName} ${me?.lastName} принял(а) связь`,
          body: '',
          link: `/friends?tab=connections`,
        },
      });
    } catch {}

    return res.json(formatConnection(updated, meId));
  } catch (err) {
    console.error('[connections] PATCH /:id/accept', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/connections/:id/reject ────────────────────────────────────────
router.patch('/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conn = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Не найдено' });
    if (conn.receiverId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (conn.status !== 'PENDING') return res.status(400).json({ error: 'Неверный статус' });

    await prisma.connection.delete({ where: { id: conn.id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[connections] PATCH /:id/reject', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/connections/:id ───────────────────────────────────────────────
// Cancel own pending request
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conn = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Не найдено' });
    if (conn.requesterId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (conn.status !== 'PENDING') return res.status(400).json({ error: 'Можно отменить только PENDING запрос' });

    await prisma.connection.delete({ where: { id: conn.id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[connections] DELETE /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/connections/:id/break ─────────────────────────────────────────
// Request to dissolve an accepted connection
router.patch('/:id/break', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conn = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Не найдено' });
    if (conn.requesterId !== meId && conn.receiverId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (conn.status !== 'ACCEPTED') return res.status(400).json({ error: 'Связь не активна' });

    const updated = await prisma.connection.update({
      where: { id: conn.id },
      data: { status: 'BREAK_REQUESTED', breakRequestedBy: meId },
      include: CONN_INCLUDE,
    });

    // Notify the other party
    const otherId = conn.requesterId === meId ? conn.receiverId : conn.requesterId;
    try {
      const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
      await prisma.notification.create({
        data: {
          userId: otherId,
          actorId: meId,
          type: 'connection_break',
          title: `${me?.firstName} ${me?.lastName} запрашивает разрыв связи`,
          body: 'Подтвердите или отклоните запрос',
          link: `/friends?tab=connections`,
        },
      });
    } catch {}

    return res.json(formatConnection(updated, meId));
  } catch (err) {
    console.error('[connections] PATCH /:id/break', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/connections/:id/confirm-break ──────────────────────────────────
// Other party confirms the break → delete connection
router.patch('/:id/confirm-break', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conn = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Не найдено' });
    if (conn.requesterId !== meId && conn.receiverId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (conn.status !== 'BREAK_REQUESTED') return res.status(400).json({ error: 'Запрос разрыва не найден' });
    if (conn.breakRequestedBy === meId) return res.status(400).json({ error: 'Вы сами запросили разрыв' });

    await prisma.connection.delete({ where: { id: conn.id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[connections] PATCH /:id/confirm-break', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/connections/:id/cancel-break ───────────────────────────────────
// The requester cancels their break request → back to ACCEPTED
router.patch('/:id/cancel-break', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conn = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Не найдено' });
    if (conn.breakRequestedBy !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (conn.status !== 'BREAK_REQUESTED') return res.status(400).json({ error: 'Неверный статус' });

    const updated = await prisma.connection.update({
      where: { id: conn.id },
      data: { status: 'ACCEPTED', breakRequestedBy: null },
      include: CONN_INCLUDE,
    });
    return res.json(formatConnection(updated, meId));
  } catch (err) {
    console.error('[connections] PATCH /:id/cancel-break', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
