import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { initSocket } from './socket';

// Import rate limiters
import { apiLimiter } from './middleware/rateLimiter';

// Import JWT utilities
import { getJwtSecret } from './utils/jwt';
import { initWebPush } from './utils/webpush';

// Import logger
import logger, { morganStream } from './utils/logger';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import postRoutes from './routes/posts';
import friendshipRoutes from './routes/friendships';
import messageRoutes from './routes/messages';
import referenceRoutes from './routes/references';
import adminRoutes from './routes/admin';
import notificationRoutes from './routes/notifications';
import pushRoutes from './routes/push';
import channelRoutes from './routes/channels';
import artistRoutes from './routes/artists';

// Load environment variables
dotenv.config();

// Validate critical environment variables on startup
try {
  getJwtSecret(); // Will throw error if JWT_SECRET is not set
  logger.info('✅ JWT_SECRET is configured');
} catch (error) {
  if (error instanceof Error) {
    logger.error('❌ STARTUP ERROR: ' + error.message);
    logger.error('The application cannot start without JWT_SECRET.');
    process.exit(1);
  }
}

const app = express();
export const prisma = new PrismaClient();

const PORT = process.env.PORT || 4000;

// Trust proxy - необходимо для корректной работы rate limiting в Docker
app.set('trust proxy', 1);

// Gzip compression — reduces response size 3-5x
app.use(compression());

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'"].concat(
        (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean)
      ),
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : null; // null = allow all (JWT auth is the security gate)

app.use(cors({
  origin: (origin, callback) => {
    // Разрешаем запросы без origin (например, из Postman или curl)
    if (!origin) {
      return callback(null, true);
    }

    // Если ALLOWED_ORIGINS не задан — пропускаем всех
    if (!allowedOrigins) {
      return callback(null, true);
    }

    // Проверяем, есть ли origin в whitelist
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`[SECURITY] Blocked CORS request from unauthorized origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400, // 24 часа
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// HTTP request logging через Morgan + Winston
app.use(morgan('combined', { stream: morganStream }));

// Serve static files (avatars)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Health check (без rate limiting)
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/friendships', friendshipRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/references', referenceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/artists', artistRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Логируем детали ошибки
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // В production не показываем детали ошибки
  if (process.env.NODE_ENV === 'production') {
    res.status(err.status || 500).json({
      error: 'Внутренняя ошибка сервера',
      message: 'Произошла непредвиденная ошибка. Пожалуйста, попробуйте позже.',
    });
  } else {
    // В development показываем детали для отладки
    res.status(err.status || 500).json({
      error: err.message || 'Something went wrong',
      stack: err.stack,
      details: err,
    });
  }
});

// Initialize Web Push
initWebPush();

// Start server with Socket.io
const httpServer = initSocket(app);
httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);
  logger.info('🔌 Socket.io enabled');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(async () => {
    await prisma.$disconnect();
    logger.info('HTTP server closed');
  });
});

export default app;
