/**
 * Настройки SEO-снимков (Ф4). Читаются при каждом обращении (не при загрузке
 * модуля) — тесты и аварийное выключение через env работают без перезапуска логики.
 *
 *   SEO_SNAPSHOTS    — снимки включены (по умолчанию ВЫКЛ: /seo/render отдаёт
 *                      шаблон index.html без изменений).
 *   SEO_INDEXABLE    — сайт можно индексировать (по умолчанию false: на всех
 *                      снимках meta robots noindex,nofollow + X-Robots-Tag,
 *                      sitemap — 404). На DEV всегда false.
 *   APP_URL          — origin сайта для абсолютных URL (canonical, og:url, sitemap).
 *   SPA_TEMPLATE_URL — откуда брать собранный index.html (web-контейнер).
 */

const DEFAULT_APP_URL = 'https://moooza.ru';
const DEFAULT_TEMPLATE_URL = 'http://web:3000/index.html';

function envFlag(name: string): boolean {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function seoSnapshotsEnabled(): boolean {
  return envFlag('SEO_SNAPSHOTS');
}

export function seoIndexable(): boolean {
  return envFlag('SEO_INDEXABLE');
}

/** Origin сайта без завершающего слэша; невалидное значение → https://moooza.ru. */
export function appUrl(): string {
  const raw = String(process.env.APP_URL ?? '').trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && u.hostname) return u.origin;
    } catch { /* невалидный APP_URL — дефолт */ }
  }
  return DEFAULT_APP_URL;
}

export function spaTemplateUrl(): string {
  return String(process.env.SPA_TEMPLATE_URL ?? '').trim() || DEFAULT_TEMPLATE_URL;
}

export const SITE_NAME = 'Moooza';

/** Значения meta robots — те же, что у клиента (client/src/lib/seo.ts). */
export const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
export const ROBOTS_NOINDEX = 'noindex, nofollow';
export const ROBOTS_NOINDEX_FOLLOW = 'noindex, follow';
