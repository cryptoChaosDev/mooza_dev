import { Server } from 'socket.io';
import { createServer } from 'http';
import type { Express } from 'express';
import { verifyToken } from './utils/jwt';
import logger from './utils/logger';
import { sendPushToUser, type PushPayload } from './utils/webpush';

export let io: Server;

// userId -> socketId mapping for targeted event delivery
export const userSockets = new Map<string, string>();

export function initSocket(app: Express) {
  const httpServer = createServer(app);

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null;

  io = new Server(httpServer, {
    cors: {
      // If ALLOWED_ORIGINS not set, allow any origin — JWT auth is the security gate
      origin: allowedOrigins ?? true,
      credentials: true,
    },
  });

  // JWT auth middleware for socket connections
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
    userSockets.set(userId, socket.id);
    logger.info(`Socket connected: user=${userId} socket=${socket.id}`);

    // Send current online list to the newly connected user
    socket.emit('user:online_list', Array.from(userSockets.keys()));

    // Broadcast this user's presence to everyone else
    socket.broadcast.emit('user:online', { userId });

    // Mark all undelivered messages sent to this user as delivered
    try {
      const { prisma } = await import('./index');
      const undelivered = await prisma.message.findMany({
        where: { conversationId: { not: null }, deliveredAt: null, readAt: null,
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
        // Notify each sender that their messages were delivered
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

    socket.on('disconnect', () => {
      userSockets.delete(userId);
      logger.info(`Socket disconnected: user=${userId}`);
      // Broadcast offline status
      io.emit('user:offline', { userId });
    });
  });

  return httpServer;
}

/** Returns true if the user has an active socket connection */
export function isUserOnline(userId: string): boolean {
  return userSockets.has(userId);
}

/** Emit event to a specific user if they are connected */
export function emitToUser(userId: string, event: string, data: unknown) {
  const socketId = userSockets.get(userId);
  if (socketId) {
    io.to(socketId).emit(event, data);
  }
}

/**
 * Emit socket event to online user AND send push notification to offline users.
 * push payload is only sent if user has no active socket connection.
 */
export function notifyUser(userId: string, event: string, data: unknown, push: PushPayload) {
  const socketId = userSockets.get(userId);
  if (socketId) {
    io.to(socketId).emit(event, data);
  } else {
    // User is offline — send push notification
    sendPushToUser(userId, push).catch(() => {});
  }
}
