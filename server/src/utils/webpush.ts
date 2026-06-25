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

// ── Delivery stats (in-memory; resets on restart) ────────────────────────────
// Counts what happened to each send, grouped by push service, so push reliability
// can be measured at a glance via GET /api/push/stats (admin).
type Bucket = { sent: number; expired: number; failed: number };
const emptyBucket = (): Bucket => ({ sent: 0, expired: 0, failed: 0 });
const pushStats = {
  since: new Date().toISOString(),
  fcm: emptyBucket(),
  apple: emptyBucket(),
  mozilla: emptyBucket(),
  other: emptyBucket(),
};
function svcKey(endpoint: string): 'fcm' | 'apple' | 'mozilla' | 'other' {
  try {
    const h = new URL(endpoint).host;
    if (h.includes('googleapis.com')) return 'fcm';
    if (h.includes('push.apple.com')) return 'apple';
    if (h.includes('mozilla.com')) return 'mozilla';
  } catch { /* ignore */ }
  return 'other';
}
function bumpStat(endpoint: string, result: keyof Bucket) {
  pushStats[svcKey(endpoint)][result]++;
}
/** Snapshot of push delivery counters since the last restart (for admin/monitoring). */
export function getPushStats() {
  const total = (b: Bucket) => b.sent + b.expired + b.failed;
  const pct = (b: Bucket) => (total(b) ? +((b.sent / total(b)) * 100).toFixed(1) : null);
  const view = (b: Bucket) => ({ ...b, total: total(b), deliveredPct: pct(b) });
  return {
    since: pushStats.since,
    fcm: view(pushStats.fcm),
    apple: view(pushStats.apple),
    mozilla: view(pushStats.mozilla),
    other: view(pushStats.other),
  };
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
    bumpStat(sub.endpoint, 'sent');
  } catch (err: any) {
    const code: number | undefined = err?.statusCode;
    // 410 Gone / 404 = subscription expired or revoked — drop it.
    if (code === 410 || code === 404) {
      bumpStat(sub.endpoint, 'expired');
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
    bumpStat(sub.endpoint, 'failed');
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
