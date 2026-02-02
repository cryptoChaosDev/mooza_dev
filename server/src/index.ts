import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Import rate limiters
import { apiLimiter } from './middleware/rateLimiter';

// Import JWT utilities
import { getJwtSecret } from './utils/jwt';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import postRoutes from './routes/posts';
import friendshipRoutes from './routes/friendships';
import messageRoutes from './routes/messages';
import referenceRoutes from './routes/references';

// Load environment variables
dotenv.config();

// Validate critical environment variables on startup
try {
  getJwtSecret(); // Will throw error if JWT_SECRET is not set
  console.log('✅ JWT_SECRET is configured');
} catch (error) {
  if (error instanceof Error) {
    console.error('❌ STARTUP ERROR:', error.message);
    console.error('The application cannot start without JWT_SECRET.');
    process.exit(1);
  }
}

const app = express();
export const prisma = new PrismaClient();

const PORT = process.env.PORT || 4000;

// Trust proxy - необходимо для корректной работы rate limiting в Docker
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Разрешаем запросы без origin (например, из Postman или curl)
    if (!origin) {
      return callback(null, true);
    }

    // Проверяем, есть ли origin в whitelist
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[SECURITY] Blocked CORS request from unauthorized origin: ${origin}`);
      callback(null, false); // Отклоняем origin
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400, // 24 часа
}));

app.use(express.json());
app.use(morgan('dev'));

// Serve static files (avatars)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Health check (без rate limiting)
app.get('/health', (req, res) => {
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

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('HTTP server closed');
  });
});

export default app;
