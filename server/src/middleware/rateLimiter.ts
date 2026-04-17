import rateLimit from 'express-rate-limit';
import { logSecurity } from '../utils/logger';

/**
 * Rate limiter для авторизации и регистрации
 * Защита от brute-force атак на /api/auth/login и /api/auth/register
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 попыток с одного IP
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
  max: 2000, // максимум 2000 запросов с одного IP
  message: {
    error: 'Слишком много запросов. Пожалуйста, попробуйте позже.',
    retryAfter: '15 минут'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
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
  max: 5, // максимум 5 регистраций с одного IP в час
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    logSecurity(`Register rate limit exceeded for IP ${req.ip}`, { ip: req.ip });
    res.status(429).json({
      error: 'Превышен лимит регистраций',
      message: 'Вы можете зарегистрировать не более 5 аккаунтов в час с одного IP',
      retryAfter: '1 hour'
    });
  },
});

// Strict limiter for code verification — 10 attempts per 15 min per IP
export const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' });
  },
});

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 60, // 60 сообщений в минуту
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Слишком много сообщений',
      message: 'Пожалуйста, не спамьте. Подождите немного.',
    });
  },
});
