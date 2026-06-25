import webpush from 'web-push';
import { prisma } from '../index';
import logger from './logger';

export function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'mailto:admin@moooza.ru';

  if (!publicKey || !privateKey) {
    logger.warn('VAPID keys not configured — push notifications disabled');
    return;
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
  logger.info('✅ Web Push (VAPID) initialized');
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  link?: string;
}

// Send options: `urgency: high` wakes dozing Android devices (FCM Doze) and gives
// Apple/Mozilla high delivery priority; `TTL` lets the push service queue the
// message for a few days if the device is offline at send time.
const SEND_OPTIONS = { TTL: 60 * 60 * 24 * 3, urgency: 'high' as const };
const MAX_ATTEMPTS = 3;

async function sendOne(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  data: string,
  attempt = 1,
): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      data,
      SEND_OPTIONS,
    );
  } catch (err: any) {
    const code: number | undefined = err?.statusCode;
    // 410 Gone / 404 = subscription expired or revoked — drop it.
    if (code === 410 || code === 404) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      return;
    }
    // Transient (push-service 5xx / 429 / network blip) — retry with backoff so a
    // momentary failure doesn't silently swallow the notification.
    const transient = code === undefined || code === 429 || code >= 500;
    if (transient && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return sendOne(sub, data, attempt + 1);
    }
    logger.warn(`Push send failed for sub ${sub.id} (status ${code ?? 'net'}, attempt ${attempt}): ${err?.message}`);
  }
}

/** Send push notification to all subscriptions of a user */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return;

  const data = JSON.stringify(payload);
  await Promise.allSettled(subscriptions.map((sub) => sendOne(sub, data)));
}
