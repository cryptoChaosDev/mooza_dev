import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

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
