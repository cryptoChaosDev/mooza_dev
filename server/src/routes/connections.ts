import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { tgEvent } from '../utils/telegram';
import { emitToUser } from '../socket';
import { notify } from '../utils/notify';

const router = Router();

const USER_SELECT = {
  id: true, firstName: true, lastName: true, avatar: true,
  role: true, city: true, isPremium: true, isVerified: true,
};

// Повторный запрос тому, кто отклонил предыдущий, — не раньше чем через 7 дней
const REJECT_COOLDOWN_DAYS = 7;
const MAX_SERVICES_PER_CONNECTION = 50;

function formatConnection(conn: any, meId: string) {
  const iAmRequester = conn.requesterId === meId;
  return {
    id: conn.id,
    status: conn.status,
    breakRequestedBy: conn.breakRequestedBy,
    breakReasonRequester: conn.breakReasonRequester ?? null,
    breakReasonReceiver: conn.breakReasonReceiver ?? null,
    services: conn.services?.map((cs: any) => cs.service) ?? [],
    profession: conn.profession ?? null,
    requesterRole: conn.requesterRole ?? null,
    receiverRole: conn.receiverRole ?? null,
    needsDeal: conn.needsDeal ?? false,
    myRole: iAmRequester ? (conn.requesterRole ?? null) : (conn.receiverRole ?? null),
    partnerRole: iAmRequester ? (conn.receiverRole ?? null) : (conn.requesterRole ?? null),
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
    requester: conn.requester,
    receiver: conn.receiver,
    partner: iAmRequester ? conn.receiver : conn.requester,
    iAmRequester,
  };
}

const CONN_INCLUDE = {
  services: { include: { service: { select: { id: true, name: true } } } },
  requester:  { select: USER_SELECT },
  receiver:   { select: USER_SELECT },
  profession: { select: { id: true, name: true } },
};

/** Ответ на гонку: статус связи изменился между проверкой и записью. */
function conflict(res: Response) {
  return res.status(409).json({ error: 'Статус связи уже изменился — обновите страницу' });
}

/**
 * serviceIds из тела: массив строк без дублей, все услуги существуют.
 * Возвращает null при некорректных данных (→ 400, а не 500 от FK/PK).
 */
async function validateServiceIds(raw: unknown): Promise<string[] | null> {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.some((x) => typeof x !== 'string' || !x)) return null;
  const ids = [...new Set(raw as string[])];
  if (ids.length > MAX_SERVICES_PER_CONNECTION) return null;
  if (ids.length === 0) return [];
  const found = await prisma.service.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) return null;
  return ids;
}

async function userName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
}

