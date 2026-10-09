import { Server } from 'socket.io';
import { createServer } from 'http';
import type { Express } from 'express';
import { verifyToken } from './utils/jwt';
import logger from './utils/logger';
import { sendPushToUser, type PushPayload } from './utils/webpush';

export let io: Server;

// userId -> Set<socketId>: supports multiple tabs/devices per user
const userSockets = new Map<string, Set<string>>();

export function isUserOnline(userId: string): boolean {
  const sockets = userSockets.get(userId);
  return !!sockets && sockets.size > 0;
}

// Returns all online userIds
export function getOnlineUserIds(): string[] {
  return Array.from(userSockets.keys());
}

/**
 * Проверки сессии — те же, что в REST-middleware authenticate (middleware/auth.ts):
 * пользователь существует, не заблокирован (бессрочно или до blockedUntil),
 * токен выдан после последней смены пароля. Без них заблокированный/сменивший
 * пароль пользователь продолжал бы получать сообщения по сокету.
 * Сообщения ошибок начинаются с 'Unauthorized' — клиент по ним делает logout;
 * временный сбой БД — другой текст, чтобы клиент просто переподключился.
 */
async function authorizeSocket(token: unknown): Promise<{ userId: string } | { error: string }> {
  if (!token || typeof token !== 'string') return { error: 'Unauthorized: no token' };
  let payload: { userId: string; iat: number };
  try {
    payload = verifyToken(token);
  } catch {
    return { error: 'Unauthorized: invalid token' };
  }
  try {
    const { prisma } = await import('./index');
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, passwordChangedAt: true, isBlocked: true, blockedUntil: true },
    });
    if (!user) return { error: 'Unauthorized: TOKEN_INVALID' };
    const now = Date.now();
    const tempBlockExpired = !!user.blockedUntil && user.blockedUntil.getTime() < now;
    if (user.blockedUntil && !tempBlockExpired) return { error: 'Unauthorized: blocked' };
    if (user.isBlocked && !tempBlockExpired) return { error: 'Unauthorized: blocked' };
    if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      return { error: 'Unauthorized: TOKEN_INVALID' };
    }
    return { userId: user.id };
  } catch (err: any) {
    logger.warn(`Socket auth DB check failed: ${err?.message}`);
    return { error: 'Temporary server error' };
  }
}

/**
 * Принудительно отключить все сокеты пользователя (блокировка, смена пароля,
 * удаление аккаунта). Клиент получает 'session_revoked' и выходит из аккаунта;
 * повторное подключение отсекается проверками в io.use.
 */
export function disconnectUserSockets(userId: string, reason = 'revoked'): void {
  const sockets = userSockets.get(userId);
  if (!sockets || !io) return;
  for (const socketId of Array.from(sockets)) {
    const s = io.sockets.sockets.get(socketId);
    if (!s) continue;
    try { s.emit('session_revoked', { reason }); } catch { /* ignore */ }
    s.disconnect(true);
  }
}

const TYPING_MIN_INTERVAL_MS = 1000; // клиент шлёт раз в ~2.5с; чаще — спам/скрипт
const PING_MIN_INTERVAL_MS = 10_000;  // клиент шлёт раз в 30с

