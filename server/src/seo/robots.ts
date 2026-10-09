/**
 * robots.txt и «легаси»-sitemap для двух режимов индексации.
 *
 * SEO_INDEXABLE=false (по умолчанию, а также при выключенном гостевом режиме) —
 * режим «как сейчас на PROD»: тот же закрытый robots.txt (Allow /, /login,
 * /register, ассеты; Disallow почти всё), sitemap из трёх URL (/, /login,
 * /register). Индексируемыми остаются только эти страницы (+ /privacy, /terms).
 *
 * SEO_INDEXABLE=true — открытый robots.txt плана (раздел E) и полный sitemap.
 *
 * nginx web проксирует /robots.txt сюда; если api недоступен, отдаёт статический
 * client/public/robots.txt — он ДОЛЖЕН совпадать с LEGACY_ROBOTS_TXT (проверяет тест).
 */

import { appUrl } from './config';
import { escapeXml } from './html';

/** Текущий (закрытый) robots.txt PROD — побайтно как client/public/robots.txt. */
export const LEGACY_ROBOTS_TXT = [
  'User-agent: *',
  'Allow: /$',
  'Allow: /login',
  'Allow: /register',
  'Allow: /assets/',
  'Allow: /favicon.png',
  'Allow: /apple-touch-icon.png',
  'Allow: /icon.svg',
  'Allow: /logo.png',
  'Allow: /logo.jpg',
  'Allow: /pwa-192x192.png',
  'Allow: /pwa-512x512.png',
  '',
  'Disallow: /messages',
  'Disallow: /chat',
  'Disallow: /profile',
  'Disallow: /profile/',
  'Disallow: /search',
  'Disallow: /friends',
  'Disallow: /deals',
  'Disallow: /create-post',
  'Disallow: /flow-settings',
  'Disallow: /invite',
  'Disallow: /pro',
  'Disallow: /onboarding',
  'Disallow: /connection',
  'Disallow: /connections',
  'Disallow: /artist',
  'Disallow: /releases',
  'Disallow: /clips',
  'Disallow: /services',
  'Disallow: /vk-setup',
  'Disallow: /admin',
  '',
  'Host: moooza.ru',
  'Sitemap: https://moooza.ru/sitemap.xml',
  '',
].join('\n');

/**
 * Открытый robots.txt (план, раздел E): приватное закрыто, публичное открыто,
 * Clean-param для меток и фильтров, без Host. AI-краулеры (GPTBot, ClaudeBot,
 * PerplexityBot и др.) разрешены — решение владельца от 2026-10-09.
 */
export function openRobotsTxt(): string {
  return [
    '# Moooza — robots.txt (план «Moooza доступна без регистрации», раздел E).',
    '# Публичные страницы (артисты, релизы, клипы, профили с согласием, услуги,',
    '# заказы, вакансии, лента, каталог) открыты; приватные разделы закрыты.',
    '# /api/ и /uploads/ не закрываем: их ответы помечены X-Robots-Tag: noindex',
    '# (кроме аватаров и обложек), иначе робот не увидит картинки страниц.',
    '# AI-краулеры разрешены (решение владельца от 2026-10-09).',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# Личное и действия — только после входа',
    'Disallow: /messages',
    'Disallow: /chat',
    'Disallow: /friends',
    'Disallow: /connection',
    'Disallow: /deals',
    'Disallow: /create-post',
    'Disallow: /invite',
    'Disallow: /settings',
    'Disallow: /pro$',
    'Disallow: /pro?',
    'Disallow: /admin',
    'Disallow: /onboarding',
    'Disallow: /vk-setup',
    'Disallow: /register',
    'Disallow: /forgot-password',
    'Disallow: /profile$',
    'Disallow: /profile?',
    'Disallow: /profile/*/connections',
    '',
    '# Формы создания и редактирования',
    'Disallow: /artist/create',
    'Disallow: /artist/*/edit',
    'Disallow: /artist/*/releases/new',
    'Disallow: /artist/*/clips/new',
    'Disallow: /artist/*/vacancies/new',
    'Disallow: /artist/*/members/',
    'Disallow: /artist/*/invite',
    'Disallow: /artist/*/contacts',
    'Disallow: /artist/*/genres',
    'Disallow: /artists/',
    'Disallow: /services/new',
    'Disallow: /services/edit/',
    'Disallow: /orders$',
    'Disallow: /orders?',
    'Disallow: /orders/new',
    'Disallow: /orders/edit/',
    'Disallow: /professions/new',
    'Disallow: /professions/edit/',
    'Disallow: /lineups/new',
    'Disallow: /lineups/*/edit',
    '',
    '# Яндекс: параметры, не меняющие содержимое страницы',
    'Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&utm_referrer',
    'Clean-param: yclid&gclid&fbclid&ysclid&_openstat&openstat&from&ref',
    'Clean-param: post /feed',
    'Clean-param: q&city&genre&type&sort&section&service&profession&price&priceFrom&priceTo&page /search',
    '',
    `Sitemap: ${appUrl()}/sitemap.xml`,
    '',
  ].join('\n');
}

/** Страницы, индексируемые в легаси-режиме (как сейчас на PROD). */
export const LEGACY_INDEXABLE_PATHS: ReadonlySet<string> = new Set(['/', '/privacy', '/terms', '/login', '/register']);

/** Страницы входа: в открытом режиме — noindex (матрица маршрутов), в легаси — как сейчас. */
export const AUTH_PAGE_PATHS: ReadonlySet<string> = new Set(['/login', '/register']);

const LEGACY_SITEMAP_URLS: ReadonlyArray<{ path: string; changefreq: string; priority: string }> = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/login', changefreq: 'monthly', priority: '0.5' },
  { path: '/register', changefreq: 'monthly', priority: '0.7' },
];

/** Легаси-sitemap — тот же набор, что был статическим client/public/sitemap.xml. */
export function legacySitemapXml(): string {
  const origin = appUrl();
  const urls = LEGACY_SITEMAP_URLS.map((u) => [
    '  <url>',
    `    <loc>${escapeXml(`${origin}${u.path}`)}</loc>`,
    '    <lastmod>2026-06-04</lastmod>',
    `    <changefreq>${u.changefreq}</changefreq>`,
    `    <priority>${u.priority}</priority>`,
    '  </url>',
  ].join('\n'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
