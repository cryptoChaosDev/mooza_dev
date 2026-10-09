import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt';
import { prisma } from '../index';

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Middleware для аутентификации пользователей через JWT
 * Проверяет наличие и валидность токена в заголовке Authorization
 */
// Optional auth — sets userId if token present, continues without it
export const optionalAuthenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    if (token) {
      const decoded = verifyToken(token);
      req.userId = decoded.userId;
    }
  } catch {
    // ignore — unauthenticated access allowed
  }
  next();
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Извлекаем токен из заголовка Authorization
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      return res.status(401).json({
        error: 'Требуется аутентификация',
        message: 'Токен доступа не предоставлен',
        code: 'TOKEN_MISSING'
      });
    }

    // Проверяем и декодируем токен
    const decoded = verifyToken(token);

    // Если пароль менялся после выдачи токена — токен недействителен
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, passwordChangedAt: true, isBlocked: true, blockedUntil: true },
    });
    if (!user) {
      return res.status(401).json({ error: 'Токен недействителен', code: 'TOKEN_INVALID' });
    }

    // Блокировки (правило согласовано с модерацией):
    //  • isBlocked=true — бессрочная админская блокировка, снимает ТОЛЬКО админ;
    //  • blockedUntil>now — временная блокировка (жалобы / срочная админская).
    // Автоснятие по истечении чистит ТОЛЬКО blockedUntil и никогда не трогает
    // isBlocked — иначе постоянный бан «сгорал» после временного (4 жалобы).
    const blockMsg = accountBlockMessage(user);
    if (blockMsg) {
      return res.status(403).json({ error: blockMsg, code: 'ACCOUNT_BLOCKED' });
    }
    if (user.blockedUntil) {
      // Срок истёк — подчищаем поле. Условие blockedUntil<now в where защищает
      // от гонки с админом, который в этот момент ставит новую блокировку.
      prisma.user.updateMany({
        where: { id: user.id, blockedUntil: { lt: new Date() } },
        data: { blockedUntil: null },
      }).catch(() => {});
    }
    if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      return res.status(401).json({ error: 'Пароль был изменён. Войдите заново.', code: 'TOKEN_INVALID' });
    }

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
      message: 'Неизвестная ошибка при проверке токена',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * Сообщение о блокировке аккаунта или null, если вход разрешён.
 * Общая проверка для authenticate и для всех точек входа (/auth/login, Telegram, VK).
 */
export function accountBlockMessage(user: { isBlocked?: boolean | null; blockedUntil?: Date | string | null }): string | null {
  if (user.isBlocked) return 'Аккаунт заблокирован. Обратитесь в поддержку.';
  if (user.blockedUntil) {
    const until = new Date(user.blockedUntil);
    if (until.getTime() > Date.now()) {
      const fmt = until.toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      return `Аккаунт временно заблокирован до ${fmt} (МСК). Обратитесь в поддержку.`;
    }
  }
  return null;
}
