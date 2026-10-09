import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt';
import { prisma } from '../index';

export interface AuthRequest extends Request {
  userId?: string;
}

// ── Кэш состояния пользователя для optionalAuthenticate ─────────────────────
// optionalAuthenticate висит на публичных GET (профили, лента, артисты…), которые
// теперь открыты гостям — без кэша каждый такой запрос авторизованного ходил бы
// в БД. Кэшируем ровно те поля, что проверяет authenticate, на ~60 с.
type AuthState = { passwordChangedAt: Date | null; isBlocked: boolean; blockedUntil: Date | null } | null;
const AUTH_CACHE_TTL_MS = 60 * 1000;
const AUTH_CACHE_MAX = 5000;
const authStateCache = new Map<string, { at: number; state: AuthState }>();

async function loadAuthState(userId: string): Promise<AuthState> {
  const now = Date.now();
  const hit = authStateCache.get(userId);
  if (hit && now - hit.at < AUTH_CACHE_TTL_MS) return hit.state;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordChangedAt: true, isBlocked: true, blockedUntil: true },
  });
  const state: AuthState = user
    ? { passwordChangedAt: user.passwordChangedAt ?? null, isBlocked: !!user.isBlocked, blockedUntil: user.blockedUntil ?? null }
    : null;
  if (authStateCache.size >= AUTH_CACHE_MAX) authStateCache.clear();
  authStateCache.set(userId, { at: now, state });
  return state;
}

/** Сбросить кэш optionalAuthenticate (после блокировки / смены пароля / в тестах). */
export function invalidateAuthCache(userId?: string) {
  if (userId) authStateCache.delete(userId);
  else authStateCache.clear();
}

/**
 * Те же правила, что в authenticate: несуществующий пользователь, активная
 * блокировка (blockedUntil в будущем или isBlocked без истёкшего срока) и токен,
 * выданный до смены пароля, — недействительны.
 */
function isTokenUsable(state: AuthState, iat: number): boolean {
  if (!state) return false;
  const now = Date.now();
  if (state.blockedUntil) {
    if (new Date(state.blockedUntil).getTime() >= now) return false;
    // срок блокировки истёк — authenticate сам снимет isBlocked при первом запросе
  } else if (state.isBlocked) {
    return false;
  }
  if (state.passwordChangedAt && iat < Math.floor(new Date(state.passwordChangedAt).getTime() / 1000)) {
    return false;
  }
  return true;
}

/**
 * Optional auth — ставит req.userId, если токен валиден И пользователь проходит
 * ту же проверку в БД, что и в authenticate (блокировка, смена пароля).
 * Невалидный/просроченный токен или заблокированный пользователь — запрос
 * продолжается как гостевой (без 401): гостевая ветка обработчика отдаст
 * публичную версию данных.
 */
export const optionalAuthenticate = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    if (token) {
      const decoded = verifyToken(token);
      const state = await loadAuthState(decoded.userId);
      if (isTokenUsable(state, decoded.iat)) req.userId = decoded.userId;
    }
  } catch {
    // ignore — продолжаем как гость
  }
  next();
};

/**
 * Middleware для аутентификации пользователей через JWT
 * Проверяет наличие и валидность токена в заголовке Authorization
 */
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    // Если пароль менялся после выдачи токена — токен недействителен
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, passwordChangedAt: true, isBlocked: true, blockedUntil: true },
    });
    if (!user) {
      return res.status(401).json({ error: 'Токен недействителен', code: 'TOKEN_INVALID' });
    }

    // If blockedUntil has passed — auto-unblock
    if (user.blockedUntil && new Date(user.blockedUntil) < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { blockedUntil: null, isBlocked: false },
      });
    } else if (user.blockedUntil && new Date(user.blockedUntil) >= new Date()) {
      return res.status(403).json({ error: `Account blocked until ${user.blockedUntil}` });
    }

    if (user.isBlocked) {
      return res.status(401).json({ error: 'Токен недействителен', code: 'TOKEN_INVALID' });
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
      message: 'Неизвестная ошибка при проверке токена'
    });
  }
};
