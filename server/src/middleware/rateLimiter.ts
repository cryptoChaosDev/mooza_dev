import rateLimit from 'express-rate-limit';

/**
 * Rate limiter для авторизации и регистрации
 * Защита от brute-force атак на /api/auth/login и /api/auth/register
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // максимум 5 попыток с одного IP
  message: {
    error: 'Слишком много попыток входа. Пожалуйста, попробуйте позже.',
    retryAfter: '15 минут'
  },
  standardHeaders: true, // Возвращает rate limit info в заголовках `RateLimit-*`
  legacyHeaders: false, // Отключает заголовки `X-RateLimit-*`
  // Обработчик превышения лимита
  handler: (req, res) => {
    console.log(`[SECURITY] Rate limit exceeded for IP ${req.ip} on auth endpoint`);
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
  max: 100, // максимум 100 запросов с одного IP
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
  max: 3, // максимум 3 регистрации с одного IP в час
  message: {
    error: 'Слишком много попыток регистрации. Пожалуйста, попробуйте позже.',
    retryAfter: '1 час'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Считаем все попытки, даже успешные
  handler: (req, res) => {
    res.status(429).json({
      error: 'Превышен лимит регистраций',
      message: 'Вы можете зарегистрировать не более 3 аккаунтов в час с одного IP',
      retryAfter: '1 hour'
    });
  },
});
