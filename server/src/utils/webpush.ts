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

/** Send push notification to all subscriptions of a user */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return;

  const data = JSON.stringify(payload);

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
        );
      } catch (err: any) {
        // 410 Gone = subscription expired/revoked — clean up
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          logger.warn(`Push send failed for sub ${sub.id}: ${err.message}`);
        }
      }
    }),
  );
}