// ── POST /api/connections ─────────────────────────────────────────────────────
// Send a connection request
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { receiverId, requesterRole, receiverRole, needsDeal } =
      req.body as { receiverId: string; serviceIds: string[]; requesterRole?: string; receiverRole?: string; needsDeal?: boolean };

    if (!receiverId || typeof receiverId !== 'string') {
      return res.status(400).json({ error: 'receiverId обязателен' });
    }
    if (receiverId === meId) {
      return res.status(400).json({ error: 'Нельзя создать связь с собой' });
    }

    const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { isBlocked: true } });
    if (!receiver) return res.status(404).json({ error: 'Пользователь не найден' });
    if (receiver.isBlocked) return res.status(403).json({ error: 'Пользователь заблокирован' });

    const serviceIds = await validateServiceIds(req.body?.serviceIds);
    if (!serviceIds) return res.status(400).json({ error: 'Некорректный список услуг' });

    // Кулдаун после отказа: нельзя засыпать человека повторными запросами.
    const cooldownFrom = new Date(Date.now() - REJECT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const recentReject = await prisma.connection.findFirst({
      where: { requesterId: meId, receiverId, status: 'REJECTED', updatedAt: { gt: cooldownFrom } },
      select: { id: true, updatedAt: true },
    });
    if (recentReject) {
      const until = new Date(recentReject.updatedAt.getTime() + REJECT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
      const days = Math.max(1, Math.ceil((until.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      return res.status(429).json({
        error: `Пользователь отклонил ваш предыдущий запрос. Повторить можно через ${days} дн.`,
        retryAfter: until.toISOString(),
      });
    }

    // Multiple pending connection requests to the same person are allowed (they
    // are aggregated per-user in the UI). Block only an EXACT duplicate from me —
    // same roles AND the same set of services — to avoid accidental double-submits.
    const myPending = await prisma.connection.findMany({
      where: { status: 'PENDING', requesterId: meId, receiverId },
      include: { services: { select: { serviceId: true } } },
    });
    const newServiceSet = new Set(serviceIds);
    const exactDup = myPending.find(c => {
      const existSet = new Set(c.services.map(s => s.serviceId));
      const sameServices = existSet.size === newServiceSet.size && [...newServiceSet].every(id => existSet.has(id));
      return sameServices
        && (c.requesterRole ?? null) === (requesterRole ?? null)
        && (c.receiverRole ?? null) === (receiverRole ?? null);
    });
    if (exactDup) {
      return res.status(409).json({ error: 'Такой запрос уже отправлен', connectionId: exactDup.id });
    }

    const conn = await prisma.connection.create({
      data: {
        requesterId: meId,
        receiverId,
        requesterRole: requesterRole ?? null,
        receiverRole: receiverRole ?? null,
        needsDeal: needsDeal ?? false,
        services: { create: serviceIds.map((sid: string) => ({ serviceId: sid })) },
      },
      include: CONN_INCLUDE,
    });

    // Notification for receiver: запись + new_notification + push (с link) через
    // notify() — он же учитывает настройки уведомлений. Событие для живого
    // обновления списков — один раз.
    const serviceNames = conn.services.map((cs: any) => cs.service.name).join(', ');
    try {
      const myName = await userName(meId);
      await notify({
        userId: receiverId,
        actorId: meId,
        type: 'connection_request',
        title: `${myName} запрашивает связь`,
        body: serviceNames ? `По услугам: ${serviceNames}` : 'Новый запрос на связь',
        link: `/connections/requests`,
      });
      emitToUser(receiverId, 'connection_request', { connId: conn.id });
    } catch {}

    // В лог команды — без ФИО (ПДн), названия услуг из каталога экранируются.
    try { tgEvent.connectionRequest(serviceNames); } catch {}
    return res.status(201).json(formatConnection(conn, meId));
  } catch (err) {
    console.error('[connections] POST /', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/connections/all ──────────────────────────────────────────────────
// All my connections regardless of status, ordered by most recent
router.get('/all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conns = await prisma.connection.findMany({
      where: { OR: [{ requesterId: meId }, { receiverId: meId }] },
      include: CONN_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(conns.map(c => formatConnection(c, meId)));
  } catch (err) {
    console.error('[connections] GET /all', err);
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

// ── GET /api/connections/user/:userId ─────────────────────────────────────────
// Get accepted connections for any user (public)
router.get('/user/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const targetId = req.params.userId;
    const conns = await prisma.connection.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: targetId }, { receiverId: targetId }],
      },
      include: CONN_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(conns.map(c => formatConnection(c, targetId)));
  } catch (err) {
    console.error('[connections] GET /user/:userId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/connections/with/:userId ─────────────────────────────────────────
// Get the most recent connection with a specific user (any status)
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
      orderBy: { createdAt: 'desc' },
    });
    if (!conn) return res.json(null);
    return res.json(formatConnection(conn, meId));
  } catch (err) {
    console.error('[connections] GET /with/:userId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/connections/rejected ─────────────────────────────────────────────
// My outgoing requests that were rejected
router.get('/rejected', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conns = await prisma.connection.findMany({
      where: { requesterId: meId, status: 'REJECTED' },
      include: CONN_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(conns.map(c => formatConnection(c, meId)));
  } catch (err) {
    console.error('[connections] GET /rejected', err);
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

    // Условная запись: двойной тап / параллельный reject не перезапишут друг друга
    const r = await prisma.connection.updateMany({
      where: { id: conn.id, receiverId: meId, status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });
    if (r.count === 0) return conflict(res);
    const updated = await prisma.connection.findUnique({ where: { id: conn.id }, include: CONN_INCLUDE });

    // Notify requester (запись + сокет + push — через notify, с учётом настроек)
    try {
      const myName = await userName(meId);
      await notify({
        userId: conn.requesterId,
        actorId: meId,
        type: 'connection_accepted',
        title: `${myName} принял(а) связь`,
        body: '',
        link: `/friends?tab=connections`,
      });
      emitToUser(conn.requesterId, 'connection_updated', { connId: conn.id, status: 'ACCEPTED' });
      tgEvent.connectionAccept();
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

    const r = await prisma.connection.updateMany({
      where: { id: conn.id, receiverId: meId, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    if (r.count === 0) return conflict(res);

    // Notify requester
    try {
      const myName = await userName(meId);
      await notify({
        userId: conn.requesterId,
        actorId: meId,
        type: 'connection_rejected',
        title: `${myName} отклонил(а) запрос на связь`,
        body: '',
        link: `/friends?tab=connections`,
      });
      emitToUser(conn.requesterId, 'connection_rejected', { connId: conn.id });
    } catch {}

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

    // Условное удаление: запрос, который успели принять, не исчезнет молча
    const r = await prisma.connection.deleteMany({ where: { id: conn.id, requesterId: meId, status: 'PENDING' } });
    if (r.count === 0) return conflict(res);
    emitToUser(conn.receiverId, 'connection_updated', { connId: conn.id, status: 'CANCELLED' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[connections] DELETE /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/connections/my-break-requests ───────────────────────────────────
// Connections where I requested the break (awaiting partner's confirmation)
router.get('/my-break-requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const conns = await prisma.connection.findMany({
      where: { status: 'BREAK_REQUESTED', breakRequestedBy: meId },
      include: CONN_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(conns.map(c => formatConnection(c, meId)));
  } catch (err) {
    console.error('[connections] GET /my-break-requests', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/connections/history ─────────────────────────────────────────────
router.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const history = await prisma.connectionHistory.findMany({
      where: { OR: [{ requesterId: meId }, { receiverId: meId }] },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true } },
        receiver:  { select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true } },
      },
      orderBy: { endedAt: 'desc' },
    });

    // Enrich with profession names (professionId stored as plain string, no relation)
    const professionIds = [...new Set(history.map(h => h.professionId).filter(Boolean))] as string[];
    const professions = professionIds.length
      ? await prisma.profession.findMany({ where: { id: { in: professionIds } }, select: { id: true, name: true } })
      : [];
    const profMap = Object.fromEntries(professions.map(p => [p.id, p]));
    return res.json(history.map(h => ({
      ...h,
      partner: h.requesterId === meId ? h.receiver : h.requester,
      iAmRequester: h.requesterId === meId,
      iInitiatedBreak: h.breakInitiatorId === meId,
      profession: h.professionId ? (profMap[h.professionId] ?? null) : null,
    })));
  } catch (err) {
    console.error('[connections] GET /history', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/connections/:id/break ─────────────────────────────────────────
// Request to dissolve an accepted connection (requires reason)
router.patch('/:id/break', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { reason } = req.body as { reason?: string };
    if (typeof reason !== 'string' || !reason.trim()) return res.status(400).json({ error: 'Укажите причину разрыва связи' });

    const conn = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Не найдено' });
    if (conn.requesterId !== meId && conn.receiverId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (conn.status !== 'ACCEPTED') return res.status(400).json({ error: 'Связь не активна' });

    const r = await prisma.connection.updateMany({
      where: { id: conn.id, status: 'ACCEPTED' },
      data: { status: 'BREAK_REQUESTED', breakRequestedBy: meId, breakReasonRequester: reason.trim() },
    });
    if (r.count === 0) return conflict(res);
    const updated = await prisma.connection.findUnique({ where: { id: conn.id }, include: CONN_INCLUDE });

    const otherId = conn.requesterId === meId ? conn.receiverId : conn.requesterId;
    try {
      const myName = await userName(meId);
      await notify({
        userId: otherId,
        actorId: meId,
        type: 'connection_break',
        title: `${myName} запрашивает разрыв связи`,
        body: 'Подтвердите или отклоните запрос',
        link: `/connections/requests`,
      });
      emitToUser(otherId, 'connection_updated', { connId: conn.id, status: 'BREAK_REQUESTED' });
    } catch {}

    return res.json(formatConnection(updated, meId));
  } catch (err) {
    console.error('[connections] PATCH /:id/break', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/connections/:id/confirm-break ──────────────────────────────────
// Other party confirms the break (requires reason) → save to history, delete connection
class ConnConflict extends Error {}
router.patch('/:id/confirm-break', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { reason } = req.body as { reason?: string };
    if (typeof reason !== 'string' || !reason.trim()) return res.status(400).json({ error: 'Укажите причину разрыва связи' });

    const conn = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Не найдено' });
    if (conn.requesterId !== meId && conn.receiverId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (conn.status !== 'BREAK_REQUESTED') return res.status(400).json({ error: 'Запрос разрыва не найден' });
    if (conn.breakRequestedBy === meId) return res.status(400).json({ error: 'Вы сами запросили разрыв' });

    try {
      await prisma.$transaction(async (tx) => {
        // Удаляем только если запрос разрыва всё ещё в силе (его могли отменить)
        const del = await tx.connection.deleteMany({
          where: { id: conn.id, status: 'BREAK_REQUESTED', breakRequestedBy: conn.breakRequestedBy },
        });
        if (del.count === 0) throw new ConnConflict();
        await tx.connectionHistory.create({
          data: {
            requesterId: conn.requesterId,
            receiverId: conn.receiverId,
            professionId: conn.professionId,
            breakInitiatorId: conn.breakRequestedBy!,
            breakReasonRequester: conn.breakReasonRequester,
            breakReasonReceiver: reason.trim(),
            connectedAt: conn.createdAt,
          },
        });
      });
    } catch (e) {
      if (e instanceof ConnConflict) return conflict(res);
      throw e;
    }

    if (conn.breakRequestedBy) {
      emitToUser(conn.breakRequestedBy, 'connection_updated', { connId: conn.id, status: 'BROKEN' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[connections] PATCH /:id/confirm-break', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/connections/:id/add-services ───────────────────────────────────
// Add services to the requester's own PENDING request (до ответа получателя).
// Изменить уже принятую связь в одностороннем порядке нельзя — для новых услуг
// отправляется новый запрос (POST /), который партнёр принимает или отклоняет.
router.patch('/:id/add-services', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const serviceIds = await validateServiceIds(req.body?.serviceIds);
    if (!serviceIds) return res.status(400).json({ error: 'Некорректный список услуг' });
    if (!serviceIds.length) return res.status(400).json({ error: 'serviceIds обязательны' });

    const conn = await prisma.connection.findUnique({ where: { id: req.params.id }, include: CONN_INCLUDE });
    if (!conn) return res.status(404).json({ error: 'Не найдено' });
    if (conn.requesterId !== meId && conn.receiverId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (conn.status !== 'PENDING' || conn.requesterId !== meId) {
      return res.status(409).json({ error: 'Добавить услуги можно только в свой ещё не принятый запрос. Для принятой связи отправьте новый запрос.' });
    }

    // Only add services not already in the connection
    const existingIds = new Set(conn.services.map((cs: any) => cs.service.id));
    const newIds = serviceIds.filter((id: string) => !existingIds.has(id));

    if (newIds.length > 0) {
      await prisma.connectionService.createMany({
        data: newIds.map((sid: string) => ({ connectionId: conn.id, serviceId: sid })),
        skipDuplicates: true,
      });
    }

    const updated = await prisma.connection.findUnique({ where: { id: conn.id }, include: CONN_INCLUDE });
    if (!updated) return res.status(404).json({ error: 'Не найдено' });
    return res.json(formatConnection(updated, meId));
  } catch (err) {
    console.error('[connections] PATCH /:id/add-services', err);
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

    const r = await prisma.connection.updateMany({
      where: { id: conn.id, status: 'BREAK_REQUESTED', breakRequestedBy: meId },
      data: { status: 'ACCEPTED', breakRequestedBy: null },
    });
    if (r.count === 0) return conflict(res);
    const updated = await prisma.connection.findUnique({ where: { id: conn.id }, include: CONN_INCLUDE });

    const otherId = conn.requesterId === meId ? conn.receiverId : conn.requesterId;
    emitToUser(otherId, 'connection_updated', { connId: conn.id, status: 'ACCEPTED' });
    return res.json(formatConnection(updated, meId));
  } catch (err) {
    console.error('[connections] PATCH /:id/cancel-break', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
