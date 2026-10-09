import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { initSocket } from './socket';
import { startScheduler } from './scheduler';
import { scheduleYandexMusicSync } from './utils/yandexMusicSync';

// Import rate limiters
import { apiLimiter } from './middleware/rateLimiter';
import { apiRobotsHeaders, legacyOgProfileRedirect } from './middleware/guest';

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
import roleRoutes from './routes/roles';
import adminRoutes from './routes/admin';
import notificationRoutes from './routes/notifications';
import pushRoutes from './routes/push';
import artistRoutes from './routes/artists';
import channelRoutes from './routes/channels';
import connectionRoutes from './routes/connections';
import favoriteRoutes from './routes/favorites';
import groupRoutes from './routes/groups';
import referralRoutes from './routes/referrals';
import siteSettingsRoutes from './routes/site-settings';
import reviewRoutes from './routes/reviews';
import dealRoutes from './routes/deals';
import complaintRoutes from './routes/complaints';
import releaseRoutes from './routes/releases';
import clipRoutes from './routes/clips';
import proRoutes from './routes/pro';
import feedPresetRoutes from './routes/feedPresets';
import waitlistRoutes from './routes/waitlist';
import orderRoutes from './routes/orders';
import vacancyRoutes from './routes/vacancies';
import artistLookupRoutes from './routes/artistLookup';
import supportRoutes from './routes/support';
import requestRoutes from './routes/requests';
import seoRouter from './seo';
import { seoCacheMiddleware } from './seo/cache';
import { artistSlugMiddleware, backfillArtistSlugs } from './lib/artistSlug';

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

// Дублирование уведомлений в Telegram-бот: notification.create разбросан по ~20 местам,
// поэтому единственный надёжный hook — Prisma-middleware. Fire-and-forget (не тормозит ответ).
// Ленивая загрузка утилиты — она импортирует prisma из этого модуля (циклический импорт).
prisma.$use(async (params, next) => {
  const result = await next(params);
  if (params.model === 'Notification' && params.action === 'create' && result) {
    import('./utils/telegramNotify')
      .then(m => m.tgNotifyFromRow(result))
      .catch(() => { /* best-effort */ });
  }
  return result;
});

// Слаги артистов (/artist/:slug): назначение при создании и пересчёт при смене
// имени неверифицированного артиста, прежний слаг → ArtistSlugHistory (301).
prisma.$use(artistSlugMiddleware);
// Кэш SEO-снимков/sitemap: сброс на запись в публичные модели (кроме служебных
// обновлений User вроде lastSeenAt).
prisma.$use(seoCacheMiddleware);

const PORT = process.env.PORT || 4000;

// Trust proxy - необходимо для корректной работы rate limiting в Docker
app.set('trust proxy', 1);

// Gzip compression — reduces response size 3-5x
app.use(compression());

// SEO-снимки и sitemap (Ф4) — ДО helmet: строгий CSP API (script-src 'self')
// не должен попасть на HTML-страницу (инлайн-скрипты index.html). Ответы
// /seo/* — только GET, без авторизации (nginx вырезает Authorization/Cookie).
app.use('/seo', morgan('combined', { stream: morganStream }), seoRouter);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // No 'unsafe-inline' for scripts: the API only ever serves JSON and the OG
      // HTML page (which contains no inline <script>). Removing it means even a
      // future HTML-injection on an API response cannot execute inline JS.
      scriptSrc: ["'self'"],
      // styleSrc keeps 'unsafe-inline' — harmless here and avoids churn.
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

