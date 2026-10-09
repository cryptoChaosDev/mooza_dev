/**
 * SEO-роутер (Ф4, план раздел D). Подключается в index.ts ДО helmet — CSP
 * helmet'а для API (script-src 'self') сломал бы инлайн-скрипты index.html.
 *
 *   GET /seo/render/<путь>?<query> — снимок страницы (nginx web-контейнера
 *       проксирует сюда публичные пути; Authorization/Cookie вырезаны, поэтому
 *       ответ одинаков для всех и не зависит от входа);
 *   GET /seo/sitemap.xml, /seo/sitemap-<тип>[-N].xml — динамический sitemap;
 *   GET /seo/robots.txt — robots.txt по режиму (nginx: /robots.txt).
 *
 * Выключатели (seo/config): SEO_SNAPSHOTS=off → шаблон без изменений.
 * Режим индексации: «открытый» = SEO_INDEXABLE=true И guestBrowsingEnabled.
 * Иначе — ЛЕГАСИ-режим, в точности как сейчас на PROD: индексируются только
 * /, /privacy, /terms, /login, /register (без noindex), остальные публичные
 * страницы — noindex (meta + X-Robots-Tag), robots.txt — прежний закрытый,
 * /sitemap.xml — прежние 3 URL (seo/robots.ts).
 * guestBrowsingEnabled=false (аварийный выключатель гостевого режима) ещё и
 * выключает снимки: гость контент не видит — снимков нет.
 * Любая ошибка рендера → 503: nginx отдаёт обычный index.html (SPA работает).
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { seoLimiter } from '../middleware/rateLimiter';
import { onPublicDataChanged } from '../lib/publicData';
import { isGuestBrowsingEnabled } from '../routes/site-settings';
import logger from '../utils/logger';
import { seoSnapshotsEnabled, seoIndexable, ROBOTS_NOINDEX } from './config';
import { getTemplate, applyTemplate } from './template';
import { cached, invalidateSeoCache } from './cache';
import { resolveSeoRoute } from './routes';
import { renderSitemapIndex, renderSitemapChunk, isSitemapType } from './sitemap';
import { LEGACY_ROBOTS_TXT, LEGACY_INDEXABLE_PATHS, AUTH_PAGE_PATHS, openRobotsTxt, legacySitemapXml } from './robots';
import type { SeoResolution } from './routes';
import type { RenderOutcome } from './render/common';

// Выдача/отзыв согласия, запрет индексации и т.п. — сразу сбрасываем снимки и sitemap.
onPublicDataChanged(() => invalidateSeoCache('publicData'));

const router = Router();

router.use(seoLimiter);

function etagOf(body: string): string {
  return `W/"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 27)}"`;
}

function sendBody(res: Response, status: number, body: string, contentType: string, lastModified: Date | null) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('ETag', etagOf(body));
  if (lastModified && !Number.isNaN(lastModified.getTime())) res.setHeader('Last-Modified', lastModified.toUTCString());
  // res.send сам отвечает 304 на If-None-Match / If-Modified-Since (только для 2xx).
  return res.status(status).send(body);
}

const HTML = 'text/html; charset=utf-8';

function unavailable(res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).type('text/plain').send('Service Unavailable');
}

/** Открытый режим индексации: SEO_INDEXABLE=true и гостевой режим включён. */
async function fullIndexing(): Promise<boolean> {
  return seoIndexable() && (await isGuestBrowsingEnabled());
}

/**
 * X-Robots-Tag для ответа снимка/шаблона (null — без заголовка).
 *   - приватный подпуть — noindex, nofollow всегда;
 *   - легаси-режим: /, /privacy, /terms, /login, /register — без заголовка
 *     (как сейчас на PROD), остальное — noindex, nofollow;
 *   - открытый режим: /login, /register — noindex, nofollow (матрица маршрутов),
 *     прочие пути вне таблицы — noindex, неиндексируемая сущность — noindex.
 */
export function robotsHeaderFor(
  path: string,
  resolution: SeoResolution,
  full: boolean,
  outcome?: RenderOutcome,
): string | null {
  if (resolution.type === 'private') return ROBOTS_NOINDEX;
  if (!full) {
    const ok = LEGACY_INDEXABLE_PATHS.has(path) && (!outcome || outcome.kind !== 'snapshot' || outcome.status === 200);
    return ok ? null : ROBOTS_NOINDEX;
  }
  if (AUTH_PAGE_PATHS.has(path)) return ROBOTS_NOINDEX;
  if (resolution.type === 'unknown') return 'noindex';
  if (outcome && outcome.kind === 'snapshot' && !outcome.indexable) return 'noindex';
  return null;
}

