import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// POST /api/push/subscribe — save push subscription
router.post('/subscribe', async (req: AuthRequest, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.userId!, p256dh: keys.p256dh, auth: keys.auth },
      create: { userId: req.userId!, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/push/subscribe — remove push subscription
router.delete('/subscribe', async (req: AuthRequest, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint, userId: req.userId! },
      });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/push/vapid-public-key — expose public key to client
router.get('/vapid-public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push not configured' });
  res.json({ key });
});

export default router;