// Serve static files (avatars, portfolio, post media, …).
// Security headers: `nosniff` stops a file with mismatched content (e.g. an
// HTML/SVG payload uploaded as .png) from being sniffed and rendered as markup,
// and the strict CSP + `sandbox` neutralise any active content (scripts inside
// SVG/HTML) if such a file is opened directly. Neither header affects normal
// <img>/<audio> embedding from the SPA.
//
// Индексация: картинки витрины (аватары людей и каналов, баннеры профилей,
// аватары и баннеры артистов) можно индексировать — они в og:image/JSON-LD
// снимков. Всё остальное (портфолио, медиа постов, материалы заказов и
// вакансий, вложения чатов) — X-Robots-Tag: noindex.
const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
const INDEXABLE_UPLOAD_DIRS = ['avatars', 'covers', 'channels', path.join('artists', 'avatars'), path.join('artists', 'banners')];
app.use('/uploads', express.static(UPLOADS_ROOT, {
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    const rel = path.relative(UPLOADS_ROOT, filePath);
    const indexable = INDEXABLE_UPLOAD_DIRS.some((dir) => path.dirname(rel) === dir);
    if (!indexable) res.setHeader('X-Robots-Tag', 'noindex');
  },
}));

// Health check (без rate limiting)
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// API — не страницы для поисковиков: noindex на всех ответах /api/*. Ответы
// зависят от того, кто спрашивает (гость получает урезанную версию), поэтому
// Vary: Authorization — чтобы кэш не отдал гостевой ответ вошедшему и наоборот.
app.use('/api', apiRobotsHeaders);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/friendships', friendshipRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/references', referenceRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/site-settings', siteSettingsRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/releases', releaseRoutes);
app.use('/api/clips', clipRoutes);
app.use('/api/pro', proRoutes);
app.use('/api/feed-presets', feedPresetRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/vacancies', vacancyRoutes);
app.use('/api/artist-lookup', artistLookupRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/requests', requestRoutes);

// ── Старый OG-эндпоинт профиля ─────────────────────────────────────────────
// Раньше отдавал HTML с именем/био/аватаром любого пользователя (ПДн без
// согласия). Теперь — постоянный редирект на страницу профиля: OG/SEO-разметку
// для людей с согласием отдают SEO-снимки (Ф4), для остальных — 404-заглушка.
app.get('/api/og/profile/:userId', legacyOgProfileRedirect);

// Слишком большой файл/тело запроса — понятный 413 вместо «Внутренняя ошибка
// сервера» 500 (MulterError не несёт status). Прочие ошибки multer — 400.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    logger.warn(`Upload rejected: ${err.code} ${req.method} ${req.url}`);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Файл слишком большой', code: err.code });
    }
    return res.status(400).json({ error: 'Не удалось загрузить файл', code: err.code });
  }
  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    logger.warn(`Request entity too large: ${req.method} ${req.url}`);
    return res.status(413).json({ error: 'Слишком большой запрос' });
  }
  next(err);
});

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

  // 4xx (multer/fileFilter, body-parser и т.п.) — это ошибка запроса, её текст
  // нужен пользователю и в production; 5xx — только общий текст.
  const httpStatus = Number(err.status || err.statusCode) || 500;
  const isClientError = httpStatus >= 400 && httpStatus < 500;

  // В production не показываем детали ошибки
  if (process.env.NODE_ENV === 'production') {
    res.status(httpStatus).json(isClientError
      ? { error: err.message || 'Некорректный запрос' }
      : {
          error: 'Внутренняя ошибка сервера',
          message: 'Произошла непредвиденная ошибка. Пожалуйста, попробуйте позже.',
        });
  } else {
    // В development показываем детали для отладки
    res.status(httpStatus).json({
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
  // Start background scheduler (deal timeouts + user unblock)
  startScheduler();
  // Ночной синк с Яндекс.Музыкой (04:30 МСК) — привязанные артисты
  scheduleYandexMusicSync();
  // Страховка: слаг артистам без него (основное заполнение — миграция
  // 20261011010000_seo_artist_slug). Идемпотентно, обычно 0.
  backfillArtistSlugs()
    .then((n) => { if (n > 0) logger.info(`[artistSlug] backfilled slugs for ${n} artist(s)`); })
    .catch((err) => logger.error('[artistSlug] backfill failed', { error: err?.message }));
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
