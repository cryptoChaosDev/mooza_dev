import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { tgEvent } from '../utils/telegram';

const router = Router();

const HIGH_RISK_CATEGORIES = [
  'Мошенничество / обман',
  'Контент 18+',
  'Угрозы',
  'Нарушение авторских прав',
  'Клевета / ложные факты',
];

function computeRiskScore(category: string, prevReports: number, reporterAge: number): number {
  let score = 20;
  if (HIGH_RISK_CATEGORIES.some(c => category.toLowerCase().includes(c.toLowerCase()))) score += 40;
  if (prevReports >= 3) score += 30;
  if (prevReports >= 1) score += 10;
  if (reporterAge < 7) score -= 10; // new reporter — less trust
  return Math.max(0, Math.min(100, score));
}

// POST /api/complaints — submit a complaint
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { targetType, targetId, category, text } = req.body;
    if (!targetType || !targetId || !category) {
      return res.status(400).json({ error: 'targetType, targetId, category required' });
    }
    if (!text || String(text).trim().length < 30) {
      return res.status(400).json({ error: 'Описание обязательно (минимум 30 символов)' });
    }

    // Count previous reports on same target
    const prevReports = await prisma.complaint.count({
      where: { targetType, targetId },
    });

    // Reporter trust: account age in days
    const reporter = await prisma.user.findUnique({
      where: { id: meId },
      select: { createdAt: true },
    });
    const reporterAge = reporter
      ? Math.floor((Date.now() - reporter.createdAt.getTime()) / 86400000)
      : 0;

    const riskScore = computeRiskScore(category, prevReports, reporterAge);

    const complaint = await prisma.complaint.create({
      data: { reporterId: meId, targetType, targetId, category, text: text || null, riskScore },
    });

    // Notify admins
    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    const severity = riskScore >= 70 ? '🚨' : riskScore >= 40 ? '⚠️' : '📋';
    await Promise.all(admins.map(admin =>
      prisma.notification.create({
        data: {
          userId: admin.id,
          actorId: meId,
          type: 'complaint',
          title: `${severity} Жалоба (риск: ${riskScore}/100)`,
          body: `${targetType === 'user' ? 'Пользователь' : targetType === 'post' ? 'Публикация' : 'Отзыв'} — ${category}${text ? '. ' + text.slice(0, 100) : ''}`,
          link: targetType === 'user' ? `/profile/${targetId}` : '/admin',
        }
      })
    ));

    // Auto-action for very high score: temporary block user for 24h
    if (riskScore >= 80 && targetType === 'user') {
      const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: targetId },
        data: { blockedUntil },
      });
      await prisma.complaint.update({
        where: { id: complaint.id },
        data: { status: 'actioned', resolution: 'Auto-block 24h (high risk score)', resolvedAt: new Date() },
      });
    }

    try {
      const reporterUser = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
      tgEvent.complaint(`${reporterUser?.firstName} ${reporterUser?.lastName}`, targetType, category, riskScore);
    } catch {}

    res.json({ ok: true, riskScore });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/complaints/stats — admin stats
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
  try {
    const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
    if (!me?.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const [byStatus, byCategory, highRisk] = await Promise.all([
      prisma.complaint.groupBy({ by: ['status'], _count: true }),
      prisma.complaint.groupBy({ by: ['category'], _count: true, orderBy: { _count: { category: 'desc' } }, take: 10 }),
      prisma.complaint.count({ where: { riskScore: { gte: 70 }, status: 'pending' } }),
    ]);

    res.json({ byStatus, byCategory, highRisk });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/complaints — admin list of complaints
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
    if (!me?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const { status } = req.query;
    const complaints = await prisma.complaint.findMany({
      where: status ? { status: String(status) } : undefined,
      orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }],
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
      take: 100,
    });

    // Enrich each complaint with target data
    const enriched = await Promise.all(complaints.map(async (c) => {
      let target: any = null;
      try {
        if (c.targetType === 'user') {
          target = await prisma.user.findUnique({
            where: { id: c.targetId },
            select: { id: true, firstName: true, lastName: true, avatar: true, isBlocked: true },
          });
        } else if (c.targetType === 'post') {
          const post = await prisma.post.findUnique({
            where: { id: c.targetId },
            select: {
              id: true, content: true, type: true, authorId: true,
              author: { select: { id: true, firstName: true, lastName: true } },
            },
          });
          target = post;
        } else if (c.targetType === 'review') {
          const review = await prisma.review.findUnique({
            where: { id: c.targetId },
            select: {
              id: true, text: true, rating: true, targetId: true,
              author: { select: { id: true, firstName: true, lastName: true } },
              target: { select: { id: true, firstName: true, lastName: true } },
            },
          });
          target = review;
        }
      } catch {}
      return { ...c, targetData: target };
    }));

    res.json(enriched);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/complaints/:id — admin action
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
    if (!me?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const { status, resolution, blockDays, deleteContent } = req.body;

    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) return res.status(404).json({ error: 'Not found' });

    await prisma.complaint.update({
      where: { id: req.params.id },
      data: { status, resolution: resolution || null, resolvedAt: new Date() },
    });

    // If admin wants to block user — set blockedUntil
    if (blockDays && complaint.targetType === 'user') {
      const blockedUntil = blockDays === 'forever'
        ? new Date('2099-12-31')
        : new Date(Date.now() + Number(blockDays) * 24 * 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: complaint.targetId },
        data: { blockedUntil, isBlocked: true },
      });
    }

    // Delete reported content if requested
    if (deleteContent) {
      try {
        if (complaint.targetType === 'post') {
          await prisma.post.delete({ where: { id: complaint.targetId } });
        } else if (complaint.targetType === 'review') {
          await prisma.review.delete({ where: { id: complaint.targetId } });
        }
      } catch {} // content may already be deleted
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
