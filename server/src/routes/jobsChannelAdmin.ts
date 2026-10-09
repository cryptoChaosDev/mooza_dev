/**
 * Админка автопостинга в Telegram-канал заказов и вакансий (lib/jobsChannel).
 * Смонтирован на /api/admin/jobs-channel (index.ts), только для админов.
 *
 *   GET  /status — настроен ли канал (env), флаг и момент включения;
 *   POST /test   — пробное сообщение в канал; при ошибке — текст Telegram
 *                  (например, бот не админ канала). Работает и при выключенном флаге.
 *
 * Сам флаг jobsChannelEnabled переключается общим PUT /api/admin/site-settings.
 */

import { Router, Response, NextFunction } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { getJobsChannelSettings, isJobsChannelConfigured, jobsChannelId, sendJobsChannelTest } from '../lib/jobsChannel';

const router = Router();

const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
};

router.use(authenticate, requireAdmin);

router.get('/status', async (_req, res) => {
  try {
    const settings = await getJobsChannelSettings();
    res.json({
      configured: isJobsChannelConfigured(),
      channelId: jobsChannelId() || null,
      botConfigured: !!(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
      enabled: settings.enabled,
      enabledAt: settings.enabledAt,
    });
  } catch (e: any) {
    logger.error(`[admin] GET /jobs-channel/status: ${e?.message}`);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/test', async (_req, res) => {
  try {
    const r = await sendJobsChannelTest();
    if (!r.ok) return res.status(r.reason === 'not_configured' ? 400 : 502).json({ error: r.error });
    res.json(r);
  } catch (e: any) {
    logger.error(`[admin] POST /jobs-channel/test: ${e?.message}`);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
