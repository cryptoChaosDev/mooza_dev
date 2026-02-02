import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt';

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Middleware для аутентификации пользователей через JWT
 * Проверяет наличие и валидность токена в заголовке Authorization
 */
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Извлекаем токен из заголовка Authorization
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      return res.status(401).json({
        error: 'Требуется аутентификация',
        message: 'Токен доступа не предоставлен'
      });
    }

    // Проверяем и декодируем токен
    const decoded = verifyToken(token);
    req.userId = decoded.userId;

    next();
  } catch (error) {
    // Обрабатываем различные типы ошибок JWT
    if (error instanceof Error) {
      switch (error.message) {
        case 'TOKEN_EXPIRED':
          return res.status(401).json({
            error: 'Токен истек',
            message: 'Пожалуйста, войдите в систему снова',
            code: 'TOKEN_EXPIRED'
          });

        case 'TOKEN_INVALID':
          return res.status(401).json({
            error: 'Недействительный токен',
            message: 'Токен поврежден или недействителен',
            code: 'TOKEN_INVALID'
          });

        case 'TOKEN_NOT_ACTIVE':
          return res.status(401).json({
            error: 'Токен еще не активен',
            message: 'Токен нельзя использовать в данный момент',
            code: 'TOKEN_NOT_ACTIVE'
          });

        default:
          console.error('[AUTH ERROR]', error.message);
          return res.status(401).json({
            error: 'Ошибка аутентификации',
            message: 'Не удалось проверить токен',
            code: 'AUTH_FAILED'
          });
      }
    }

    return res.status(401).json({
      error: 'Ошибка аутентификации',
      message: 'Неизвестная ошибка при проверке токена'
    });
  }
};