export function initSocket(app: Express) {
  const httpServer = createServer(app);

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null;

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins ?? true,
      credentials: true,
    },
  });

  // JWT auth middleware + те же проверки аккаунта, что и в REST
  io.use(async (socket, next) => {
    const result = await authorizeSocket(socket.handshake.auth?.token);
    if ('error' in result) return next(new Error(result.error));
    socket.data.userId = result.userId;
    next();
  });

  io.on('connection', async (socket) => {
    const userId: string = socket.data.userId;
    const wasOnline = isUserOnline(userId);

    // Add this socket to the user's set
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);
    logger.info(`Socket connected: user=${userId} socket=${socket.id} total=${userSockets.get(userId)!.size}`);

    // Send current online list to the newly connected user
    socket.emit('user:online_list', getOnlineUserIds());

    // Only broadcast online event if this is the first connection for this user
    if (!wasOnline) {
      socket.broadcast.emit('user:online', { userId });
    }

    // Mark undelivered messages as delivered
    try {
      const { prisma } = await import('./index');
      const undelivered = await prisma.message.findMany({
        where: {
          conversationId: { not: null },
          deliveredAt: null,
          readAt: null,
          conversation: { members: { some: { userId } } },
          senderId: { not: userId },
        },
        select: { id: true, senderId: true, conversationId: true },
      });
      if (undelivered.length > 0) {
        const now = new Date();
        await prisma.message.updateMany({
          where: { id: { in: undelivered.map(m => m.id) } },
          data: { deliveredAt: now },
        });
        const bySender = new Map<string, string[]>();
        for (const m of undelivered) {
          const ids = bySender.get(m.senderId) ?? [];
          ids.push(m.id);
          bySender.set(m.senderId, ids);
        }
        for (const [senderId, messageIds] of bySender) {
          emitToUser(senderId, 'messages_delivered', { messageIds, deliveredAt: now.toISOString() });
        }
      }
    } catch {}

    // Typing indicator — ephemeral relay to the other members of a conversation.
    // Client throttles (~1 event / 2.5s while typing); the server throttles too
    // (не чаще раза в секунду на сокет), membership is verified server-side so
    // no one can spam arbitrary users.
    let lastTypingAt = 0;
    socket.on('typing', async (payload: { conversationId?: string }) => {
      const now = Date.now();
      if (now - lastTypingAt < TYPING_MIN_INTERVAL_MS) return;
      lastTypingAt = now;
      const conversationId = String(payload?.conversationId ?? '');
      if (!conversationId || conversationId.length > 64) return;
      try {
        const { prisma } = await import('./index');
        const members = await prisma.conversationMember.findMany({
          where: { conversationId, deletedAt: null },
          select: { userId: true },
        });
        if (!members.some(m => m.userId === userId)) return;
        for (const m of members) {
          if (m.userId !== userId) {
            emitToUser(m.userId, 'user_typing', { conversationId, userId });
          }
        }
      } catch {}
    });

    // Heartbeat — client sends 'ping' every 30s to keep lastSeenAt fresh
    let lastPingAt = 0;
    socket.on('ping', async () => {
      const now = Date.now();
      if (now - lastPingAt < PING_MIN_INTERVAL_MS) return;
      lastPingAt = now;
      try {
        const { prisma } = await import('./index');
        await prisma.user.update({
          where: { id: userId },
          data: { lastSeenAt: new Date() },
        });
      } catch {}
    });

    socket.on('disconnect', async () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          logger.info(`Socket disconnected (last): user=${userId}`);
          // User is now truly offline — update lastSeenAt
          try {
            const { prisma } = await import('./index');
            await prisma.user.update({
              where: { id: userId },
              data: { lastSeenAt: new Date() },
            });
          } catch {}
          io.emit('user:offline', { userId });
        } else {
          logger.info(`Socket disconnected: user=${userId} socket=${socket.id} remaining=${sockets.size}`);
        }
      }
    });
  });

  return httpServer;
}

// Emit to a specific user (all their sockets)
export function emitToUser(userId: string, event: string, data: unknown) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }
}

const VISIBLE_ACK_TIMEOUT_MS = 2500;

/**
 * Emit на все сокеты пользователя с подтверждением. Клиент (App.tsx) отвечает
 * { visible: document.visibilityState === 'visible' }. Возвращает true, если хотя
 * бы одно ОТКРЫТОЕ НА ЭКРАНЕ окно подтвердило получение — тогда push не нужен:
 * событие уже показано в приложении. Свёрнутая вкладка/усыплённая PWA отвечает
 * visible:false или не отвечает вовсе (таймаут) → шлём push.
 */
export function emitToUserWithVisibleAck(userId: string, event: string, data: unknown): Promise<boolean> {
  const sockets = userSockets.get(userId);
  if (!io || !sockets || sockets.size === 0) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } };
    try {
      io.to(Array.from(sockets))
        .timeout(VISIBLE_ACK_TIMEOUT_MS)
        .emit(event, data, (_err: unknown, responses: unknown) => {
          const list = Array.isArray(responses) ? responses : [];
          finish(list.some((r: any) => r && r.visible === true));
        });
    } catch {
      finish(false);
    }
    // Страховка, если колбэк так и не вызовется
    setTimeout(() => finish(false), VISIBLE_ACK_TIMEOUT_MS + 1000).unref?.();
  });
}

// Emit to the user's live sockets and send a push if no visible window confirmed
// the event. An online socket only means a tab/PWA is connected — it may be
// backgrounded, where the in-app update is invisible and only a push reaches the
// user. Push не шлём, когда открытое окно подтвердило доставку: «тихий» push
// (SW получил и ничего не показал) запрещён политикой Apple/Safari — подписку
// отзывают, поэтому SW показывает КАЖДЫЙ пришедший push.
export async function notifyUser(
  userId: string,
  event: string,
  data: unknown,
  push?: PushPayload
) {
  if (!push) {
    emitToUser(userId, event, data);
    return;
  }
  const seen = await emitToUserWithVisibleAck(userId, event, data);
  if (seen) return;
  try {
    await sendPushToUser(userId, push);
  } catch {}
}
