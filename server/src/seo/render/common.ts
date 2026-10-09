/**
 * Общая сборка SEO-снимка: head (title, description, canonical, robots, OG,
 * Twitter, JSON-LD, стили .ssr-*) и тело <div data-ssr> (крошки, h1, факты,
 * описание, ссылки). Тело одно и то же для роботов и людей (не клоакинг):
 * React (createRoot) заменяет его при первом рендере, вошедшему оно скрыто
 * классом .authed из index.html.
 */

import {
  appUrl, seoIndexable, SITE_NAME, ROBOTS_INDEX, ROBOTS_NOINDEX,
} from '../config';
import { escapeHtml, jsonForScript, absUrl } from '../html';
import { breadcrumbList, graph, Crumb } from '../jsonld';

export type RenderOutcome =
  | {
      kind: 'snapshot';
      status: 200 | 404;
      /** Можно индексировать (с учётом статуса сущности; env учитывается отдельно). */
      indexable: boolean;
      lastModified: Date | null;
      head: string;
      body: string;
    }
  | { kind: 'redirect'; location: string };

/** Дефолтная картинка для og:image — существующий логотип 512×512. */
// TODO(seo): нарисовать og-default.png 1200×630 (план, раздел D) и подставить сюда.
export const DEFAULT_OG_IMAGE = { path: '/pwa-512x512.png', width: 512, height: 512 };

export const DEFAULT_DESCRIPTION =
  'Moooza — социальная сеть для музыкантов: находите коллег, заказчиков и исполнителей, создавайте проекты и стройте карьеру в музыкальной индустрии.';

/** «Часть — часть | Moooza» — как seoTitle на клиенте. */
export function pageTitle(...parts: Array<string | null | undefined | false>): string {
  const body = parts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean).join(' — ');
  return body ? `${body} | ${SITE_NAME}` : `${SITE_NAME} — Музыкальная социальная сеть`;
}

/** Абсолютный URL страницы сайта по пути. */
export function siteUrl(path: string): string {
  return absUrl(path) ?? `${appUrl()}/`;
}

const SSR_STYLE = [
  '.ssr{max-width:720px;margin:0 auto;padding:16px 16px 48px;color:#e2e8f0;font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere}',
  '.ssr a{color:#a5b4fc}',
  '.ssr-crumbs{font-size:13px;color:#94a3b8;margin:0 0 12px}',
  '.ssr-crumbs a{color:#94a3b8;text-decoration:none}',
  '.ssr-sep{margin:0 6px}',
  '.ssr h1{font-size:24px;line-height:1.25;margin:8px 0 12px;color:#fff}',
  '.ssr h2{font-size:17px;line-height:1.3;margin:24px 0 8px;color:#fff}',
  '.ssr-img{display:block;width:160px;height:160px;object-fit:cover;border-radius:16px;margin:0 0 16px;background:#1e293b}',
  '.ssr-facts{list-style:none;padding:0;margin:0 0 12px;color:#cbd5e1}',
  '.ssr-facts li{margin:2px 0}',
  '.ssr-facts b{color:#94a3b8;font-weight:500}',
  '.ssr-desc{white-space:pre-line;color:#cbd5e1;margin:0 0 12px}',
  '.ssr-list{padding-left:20px;margin:0 0 12px}',
  '.ssr-list li{margin:4px 0}',
  '.ssr-note{color:#94a3b8;font-size:13px}',
].join('');

export interface PageSpec {
  status?: 200 | 404;
  title: string;
  description: string;
  /** Путь канонического адреса (/artist/slug) — без query, кроме /search?tab=. */
  canonicalPath: string | null;
  /** Индексируемость сущности (закрытый заказ → false). */
  indexable: boolean;
  /** Явное значение robots для индексируемого env (например, noindex,follow для /search?q=). */
  robots?: string;
  ogType?: string;
  /** Абсолютный URL картинки (ogImageUrl) или null → логотип. */
  image?: string | null;
  imageAlt?: string;
  /** JSON-LD сущности страницы (без @context); BreadcrumbList добавляется сам. */
  jsonLd?: Array<Record<string, unknown> | null | undefined>;
  crumbs: Crumb[];
  /** Внутренности <div data-ssr> после крошек (h1 и т.д.) — уже экранированный HTML. */
  bodyHtml: string;
  lastModified?: Date | null;
}

function crumbsHtml(crumbs: Crumb[]): string {
  if (crumbs.length < 2) return '';
  const parts = crumbs.map((c, i) => {
    const last = i === crumbs.length - 1;
    if (last) return `<span aria-current="page">${escapeHtml(c.name)}</span>`;
    if (!c.url) return `<span>${escapeHtml(c.name)}</span>`;
    return `<a href="${escapeHtml(c.url)}">${escapeHtml(c.name)}</a>`;
  });
  return `<nav class="ssr-crumbs" aria-label="Навигация">${parts.join('<span class="ssr-sep" aria-hidden="true">›</span>')}</nav>`;
}

/** Итоговое значение meta robots с учётом SEO_INDEXABLE. */
export function effectiveRobots(spec: { indexable: boolean; robots?: string; status?: number }): string {
  if (!seoIndexable() || spec.status === 404) return ROBOTS_NOINDEX;
  if (!spec.indexable) return ROBOTS_NOINDEX;
  return spec.robots ?? ROBOTS_INDEX;
}