function setRobots(res: Response, value: string | null) {
  if (value) res.setHeader('X-Robots-Tag', value);
}

// ── Снимки ──────────────────────────────────────────────────────────────────

router.get(/^\/render(?:\/.*)?$/, async (req: Request, res: Response) => {
  const url = new URL(req.url, 'http://seo.local');
  const path = url.pathname.slice('/render'.length) || '/';
  const guestBrowsing = await isGuestBrowsingEnabled();
  const full = seoIndexable() && guestBrowsing;

  let template: string;
  try {
    template = await getTemplate();
  } catch (err) {
    logger.error('[seo] SPA template unavailable', { error: (err as Error)?.message });
    return unavailable(res);
  }

  const resolution = resolveSeoRoute(path, url.searchParams, full ? 'i' : 'n');

  // Снимки выключены — шаблон как есть (meta robots шаблона: index, follow);
  // noindex — заголовком по режиму (robotsHeaderFor).
  if (!seoSnapshotsEnabled() || !guestBrowsing) {
    setRobots(res, robotsHeaderFor(path, resolution, full));
    return sendBody(res, 200, template, HTML, null);
  }

  // Хвостовой слэш → 301 на адрес без него (query сохраняется).
  if (path.length > 1 && path.endsWith('/')) {
    return res.redirect(301, `${path.replace(/\/+$/, '') || '/'}${url.search}`);
  }

  if (resolution.type !== 'route') {
    setRobots(res, robotsHeaderFor(path, resolution, full));
    return sendBody(res, 200, template, HTML, null);
  }

  let outcome: RenderOutcome;
  try {
    outcome = await cached(resolution.match.cacheKey, resolution.match.ttlMs, resolution.match.render);
  } catch (err) {
    logger.error('[seo] render failed', { path, error: (err as Error)?.message, stack: (err as Error)?.stack });
    return unavailable(res);
  }

  if (outcome.kind === 'redirect') {
    return res.redirect(301, `${outcome.location}${url.search}`);
  }

  setRobots(res, robotsHeaderFor(path, resolution, full, outcome));
  const html = applyTemplate(template, outcome.head, outcome.body);
  return sendBody(res, outcome.status, html, HTML, outcome.lastModified);
});

// ── Sitemap ─────────────────────────────────────────────────────────────────

const SITEMAP_RE = /^\/sitemap(?:-([a-z]+)(?:-([1-9]\d{0,3}))?)?\.xml$/;

const XML = 'application/xml; charset=utf-8';

router.get(SITEMAP_RE, async (req: Request, res: Response) => {
  res.setHeader('X-Robots-Tag', 'noindex');
  const notFound = () => res.status(404).type('text/plain').send('Not Found');
  // Легаси-режим: прежний sitemap из трёх URL, дочерних файлов нет.
  if (!(await fullIndexing())) {
    return req.path === '/sitemap.xml' ? sendBody(res, 200, legacySitemapXml(), XML, null) : notFound();
  }
  const m = SITEMAP_RE.exec(req.path);
  if (!m) return notFound();
  const [, type, pageRaw] = m;
  if (type && !isSitemapType(type)) return notFound();
  if (!type && pageRaw) return notFound();
  const page = pageRaw ? Number(pageRaw) : 1;
  if (pageRaw === '1') return notFound(); // первая страница — без номера (без дублей)
  try {
    const xml = type && isSitemapType(type) ? await renderSitemapChunk(type, page) : await renderSitemapIndex();
    if (xml === null) return notFound();
    return sendBody(res, 200, xml, XML, null);
  } catch (err) {
    logger.error('[seo] sitemap failed', { path: req.path, error: (err as Error)?.message });
    return unavailable(res);
  }
});

// ── robots.txt ──────────────────────────────────────────────────────────────
// Открытый режим — robots.txt плана; иначе — прежний закрытый (как на PROD).
// При недоступности api nginx отдаёт статический client/public/robots.txt (= легаси).

router.get('/robots.txt', async (_req: Request, res: Response) => {
  const body = (await fullIndexing()) ? openRobotsTxt() : LEGACY_ROBOTS_TXT;
  return sendBody(res, 200, body, 'text/plain; charset=utf-8', null);
});

router.use((_req: Request, res: Response) => res.status(404).type('text/plain').send('Not Found'));

export default router;
