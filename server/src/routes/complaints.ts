import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { tgEvent } from '../utils/telegram';
import logger from '../utils/logger';
import * as socketModule from '../socket';

const router = Router();

const HIGH_RISK_CATEGORIES = [
  'Мошенничество / обман',
  'Контент 18+',
  'Угрозы',
  'Нарушение авторских прав',
  'Клевета / ложные факты',
];

const VALID_TARGET_TYPES = ['user', 'post', 'review'] as const;
type TargetType = typeof VALID_TARGET_TYPES[number];
const VALID_STATUSES = ['pending', 'reviewed', 'actioned', 'rejected'];
const TEXT_MIN = 30;
const TEXT_MAX = 2000;
const CATEGORY_MAX = 100;
const MAX_BLOCK_DAYS = 3650;

// Автоблокировка по жалобам — только когда на пользователя пожаловались
// AUTO_BLOCK_MIN_REPORTERS РАЗНЫХ аккаунтов, каждый старше AUTO_BLOCK_MIN_AGE_DAYS:
// один человек (или свежие фейки) больше не может заблокировать кого угодно.
const AUTO_BLOCK_MIN_REPORTERS = 3;
const AUTO_BLOCK_MIN_AGE_DAYS = 7;
const AUTO_BLOCK_HOURS = 24;

// Подача жалоб: не больше 10 в час с аккаунта (стоит ПОСЛЕ authenticate → ключ по userId).
const complaintLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.userId || ipKeyGenerator(req.ip),
  handler: (_req, res) => {
    res.status(429).json({ error: 'Слишком много жалоб. Попробуйте позже.' });
  },
});

