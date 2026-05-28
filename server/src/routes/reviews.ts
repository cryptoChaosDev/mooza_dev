import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { tgEvent } from '../utils/telegram';

const router = Router();

const reviewInclude = {
  author: { select: { id: true, firstName: true, lastName: true, avatar: true } },
  service: { select: { id: true, name: true } },
  deal: { select: { id: true, createdAt: true, updatedAt: true, status: true } },
} as const;

// GET /api/reviews/user/:userId — all reviews for a user
router.get('/user/:userId', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const { sort = 'date' } = req.query as { sort?: string };
    const orderBy: any =
      sort === 'positive' ? [{ rating: 'desc' }, { createdAt: 'desc' }] :
      sort === 'negative' ? [{ rating: 'asc'  }, { createdAt: 'desc' }] :
      [{ createdAt: 'desc' }];

    const reviews = await prisma.review.findMany({
      where: { targetId: req.params.userId },
      include: reviewInclude,
      orderBy,
    });
    res.json(reviews);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get reviews' });
  }
});

// POST /api/reviews — create review (auth required)
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { targetId, rating, text, type = 'connection', serviceId } = req.body;
    if (!targetId || !rating) return res.status(400).json({ error: 'targetId and rating required' });
    if (targetId === req.userId) return res.status(400).json({ error: 'Cannot review yourself' });
    if (rating < 1 || rating > 10) return res.status(400).json({ error: 'Rating must be 1-10' });

    const review = await prisma.review.upsert({
      where: { authorId_targetId_type: { authorId: req.userId!, targetId, type } },
      create: {
        authorId: req.userId!,
        targetId,
        rating: Number(rating),
        text: text?.trim() || null,
        type,
        serviceId: serviceId || null,
      },
      update: {
        rating: Number(rating),
        text: text?.trim() || null,
        serviceId: serviceId || null,
      },
      include: reviewInclude,
    });
    try {
      const target = await prisma.user.findUnique({ where: { id: targetId }, select: { firstName: true, lastName: true } });
      tgEvent.review(`${review.author.firstName} ${review.author.lastName}`, `${target?.firstName} ${target?.lastName}`, Number(rating));
    } catch {}
    res.json(review);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/reviews/:id/reply — add reply (only target user can reply)
router.patch('/:id/reply', authenticate, async (req: AuthRequest, res) => {
  try {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) return res.status(404).json({ error: 'Not found' });
    if (review.targetId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.review.update({
      where: { id: req.params.id },
      data: { reply: req.body.reply?.trim() || null },
      include: reviewInclude,
    });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/reviews/:id — delete own review
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) return res.status(404).json({ error: 'Not found' });
    if (review.authorId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    await prisma.review.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
