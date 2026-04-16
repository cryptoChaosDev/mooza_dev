import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const TARGET_SELECT = {
  id: true, firstName: true, lastName: true, avatar: true,
  role: true, city: true, isPremium: true, isVerified: true,
};

// GET /api/favorites — my favorites list
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const favs = await prisma.favorite.findMany({
      where: { userId: meId },
      include: { target: { select: TARGET_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(favs.map(f => ({ id: f.id, createdAt: f.createdAt, user: f.target })));
  } catch (err) {
    console.error('[favorites] GET /', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/favorites/status/:targetId — am I following this user?
router.get('/status/:targetId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { targetId } = req.params;
    const fav = await prisma.favorite.findUnique({
      where: { userId_targetId: { userId: meId, targetId } },
    });
    return res.json({ isFavorite: !!fav, favoriteId: fav?.id ?? null });
  } catch (err) {
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/favorites/:targetId — add to favorites
router.post('/:targetId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { targetId } = req.params;
    if (targetId === meId) return res.status(400).json({ error: 'Нельзя добавить себя' });
    const fav = await prisma.favorite.upsert({
      where: { userId_targetId: { userId: meId, targetId } },
      create: { userId: meId, targetId },
      update: {},
    });
    return res.json({ id: fav.id });
  } catch (err) {
    console.error('[favorites] POST /', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/favorites/:targetId — remove from favorites
router.delete('/:targetId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { targetId } = req.params;
    await prisma.favorite.deleteMany({ where: { userId: meId, targetId } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
