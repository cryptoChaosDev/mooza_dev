import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getPushStats } from '../utils/webpush';

const router = Router();

/**
 * Endpoint подписки — URL, на который сервер потом делает POST (web-push).
 * Принимаем только https на внешний хост: иначе подписка с endpoint
 * http://localhost:…/ или на внутренний IP превращала бы рассылку в SSRF.
 */
function isValidPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return false; // IP-литералы
    return true;
  } catch {
    return false;
  }
}

// GET /api/push/vapid-public-key — expose public key to client (no auth required)
router.get('/vapid-public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push not configured' });
  res.json({ key });
});

// POST /api/push/resubscribe — SW-driven re-subscription after the browser rotates
// the subscription (pushsubscriptionchange). No auth: the user is identified by the
// OLD endpoint (only the device that held it knows it). Keeps push alive for users
// who don't reopen the app — exactly the ones at risk of churning.
router.post('/resubscribe', async (req: AuthRequest, res) => {
  try {
    const { oldEndpoint, subscription } = req.body;
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;
    if (!isValidPushEndpoint(endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }
    const old = typeof oldEndpoint === 'string' && oldEndpoint
      ? await prisma.pushSubscription.findUnique({ where: { endpoint: oldEndpoint } })
      : null;
    if (!old) return res.json({ ok: false }); // can't map to a user — ignore quietly

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: old.userId, p256dh, auth },
      create: { userId: old.userId, endpoint, p256dh, auth },
    });
    if (oldEndpoint && oldEndpoint !== endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: oldEndpoint } }).catch(() => {});
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Push subscription error' });
  }
});

router.use(authenticate);

// GET /api/push/stats — push delivery counters since last restart (admin only).
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { isAdmin: true } });
    if (!me?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    res.json(getPushStats());
  } catch {
    res.status(500).json({ error: 'Failed to get push stats' });
  }
});

// POST /api/push/subscribe — save push subscription
router.post('/subscribe', async (req: AuthRequest, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!isValidPushEndpoint(endpoint) || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string' || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.userId!, p256dh: keys.p256dh, auth: keys.auth },
      create: { userId: req.userId!, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Push subscription error' });
  }
});

// DELETE /api/push/subscribe — remove push subscription
router.delete('/subscribe', async (req: AuthRequest, res) => {
  try {
    const { endpoint } = req.body;
    if (typeof endpoint === 'string' && endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint, userId: req.userId! },
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Push subscription error' });
  }
});

export default router;
