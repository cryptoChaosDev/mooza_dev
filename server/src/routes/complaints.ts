import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/complaints — submit a complaint
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { targetType, targetId, category, text } = req.body;
    // targetType: 'user' | 'post' | 'review'
    if (!targetType || !targetId || !category) {
      return res.status(400).json({ error: 'targetType, targetId, category required' });
    }
    // Store as notification to admins (simplest approach)
    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    await Promise.all(admins.map(admin =>
      prisma.notification.create({
        data: {
          userId: admin.id,
          actorId: req.userId,
          type: 'complaint',
          title: `Жалоба на ${targetType === 'user' ? 'пользователя' : targetType === 'post' ? 'публикацию' : 'отзыв'}`,
          body: `Категория: ${category}${text ? '. ' + text.slice(0, 100) : ''}`,
          link: targetType === 'user' ? `/profile/${targetId}` : `/#${targetId}`,
        }
      })
    ));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
