import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { isGuestBrowsingEnabled } from '../routes/site-settings';
import type { PublicResult } from '../lib/publicData';

/**
 * Для эндпоинтов, которые ДО гостевого режима требовали входа (authenticate),
 * а теперь стоят на optionalAuthenticate: если гость и guestBrowsingEnabled
 * выключен — отвечаем как раньше authenticate (401). Авторизованных пропускает.
 */
export async function requireAuthUnlessGuestBrowsing(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userId) return next();
  if (await isGuestBrowsingEnabled()) return next();
  return res.status(401).json({
    error: 'Требуется аутентификация',
    message: 'Токен доступа не предоставлен',
  });
}

/**
 * Заголовки гостевого JSON: `no-cache` (браузер всегда ревалидирует по ETag —
 * без `public, max-age`, иначе после входа отдастся закэшированная гостевая
 * версия) и `Vary: Authorization` (один URL — разный ответ гостю и вошедшему).
 */
export function setGuestCacheHeaders(res: Response) {
  res.setHeader('Cache-Control', 'no-cache');
  res.vary('Authorization');
}

/**
 * Отдать результат загрузчика из lib/publicData:
 *   not_found → 404 (одинаковое тело для «нет», «скрыто», «без согласия»);
 *   ok / noindex → 200 + data (+ Last-Modified, если известен).
 */
export function sendPublic<T>(res: Response, result: PublicResult<T>, notFoundMessage = 'Не найдено') {
  setGuestCacheHeaders(res);
  if (result.status === 'not_found') {
    return res.status(404).json({ error: notFoundMessage });
  }
  if (result.lastModified) res.setHeader('Last-Modified', result.lastModified.toUTCString());
  return res.json(result.data);
}

/**
 * Для всех ответов /api/*: `X-Robots-Tag: noindex` (API — не страницы для
 * поисковиков) и `Vary: Authorization` (гость и вошедший получают разное).
 */
export function apiRobotsHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Robots-Tag', 'noindex');
  res.vary('Authorization');
  next();
}

/** GET /api/og/profile/:userId → 301 на страницу профиля (старый OG-эндпоинт отдавал ПДн). */
export function legacyOgProfileRedirect(req: Request, res: Response) {
  res.redirect(301, `/profile/${encodeURIComponent(req.params.userId)}`);
}
