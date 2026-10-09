import { prisma } from '../index';
import { emitToUserWithVisibleAck } from '../socket';
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

// ── Пользовательские настройки уведомлений ────────────────────────────────────
// Категории, которые можно отключить в «Приватности». Типы вне карты
// (support, pro_activated, системные) доставляются всегда.
export type NotifCategory = 'messages' | 'orders' | 'vacancies' | 'social';

export function categoryOfNotification(type: string): NotifCategory | null {
  if (type === 'message') return 'messages';
  if (type.startsWith('order') || type.startsWith('service')) return 'orders';
  if (type.startsWith('vacancy') || type.startsWith('release_') || type.startsWith('clip_') || type.startsWith('lineup')) return 'vacancies';
  // «Социальное» в настройках = «Друзья, связи, ответы на посты, отзывы»
  if (
    type === 'social' || type === 'post_reply' || type === 'saved' || type.startsWith('review') ||
    type.startsWith('friend_') || type.startsWith('connection_')
  ) return 'social';
  return null;
}

/** true, если пользователь не отключил категорию этого типа уведомлений. */
export async function isNotificationEnabled(userId: string, type: string): Promise<boolean> {
  const cat = categoryOfNotification(type);
  if (!cat) return true;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    const prefs = (u?.notificationPrefs as Record<string, unknown> | null) ?? {};
    return prefs[cat] !== false;
  } catch {
    return true; // сбой чтения настроек не должен глушить уведомления
  }
}

/**
 * Single entry point for creating a notification.
 *
 * 1. Persists a Notification row (prisma.notification.create).
 * 2. Emits the `new_notification` socket event so online clients update in
 *    real time (same event NotificationBell/App.tsx already listen for).
 * 3. Best-effort web-push fan-out via the existing VAPID mechanism
 *    (sendPushToUser in utils/webpush.ts) so offline/background users are
 *    reached too. Push не шлётся, если открытое на экране окно подтвердило
 *    получение события (см. emitToUserWithVisibleAck) — так SW показывает
 *    каждый пришедший push (требование Apple), а активный пользователь не
 *    получает дублирующий системный баннер.
 *
 * Never throws — notification delivery must never break the caller.
 */
export async function notify(opts: NotifyOpts): Promise<void> {
  try {
    // Уважать настройки уведомлений получателя (категории в «Приватности»).
    if (!(await isNotificationEnabled(opts.userId, opts.type))) return;

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

    // Доставка (сокет с подтверждением → push при необходимости) идёт в фоне:
    // ожидание ack до ~2.5с не должно задерживать ответ вызывающего запроса.
    void (async () => {
      // Real-time in-app update for online clients.
      let seen = false;
      try {
        seen = await emitToUserWithVisibleAck(opts.userId, 'new_notification', notification);
      } catch (err: any) {
        logger.warn(`notify: socket emit failed for ${opts.userId}: ${err?.message}`);
      }

      // Best-effort push — failure must never propagate.
      if (!seen) {
        try {
          await sendPushToUser(opts.userId, {
            title: opts.title,
            body: opts.body ?? '',
            link: opts.link,
          });
        } catch (err: any) {
          logger.warn(`notify: push failed for ${opts.userId}: ${err?.message}`);
        }
      }
    })();
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

// ── Ретеншн уведомлений ──────────────────────────────────────────────────────
export const NOTIFICATION_RETENTION_DAYS = 90;

/**
 * Удаляет ПРОЧИТАННЫЕ уведомления старше NOTIFICATION_RETENTION_DAYS дней.
 * Непрочитанные не трогаем. Идемпотентна — безопасно вызывать из нескольких
 * мест (таймер в routes/notifications.ts и/или scheduler). Never throws.
 */
export async function cleanupOldNotifications(days = NOTIFICATION_RETENTION_DAYS): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const r = await prisma.notification.deleteMany({
      where: { read: true, createdAt: { lt: cutoff } },
    });
    if (r.count > 0) logger.info(`Notification retention: removed ${r.count} read notifications older than ${days}d`);
    return r.count;
  } catch (err: any) {
    logger.warn(`Notification retention failed: ${err?.message}`);
    return 0;
  }
}
