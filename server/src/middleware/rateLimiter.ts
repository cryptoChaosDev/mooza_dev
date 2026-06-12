import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { logSecurity } from '../utils/logger';

/**
 * Skip rate limiting for RFC-2606 reserved `.test` addresses used by the E2E suite.
 * Safe: `*.test` can never resolve to a real mail server, so such accounts can never
 * receive a verification code through normal means — zero real-world abuse vector.
 * Only the dedicated `@moooza.test` domain is exempted (narrow scope).
 */
const isE2ETestEmail = (req: any): boolean => {
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
