import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { logSecurity } from '../utils/logger';

/**
 * Skip rate limiting for RFC-2606 reserved `.test` addresses used by the E2E suite.
 * Only the dedicated `@moooza.test` domain is exempted (narrow scope).
 *
 * ВАЖНО: только вне production. Поле email в теле запроса задаёт сам клиент, так
 * что в проде обход позволял бы брутфорсить вход/коды без лимита (а /login и
 * /verify-email по `x@moooza.test` — это ровно тот же эндпоинт, что и для живых
 * аккаунтов). Проверяем NODE_ENV на каждый запрос, а не при загрузке модуля.
 */
const isE2ETestEmail = (req: any): boolean => {
  if (process.env.NODE_ENV === 'production') return false;
  const email = String(req.body?.email || '').toLowerCase();
  return email.endsWith('@moooza.test');
};

/**
 * Rate limiter для авторизации и регистрации
 * Защита от brute-force атак на /api/auth/login и /api/auth/register
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 попыток с одного IP
  skip: isE2ETestEmail, // @moooza.test addresses bypass — RFC-2606 reserved, used by E2E suite
  message: {
    error: 'Слишком много попыток входа. Пожалуйста, попробуйте позже.',
    retryAfter: '15 минут'
  },
  standardHeaders: true, // Возвращает rate limit info в заголовках `RateLimit-*`
  legacyHeaders: false, // Отключает заголовки `X-RateLimit-*`
  // Обработчик превышения лимита
  handler: (req, res) => {
    logSecurity(`Rate limit exceeded for IP ${req.ip} on auth endpoint`, {
      ip: req.ip,
      url: req.url,
      method: req.method,
    });
    res.status(429).json({
      error: 'Слишком много попыток входа с вашего IP адреса',
      message: 'Пожалуйста, подождите 15 минут перед следующей попыткой',
      retryAfter: '15 minutes'
    });
  },
});

/**
 * Отдельный мягкий лимитер для поллинга входа через Telegram
 * (GET /auth/telegram/poll/:token). Клиент опрашивает его раз в 2.5 с в течение
 * 2 минут (~50 запросов на одну попытку); раньше он делил authLimiter со входом
 * по паролю, и пара попыток через Telegram давала 429 на обычный логин.
 * Поллинг сам по себе безопасен (токен — 96 бит случайности), поэтому лимит
 * щедрый: ~12 попыток за 15 минут с одного IP.
 */
export const tgPollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Слишком много попыток входа через Telegram. Подождите несколько минут.' });
  },
});

/**
 * Общий rate limiter для всех API endpoints
 * Защита от чрезмерного использования API
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5000, // 5000 запросов/15 минут — достаточно для нескольких активных юзеров за NAT
  message: {
    error: 'Слишком много запросов. Пожалуйста, попробуйте позже.',
    retryAfter: '15 минут'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Превышен лимит запросов',
      message: 'Пожалуйста, подождите перед следующей попыткой',
      retryAfter: '15 minutes'
    });
  },
});

/**
 * Rate limiter для регистрации
 * Более строгий лимит для предотвращения создания спам-аккаунтов
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 20, // 20 регистраций/час с одного IP — запас для групповых запусков (офис, вечеринка)
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skip: isE2ETestEmail, // @moooza.test addresses bypass — RFC-2606 reserved, no real abuse vector
  handler: (req, res) => {
    logSecurity(`Register rate limit exceeded for IP ${req.ip}`, { ip: req.ip });
    res.status(429).json({
      error: 'Превышен лимит регистраций',
      message: 'Вы можете зарегистрировать не более 20 аккаунтов в час с одного IP',
      retryAfter: '1 hour'
    });
  },
});

// Strict limiter for code verification — 10 attempts per 15 min.
// Keyed by EMAIL (not just IP): a 6/8-digit code lives against a single email,
// so a distributed attack from many IPs against one address must still share
// one bucket. Falls back to the IPv6-safe IP key when no email is present.
export const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isE2ETestEmail, // @moooza.test addresses bypass — RFC-2606 reserved, used by E2E suite
  keyGenerator: (req: any) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    return email ? `code:${email}` : ipKeyGenerator(req.ip);
  },
  handler: (_req, res) => {
    res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' });
  },
});

/**
 * Limiter for existence-check endpoints (check-email / check-nickname).
 * These leak whether an account exists, so cap enumeration: 60 lookups/min/IP
 * is far above any human signup flow (a person checks a handful) but turns a
 * full-DB sweep from minutes into days. Generous enough for shared/NAT IPs.
 */
export const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Слишком много запросов. Подождите минуту.' });
  },
});

/**
 * Limiter for the public landing waitlist form. A real person submits it once or
 * twice; 10/hour/IP leaves room for shared/NAT IPs while capping spam/abuse.
 */
export const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Слишком много заявок. Попробуйте позже.' });
  },
});

/**
 * Limiter for the support "add a missing profession" request form. A real user
 * submits it rarely; 15/hour (per-user when authed) caps spam while staying generous.
 */
export const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.userId || ipKeyGenerator(req.ip),
  handler: (_req, res) => {
    res.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' });
  },
});

/**
 * Гостевой режим: лимит на публичные GET для НЕавторизованных — 300 запросов
 * за 5 минут с IP. Ставится ПОСЛЕ optionalAuthenticate: авторизованные
 * (req.userId) этим лимитом не считаются (их покрывает общий apiLimiter).
 */
export const guestReadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => !!req.userId,
  handler: (req, res) => {
    logSecurity(`Guest read rate limit exceeded for IP ${req.ip}`, { ip: req.ip, url: req.url });
    res.status(429).json({
      error: 'Слишком много запросов',
      message: 'Подождите несколько минут или войдите в аккаунт.',
      retryAfter: '5 minutes',
    });
  },
});

/**
 * Лимит для SEO-снимков и sitemap (Ф4): 120 запросов в минуту с IP.
 * Подключается к роутеру /seo, когда он появится.
 */
export const seoLimiter = rateLimit({
  windowMs: 60 * 1000,
  // Снимки кэшируются (LRU), так что запрос дешёвый; 120/мин резал обход
  // поисковыми роботами (429 замедляет индексацию). 600/мин ≈ 10 rps с одного IP.
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).type('text/plain').send('Too Many Requests');
  },
});

/**
 * Статистика визитки артиста (POST /api/artists/:id/track, без авторизации):
 * 60 событий в минуту с IP. Живой посетитель шлёт 1 просмотр + несколько
 * переходов; запас — на общий IP мобильного оператора (CGNAT). IP — только в
 * памяти лимитера, в БД не пишется. Превышение — 429 без тела-ошибки для UI
 * (клиент шлёт трекинг «выстрелил и забыл»).
 */
export const artistTrackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Слишком много запросов' });
  },
});

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 120, // 120 сообщений в минуту с одного IP (несколько активных чатов за NAT)
  standardHeaders: true,
  legacyHeaders: false,
  // per-user when authenticated; fall back to IPv6-safe IP key otherwise
  keyGenerator: (req: any) => req.userId || ipKeyGenerator(req.ip),
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Слишком много сообщений',
      message: 'Пожалуйста, не спамьте. Подождите немного.',
    });
  },
});
