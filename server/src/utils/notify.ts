import { prisma } from '../index';
import { emitToUser } from '../socket';
import { sendPushToUser } from './webpush';
import logger from './logger';

export interface NotifyOpts {
  userId: string;
  actorId?: string | null;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/**
 * Single entry point for creating a notification.
 *
 * 1. Persists a Notification row (prisma.notification.create).
 * 2. Emits the `new_notification` socket event so online clients update in
 *    real time (same event NotificationBell/App.tsx already listen for).
 * 3. Best-effort web-push fan-out via the existing VAPID mechanism
 *    (sendPushToUser in utils/webpush.ts) so offline/background users are
 *    reached too.
 *
 * Never throws — notification delivery must never break the caller.
 */
export async function notify(opts: NotifyOpts): Promise<void> {
  try {
    // body is a required column on the model; default to empty string.
    const notification = await prisma.notification.create({
      data: {
        userId: opts.userId,
        actorId: opts.actorId ?? null,
        type: opts.type,
        title: opts.title,
        body: opts.body ?? '',
        link: opts.link,
      },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });

    // Real-time in-app update for online clients.
    try {
      emitToUser(opts.userId, 'new_notification', notification);
    } catch (err: any) {
      logger.warn(`notify: socket emit failed for ${opts.userId}: ${err?.message}`);
    }

    // Best-effort push — failure must never propagate.
    try {
      await sendPushToUser(opts.userId, {
        title: opts.title,
        body: opts.body ?? '',
        link: opts.link,
      });
    } catch (err: any) {
      logger.warn(`notify: push failed for ${opts.userId}: ${err?.message}`);
    }
  } catch (err: any) {
    // Even a failed row write must not break the calling request.
    logger.error(`notify: failed to create notification for ${opts.userId}: ${err?.message}`);
  }
}

/** Fan-out the same notification to many users. Never throws. */
export async function notifyMany(
  userIds: string[],
  opts: Omit<NotifyOpts, 'userId'>,
): Promise<void> {
  await Promise.all(userIds.map((userId) => notify({ ...opts, userId })));
}
