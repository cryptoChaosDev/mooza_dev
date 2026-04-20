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

  // JWT auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
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

    // Heartbeat — client sends 'ping' every 30s to keep lastSeenAt fresh
    socket.on('ping', async () => {
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

// Emit or push notification if offline
export async function notifyUser(
  userId: string,
  event: string,
  data: unknown,
  push?: PushPayload
) {
  if (isUserOnline(userId)) {
    emitToUser(userId, event, data);
  } else if (push) {
    try {
      await sendPushToUser(userId, push);
    } catch {}
  }
}