function serverError(res: any, where: string, e: any) {
  logger.error(`[complaints] ${where}: ${e?.message}`);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

// Разорвать живые сокеты заблокированного пользователя.
// TODO(интеграция с зоной чата): после мержа заменить на прямой импорт
//   import { disconnectUserSockets } from '../socket';  disconnectUserSockets(userId);
// Пока функции в socket.ts нет — вызываем её, только если она экспортирована.
function kickUserSockets(userId: string) {
  try {
    const fn = (socketModule as any).disconnectUserSockets;
    if (typeof fn === 'function') fn(userId);
  } catch (e: any) {
    logger.warn(`[complaints] disconnectUserSockets failed for ${userId}: ${e?.message}`);
  }
}

function computeRiskScore(category: string, prevReporters: number, reporterAge: number): number {
  let score = 20;
  if (HIGH_RISK_CATEGORIES.some(c => category.toLowerCase().includes(c.toLowerCase()))) score += 40;
  if (prevReporters >= 3) score += 30;
  if (prevReporters >= 1) score += 10;
  if (reporterAge < 7) score -= 10; // new reporter — less trust
  return Math.max(0, Math.min(100, score));
}

/** Владелец цели жалобы (кого блокировать): сам пользователь / автор поста / автор отзыва. */
async function resolveTargetOwner(targetType: TargetType, targetId: string): Promise<string | null> {
  if (targetType === 'user') {
    const u = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    return u?.id ?? null;
  }
  if (targetType === 'post') {
    const p = await prisma.post.findUnique({ where: { id: targetId }, select: { authorId: true } });
    return p?.authorId ?? null;
  }
  const r = await prisma.review.findUnique({ where: { id: targetId }, select: { authorId: true } });
  return r?.authorId ?? null;
}

// POST /api/complaints — submit a complaint
router.post('/', authenticate, complaintLimiter, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { targetType, targetId, category, text } = req.body;
    if (!targetType || !targetId || !category) {
      return res.status(400).json({ error: 'targetType, targetId, category required' });
    }
    if (!VALID_TARGET_TYPES.includes(targetType)) return res.status(400).json({ error: 'Некорректный тип жалобы' });
    if (typeof targetId !== 'string' || targetId.length > 64) return res.status(400).json({ error: 'Некорректная цель жалобы' });
    if (typeof category !== 'string' || !category.trim() || category.length > CATEGORY_MAX) {
      return res.status(400).json({ error: 'Некорректная категория' });
    }
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (cleanText.length < TEXT_MIN) {
      return res.status(400).json({ error: 'Описание обязательно (минимум 30 символов)' });
    }
    if (cleanText.length > TEXT_MAX) {
      return res.status(400).json({ error: `Описание — не длиннее ${TEXT_MAX} символов` });
    }

    const ownerId = await resolveTargetOwner(targetType, targetId);
    if (!ownerId) return res.status(404).json({ error: 'Объект жалобы не найден' });
    if (ownerId === meId) return res.status(400).json({ error: 'Нельзя пожаловаться на себя' });

    // Одна открытая жалоба от репортёра на цель.
    const dup = await prisma.complaint.findFirst({
      where: { reporterId: meId, targetType, targetId, status: 'pending' },
      select: { id: true },
    });
    if (dup) return res.status(409).json({ error: 'Вы уже пожаловались — жалоба на рассмотрении' });

    // Уникальные ДРУГИЕ репортёры по этой цели (повторные жалобы одного
    // пользователя больше не накручивают риск).
    const prevReporterRows = await prisma.complaint.groupBy({
      by: ['reporterId'],
      where: { targetType, targetId, reporterId: { not: meId }, status: { in: ['pending', 'actioned'] } },
    });
    const prevReporters = prevReporterRows.length;

    // Reporter trust: account age in days
    const reporter = await prisma.user.findUnique({
      where: { id: meId },
      select: { createdAt: true, firstName: true, lastName: true },
    });
    const reporterAge = reporter
      ? Math.floor((Date.now() - reporter.createdAt.getTime()) / 86400000)
      : 0;

    const riskScore = computeRiskScore(category, prevReporters, reporterAge);

    const complaint = await prisma.complaint.create({
      data: { reporterId: meId, targetType, targetId, category: category.trim(), text: cleanText, riskScore },
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
          body: `${targetType === 'user' ? 'Пользователь' : targetType === 'post' ? 'Публикация' : 'Отзыв'} — ${category.trim()}. ${cleanText.slice(0, 100)}`,
          link: targetType === 'user' ? `/profile/${targetId}` : '/admin',
        }
      }).catch(() => null)
    ));

    // Auto-action for very high score: temporary block user for 24h — только при
    // жалобах от ≥3 РАЗНЫХ аккаунтов старше 7 дней и никогда на администратора.
    // Пишем только blockedUntil (isBlocked — бессрочная ручная блокировка).
    if (riskScore >= 80 && targetType === 'user') {
      const minCreated = new Date(Date.now() - AUTO_BLOCK_MIN_AGE_DAYS * 86400000);
      const trusted = await prisma.complaint.groupBy({
        by: ['reporterId'],
        where: {
          targetType: 'user', targetId, status: { in: ['pending', 'actioned'] },
          reporter: { createdAt: { lte: minCreated }, isBlocked: false },
        },
      });
      const target = await prisma.user.findUnique({ where: { id: targetId }, select: { isAdmin: true, blockedUntil: true } });
      const blockedUntil = new Date(Date.now() + AUTO_BLOCK_HOURS * 60 * 60 * 1000);
      if (trusted.length >= AUTO_BLOCK_MIN_REPORTERS && target && !target.isAdmin
        && !(target.blockedUntil && target.blockedUntil.getTime() >= blockedUntil.getTime())) {
        await prisma.user.update({
          where: { id: targetId },
          data: { blockedUntil },
        });
        kickUserSockets(targetId);
        await prisma.complaint.update({
          where: { id: complaint.id },
          data: { status: 'actioned', resolution: 'Auto-block 24h (high risk score, multiple reporters)', resolvedAt: new Date() },
        });
        logger.info(`[complaints] auto-blocked ${targetId} for ${AUTO_BLOCK_HOURS}h (${trusted.length} reporters)`);
      }
    }

    try {
      tgEvent.complaint(`${reporter?.firstName} ${reporter?.lastName}`, targetType, category, riskScore);
    } catch {}

    res.json({ ok: true, riskScore });
  } catch (e: any) {
    return serverError(res, 'POST /', e);
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
  } catch (e: any) { return serverError(res, 'GET /stats', e); }
});

