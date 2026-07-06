import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createNotifySubscribeToken, getBotUsername } from '../utils/telegramNotify';

const router = Router();

// ── Telegram-дублирование уведомлений ────────────────────────────────────────

// GET /api/notifications/telegram/status — подключено ли дублирование
router.get('/telegram/status', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { telegramId: true, telegramNotifyEnabled: true } as any,
    }) as any;
    res.json({
      linked: !!user?.telegramId,
      enabled: !!user?.telegramNotifyEnabled,
    });
  } catch {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// POST /api/notifications/telegram/subscribe — deep-link на бота с одноразовым токеном
router.post('/telegram/subscribe', authenticate, async (req: AuthRequest, res) => {
  try {
    const botUsername = await getBotUsername();
    if (!botUsername) return res.status(503).json({ error: 'Telegram-бот сейчас недоступен. Попробуйте позже.' });
    const token = createNotifySubscribeToken(req.userId!);
    res.json({ url: `https://t.me/${botUsername}?start=notify_${token}` });
  } catch {
    res.status(500).json({ error: 'Failed to create subscribe link' });
  }
});

// DELETE /api/notifications/telegram — отписаться от дублирования
router.delete('/telegram', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.user.update({
      where: { id: req.userId! },
      data: { telegramNotifyEnabled: false } as any,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// GET /api/notifications — список последних 50 уведомлений
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId! },
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch {
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// GET /api/notifications/unread/count — кол-во непрочитанных
router.get('/unread/count', authenticate, async (req: AuthRequest, res) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.userId!, read: false },
    });
    res.json({ count });
  } catch {
    res.status(500).json({ error: 'Failed to get count' });
  }
});

// PATCH /api/notifications/:id/read — прочитать одно
router.patch('/:id/read', authenticate, async (req: AuthRequest, res) => {
  try {
    const notif = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!notif) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update' });
  }
});

// PATCH /api/notifications/read-all — прочитать все
router.patch('/read-all', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId!, read: false },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to update' });
  }
});

export default router;