export function buildSnapshot(spec: PageSpec): RenderOutcome {
  const status = spec.status ?? 200;
  const robots = effectiveRobots({ indexable: spec.indexable, robots: spec.robots, status });
  const canonical = spec.canonicalPath ? siteUrl(spec.canonicalPath) : null;
  const image = spec.image ?? siteUrl(DEFAULT_OG_IMAGE.path);
  const isDefaultImage = !spec.image;
  // В JSON-LD — абсолютные адреса, в HTML — пути от корня (как остальные ссылки).
  const ldCrumbs = spec.crumbs.map((c) => ({ ...c, url: c.url ? siteUrl(c.url) : null }));

  const ld = graph(...(spec.jsonLd ?? []), breadcrumbList(ldCrumbs));
  const hasLd = Array.isArray(ld['@graph']) && (ld['@graph'] as unknown[]).length > 0;

  const meta: string[] = [
    `<meta name="description" content="${escapeHtml(spec.description)}" />`,
    `<title>${escapeHtml(spec.title)}</title>`,
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : '',
    `<meta name="robots" content="${escapeHtml(robots)}" />`,
    `<meta property="og:type" content="${escapeHtml(spec.ogType ?? 'website')}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escapeHtml(spec.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(spec.description)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    isDefaultImage ? `<meta property="og:image:width" content="${DEFAULT_OG_IMAGE.width}" />` : '',
    isDefaultImage ? `<meta property="og:image:height" content="${DEFAULT_OG_IMAGE.height}" />` : '',
    `<meta property="og:image:alt" content="${escapeHtml(spec.imageAlt ?? spec.title)}" />`,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : '',
    `<meta property="og:locale" content="ru_RU" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(spec.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(spec.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    hasLd ? `<script type="application/ld+json">${jsonForScript(ld)}</script>` : '',
    `<style>${SSR_STYLE}</style>`,
  ];

  const body = `<div data-ssr class="ssr">${crumbsHtml(spec.crumbs)}${spec.bodyHtml}</div>`;
  return {
    kind: 'snapshot',
    status,
    indexable: status === 200 && spec.indexable,
    lastModified: spec.lastModified ?? null,
    head: `\n    ${meta.filter(Boolean).join('\n    ')}\n    `,
    body,
  };
}

// ── Кирпичики тела ──────────────────────────────────────────────────────────

export function h1(text: string): string {
  return `<h1>${escapeHtml(text)}</h1>`;
}

export function h2(text: string): string {
  return `<h2>${escapeHtml(text)}</h2>`;
}

export function para(text: string | null | undefined, cls = 'ssr-desc'): string {
  return text ? `<p class="${cls}">${escapeHtml(text)}</p>` : '';
}

export function facts(rows: Array<[string, string | null | undefined | false]>): string {
  const items = rows
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => `<li><b>${escapeHtml(k)}:</b> ${escapeHtml(v as string)}</li>`);
  return items.length ? `<ul class="ssr-facts">${items.join('')}</ul>` : '';
}

export interface LinkItem { href: string; text: string; note?: string | null }

export function linkList(title: string | null, items: LinkItem[], opts: { external?: boolean } = {}): string {
  const lis = items
    .filter((it) => it.href && it.text)
    .map((it) => {
      const rel = opts.external ? ' rel="nofollow noopener" target="_blank"' : '';
      const note = it.note ? ` <span class="ssr-note">${escapeHtml(it.note)}</span>` : '';
      return `<li><a href="${escapeHtml(it.href)}"${rel}>${escapeHtml(it.text)}</a>${note}</li>`;
    });
  if (!lis.length) return '';
  return `${title ? h2(title) : ''}<ul class="ssr-list">${lis.join('')}</ul>`;
}

export function image(src: string | null, alt: string): string {
  if (!src) return '';
  return `<img class="ssr-img" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="160" height="160" loading="lazy" decoding="async" />`;
}

// ── Общие страницы ──────────────────────────────────────────────────────────

/** 404: одно и то же тело для «нет», «скрыто», «без согласия» (профили неотличимы). */
export function notFoundSnapshot(): RenderOutcome {
  return buildSnapshot({
    status: 404,
    title: pageTitle('Страница не найдена'),
    description: 'Страница не найдена или скрыта. Откройте ленту или каталог Moooza.',
    canonicalPath: null,
    indexable: false,
    crumbs: [{ name: SITE_NAME, url: '/' }, { name: 'Страница не найдена' }],
    bodyHtml:
      h1('Страница не найдена')
      + para('Возможно, её удалили или автор ограничил доступ.')
      + linkList(null, [
        { href: '/feed', text: 'Лента Moooza' },
        { href: '/search', text: 'Каталог услуг' },
        { href: '/search?tab=artists', text: 'Артисты и группы' },
      ]),
  });
}

/** Человек для текста: публичный — имя, обезличенный — подпись из publicData. */
export function personLabel(p: { displayName?: string | null } | null | undefined, fallback: string): string {
  return (p?.displayName || '').trim() || fallback;
}

export function profilePath(id: string): string {
  return `/profile/${encodeURIComponent(id)}`;
}

export function artistPathOf(a: { id: string; slug?: string | null }): string {
  return `/artist/${encodeURIComponent(a.slug || a.id)}`;
}