// GET /api/complaints — admin list of complaints
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
    if (!me?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Некорректный статус' });
    const complaints = await prisma.complaint.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }],
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
      take: 100,
    });

    // Обогащение целями — батчем (3 запроса вместо N+1).
    const idsOf = (t: string) => [...new Set(complaints.filter(c => c.targetType === t).map(c => c.targetId))];
    const [users, posts, reviews] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: idsOf('user') } },
        select: { id: true, firstName: true, lastName: true, avatar: true, isBlocked: true, blockedUntil: true, isAdmin: true },
      }),
      prisma.post.findMany({
        where: { id: { in: idsOf('post') } },
        select: {
          id: true, content: true, type: true, authorId: true,
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.review.findMany({
        where: { id: { in: idsOf('review') } },
        select: {
          id: true, text: true, rating: true, targetId: true, authorId: true,
          author: { select: { id: true, firstName: true, lastName: true } },
          target: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);
    const byId = {
      user: new Map(users.map(u => [u.id, u])),
      post: new Map(posts.map(p => [p.id, p])),
      review: new Map(reviews.map(r => [r.id, r])),
    } as Record<string, Map<string, unknown>>;
    const enriched = complaints.map(c => ({ ...c, targetData: byId[c.targetType]?.get(c.targetId) ?? null }));

    res.json(enriched);
  } catch (e: any) {
    return serverError(res, 'GET /', e);
  }
});

// PATCH /api/complaints/:id — admin action
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { isAdmin: true } });
    if (!me?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const { status, resolution, blockDays, deleteContent } = req.body;

    // Вся валидация — ДО изменения жалобы.
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Некорректный статус' });
    let blockMode: 'none' | 'forever' | 'days' = 'none';
    let days = 0;
    if (blockDays === 'forever') {
      blockMode = 'forever';
    } else if (blockDays !== undefined && blockDays !== null && blockDays !== '' && blockDays !== 0) {
      days = Number(blockDays);
      if (!Number.isInteger(days) || days < 1 || days > MAX_BLOCK_DAYS) {
        return res.status(400).json({ error: `Срок блокировки — целое число дней от 1 до ${MAX_BLOCK_DAYS}` });
      }
      blockMode = 'days';
    }
    if (resolution != null && (typeof resolution !== 'string' || resolution.length > TEXT_MAX)) {
      return res.status(400).json({ error: 'Некорректный комментарий решения' });
    }

    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) return res.status(404).json({ error: 'Not found' });
    if (!VALID_TARGET_TYPES.includes(complaint.targetType as TargetType)) {
      return res.status(400).json({ error: 'Некорректный тип жалобы' });
    }

    // Блокировать можно пользователя-цель или АВТОРА поста/отзыва.
    let blockUserId: string | null = null;
    if (blockMode !== 'none') {
      blockUserId = await resolveTargetOwner(complaint.targetType as TargetType, complaint.targetId);
      if (!blockUserId) return res.status(409).json({ error: 'Автор контента не найден (контент уже удалён) — заблокируйте пользователя через раздел «Пользователи»' });
      if (blockUserId === meId) return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
      const target = await prisma.user.findUnique({ where: { id: blockUserId }, select: { isAdmin: true } });
      if (target?.isAdmin) return res.status(400).json({ error: 'Нельзя заблокировать администратора' });
    }

    await prisma.complaint.update({
      where: { id: complaint.id },
      data: { status, resolution: typeof resolution === 'string' && resolution.trim() ? resolution.trim() : null, resolvedAt: new Date() },
    });

    if (blockUserId) {
      // Временная блокировка — только blockedUntil (снимется сама по истечении);
      // бессрочная — isBlocked (снимает только админ).
      await prisma.user.update({
        where: { id: blockUserId },
        data: blockMode === 'forever'
          ? { isBlocked: true, blockedUntil: null }
          : { blockedUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000) },
      });
      kickUserSockets(blockUserId);
    }

    // Delete reported content if requested
    if (deleteContent) {
      try {
        if (complaint.targetType === 'post') {
          // Как при удалении автором: репосты получают плейсхолдер «Пост удалён».
          await prisma.post.updateMany({ where: { repostOfId: complaint.targetId }, data: { repostDeleted: true } });
          await prisma.notification.deleteMany({ where: { link: { contains: complaint.targetId } } });
          await prisma.post.delete({ where: { id: complaint.targetId } });
        } else if (complaint.targetType === 'review') {
          await prisma.review.delete({ where: { id: complaint.targetId } });
        }
      } catch {} // content may already be deleted
    }

    res.json({ ok: true });
  } catch (e: any) {
    return serverError(res, 'PATCH /:id', e);
  }
});

export default router;
