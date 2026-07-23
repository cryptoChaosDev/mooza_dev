import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supportLimiter } from '../middleware/rateLimiter';
import { tgEvent } from '../utils/telegram';
import { notifyMany } from '../utils/notify';

const router = Router();

// POST /api/support/profession-request — пользователь просит добавить профессию/услугу,
// которой нет в каталоге. Уходит команде в Telegram + админам в уведомления.
router.post('/profession-request', authenticate, supportLimiter, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const profession = String(req.body?.profession || '').trim();
    const comment = String(req.body?.comment || '').trim();

    if (profession.length < 2 || profession.length > 80) {
      return res.status(400).json({ error: 'Укажите название профессии (2–80 символов)' });
    }
    if (comment.length > 500) {
      return res.status(400).json({ error: 'Комментарий слишком длинный (максимум 500 символов)' });
    }

    const me = await prisma.user.findUnique({
      where: { id: meId },
      select: { firstName: true, lastName: true },
    });
    const userName = `${me?.firstName || ''} ${me?.lastName || ''}`.trim() || 'Пользователь';

    // Постоянная запись — очередь «Модерация → Запросы профессий» в админке
    await (prisma as any).professionRequest.create({
      data: { userId: meId, profession, comment: comment || null },
    });

    // In-app уведомление админам — через notifyMany (колокольчик + сокет + push)
    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    await notifyMany(admins.map(a => a.id), {
      actorId: meId,
      type: 'support',
      title: '➕ Запрос на добавление профессии',
      body: `«${profession}»${comment ? '. ' + comment.slice(0, 120) : ''}`,
      link: '/admin',
    });

    // Уведомление команде в Telegram (основной канал поддержки)
    try { tgEvent.professionRequest(userName, profession, comment); } catch {}

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
