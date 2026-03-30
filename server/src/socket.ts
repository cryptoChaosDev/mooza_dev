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

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    userSockets.set(userId, socket.id);
    logger.info(`Socket connected: user=${userId} socket=${socket.id}`);

    socket.on('disconnect', () => {
      userSockets.delete(userId);
      logger.info(`Socket disconnected: user=${userId}`);
    });
  });

  return httpServer;
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
