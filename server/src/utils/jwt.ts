import jwt from 'jsonwebtoken';

/**
 * Получает JWT секрет из переменных окружения
 * Бросает ошибку, если секрет не установлен
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'CRITICAL SECURITY ERROR: JWT_SECRET is not defined in environment variables. ' +
      'The application cannot start without a secure JWT secret. ' +
      'Please set JWT_SECRET in your .env file.'
    );
  }

  // Проверка минимальной длины секрета (для безопасности)
  if (secret.length < 32) {
    console.warn(
      '[SECURITY WARNING] JWT_SECRET is too short. ' +
      'For production, use a secret with at least 32 characters.'
    );
  }

  return secret;
}

/**
 * Генерирует JWT токен
 * @param payload - Данные для включения в токен
 * @param expiresIn - Время жизни токена (по умолчанию 7 дней)
 */
export function generateToken(payload: { userId: string }, expiresIn: number = 60 * 60 * 24 * 7): string {
  return jwt.sign(
    payload,
    getJwtSecret(),
    {
      expiresIn,
      algorithm: 'HS256',
    }
  );
}

/**
 * Проверяет и декодирует JWT токен
 * @param token - JWT токен для проверки
 * @returns Декодированные данные токена
 * @throws Error если токен невалидный или истек
 */
export function verifyToken(token: string): { userId: string } {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'], // Принимаем только HS256
    }) as { userId: string };

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('TOKEN_EXPIRED');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('TOKEN_INVALID');
    } else if (error instanceof jwt.NotBeforeError) {
      throw new Error('TOKEN_NOT_ACTIVE');
    } else {
      throw new Error('TOKEN_VERIFICATION_FAILED');
    }
  }
}

/**
 * Извлекает токен из заголовка Authorization
 * @param authHeader - Значение заголовка Authorization
 * @returns Токен или null
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  // Поддерживаем формат "Bearer <token>"
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
