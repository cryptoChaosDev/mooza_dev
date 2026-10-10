/**
 * Таблица «путь → рендер» SEO-снимков. Зеркалит публичные маршруты
 * client/src/App.tsx (PublicRoute + /, /feed, /privacy, /terms):
 *   /, /feed, /search, /artist/:idOrSlug, /releases/:id, /clips/:id,
 *   /profile/:userId, /services/:id, /orders/:id, /vacancies/:id, /lineups/:id,
 *   /privacy, /terms.
 *
 * Приватные подпути под публичными префиксами (RequireAuth в App.tsx:
 * /artist/create, /artist/:id/edit…, /services/new, /orders/edit/:id…) —
 * шаблон без изменений + X-Robots-Tag noindex. Прочие пути (например,
 * /profile/:id/services — noindex,follow по матрице) — шаблон + noindex.
 *
 * При изменении маршрутов в App.tsx обновить и этот файл, и client/nginx.conf.
 */

import { SEO_TTL } from './cache';
import { RenderOutcome } from './render/common';
import { renderArtist } from './render/artist';
import { renderRelease, renderClip } from './render/media';
import { renderProfile } from './render/profile';
import { renderService } from './render/service';
import { renderOrder, renderVacancy } from './render/deals';
import { renderLineup } from './render/lineup';
import { renderFeed, renderHome, renderSearch, CATALOG_TABS, CatalogTab } from './render/lists';
import { renderStaticDoc } from './render/static';
import { renderSceneIndex, renderSceneCity, renderConcert } from './render/scene';

export type SeoRouteKind =
  | 'home' | 'feed' | 'search' | 'artist' | 'release' | 'clip' | 'profile'
  | 'service' | 'order' | 'vacancy' | 'lineup' | 'privacy' | 'terms' | 'scene' | 'scene_city' | 'concert';

export interface SeoRouteMatch {
  kind: SeoRouteKind;
  /** Ключ кэша (без мусорных query: utm и т.п. не плодят записи). */
  cacheKey: string;
  ttlMs: number;
  render: () => Promise<RenderOutcome>;
}

export type SeoResolution =
  | { type: 'route'; match: SeoRouteMatch }
  | { type: 'private' }
  | { type: 'unknown' };

/** Приватные подпути под публичными префиксами (RequireAuth в App.tsx). */
export const PRIVATE_SUBPATHS: readonly RegExp[] = [
  /^\/artist\/create$/,
  /^\/artist\/[^/]+\/.+$/, // edit, releases/new, clips/new, vacancies/new, members/add, invite, contacts, genres
  /^\/artists\/.+$/, // /artists/:artistId/vacancies
  /^\/services\/new$/,
  /^\/services\/edit\/.+$/,
  /^\/orders\/new$/,
  /^\/orders\/edit\/.+$/,
  /^\/profile\/[^/]+\/connections$/,
  /^\/lineups\/new$/,
  /^\/lineups\/[^/]+\/.+$/, // /lineups/:id/edit
];

/** Параметры, которые не меняют содержимое (Clean-param в robots.txt). */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_referrer',
  'yclid', 'gclid', 'fbclid', 'ysclid', 'from', 'ref', '_openstat', 'openstat',
]);

function meaningfulParams(query: URLSearchParams, ignore: string[] = []): string[] {
  const keys: string[] = [];
  for (const k of query.keys()) {
    if (TRACKING_PARAMS.has(k) || ignore.includes(k)) continue;
    keys.push(k);
  }
  return keys;
}

function decodeSegment(seg: string): string | null {
  try {
    const s = decodeURIComponent(seg);
    // eslint-disable-next-line no-control-regex
    if (!s || s.length > 200 || /[\u0000-\u001f\u007f/\\]/.test(s)) return null;
    return s;
  } catch {
    return null;
  }
}

type EntityKind = 'artist' | 'release' | 'clip' | 'profile' | 'service' | 'order' | 'vacancy' | 'lineup' | 'concert';

const ENTITY_ROUTES: Array<{ re: RegExp; kind: EntityKind; render: (key: string) => Promise<RenderOutcome> }> = [
  { re: /^\/artist\/([^/]+)$/, kind: 'artist', render: renderArtist },
  { re: /^\/releases\/([^/]+)$/, kind: 'release', render: renderRelease },
  { re: /^\/clips\/([^/]+)$/, kind: 'clip', render: renderClip },
  { re: /^\/profile\/([^/]+)$/, kind: 'profile', render: renderProfile },
  { re: /^\/services\/([^/]+)$/, kind: 'service', render: renderService },
  { re: /^\/orders\/([^/]+)$/, kind: 'order', render: renderOrder },
  { re: /^\/vacancies\/([^/]+)$/, kind: 'vacancy', render: renderVacancy },
  { re: /^\/lineups\/([^/]+)$/, kind: 'lineup', render: renderLineup },
  { re: /^\/concerts\/([^/]+)$/, kind: 'concert', render: renderConcert },
];

/**
 * Разобрать путь (без хвостового слэша — его 301-ит роутер) и query.
 * `envKey` входит в ключ кэша (SEO_INDEXABLE меняет robots в head).
 */
export function resolveSeoRoute(path: string, query: URLSearchParams, envKey = ''): SeoResolution {
  if (PRIVATE_SUBPATHS.some((re) => re.test(path))) return { type: 'private' };

  if (path === '/') {
    return { type: 'route', match: { kind: 'home', cacheKey: `${envKey}|home`, ttlMs: SEO_TTL.list, render: renderHome } };
  }
  if (path === '/feed') {
    const filtered = meaningfulParams(query, ['post']).length > 0;
    return {
      type: 'route',
      match: { kind: 'feed', cacheKey: `${envKey}|feed|${filtered ? 'f' : ''}`, ttlMs: SEO_TTL.list, render: () => renderFeed({ filtered }) },
    };
  }
  if (path === '/search') {
    const rawTab = query.get('tab');
    const tab: CatalogTab = rawTab && (CATALOG_TABS as readonly string[]).includes(rawTab) ? (rawTab as CatalogTab) : 'services';
    // Индексируются только чистые вкладки: /search и /search?tab=artists|people.
    const filtered = meaningfulParams(query, ['tab']).length > 0
      || (rawTab !== null && (rawTab === 'services' || tab !== rawTab));
    return {
      type: 'route',
      match: {
        kind: 'search',
        cacheKey: `${envKey}|search|${tab}|${filtered ? 'f' : ''}`,
        ttlMs: SEO_TTL.list,
        render: () => renderSearch(tab, { filtered }),
      },
    };
  }
  // «Сцена»: /scene и /scene/:город. Фильтры в адресе (?period=…) — noindex,follow.
  if (path === '/scene') {
    const filtered = meaningfulParams(query).length > 0;
    return {
      type: 'route',
      match: { kind: 'scene', cacheKey: `${envKey}|scene|${filtered ? 'f' : ''}`, ttlMs: SEO_TTL.list, render: () => renderSceneIndex({ filtered }) },
    };
  }
  const sceneCity = /^\/scene\/([^/]+)$/.exec(path);
  if (sceneCity) {
    const slug = decodeSegment(sceneCity[1]);
    if (!slug) return { type: 'unknown' };
    const filtered = meaningfulParams(query).length > 0;
    return {
      type: 'route',
      match: {
        kind: 'scene_city',
        cacheKey: `${envKey}|scene_city|${slug}|${filtered ? 'f' : ''}`,
        ttlMs: SEO_TTL.list,
        render: () => renderSceneCity(slug, { filtered }),
      },
    };
  }
  if (path === '/privacy' || path === '/terms') {
    const doc = path === '/privacy' ? 'privacy' : 'terms';
    return { type: 'route', match: { kind: doc, cacheKey: `${envKey}|${doc}`, ttlMs: SEO_TTL.entity, render: () => renderStaticDoc(doc) } };
  }
  for (const r of ENTITY_ROUTES) {
    const m = r.re.exec(path);
    if (!m) continue;
    const key = decodeSegment(m[1]);
    if (!key) return { type: 'unknown' };
    return {
      type: 'route',
      match: { kind: r.kind, cacheKey: `${envKey}|${r.kind}|${key}`, ttlMs: SEO_TTL.entity, render: () => r.render(key) },
    };
  }
  return { type: 'unknown' };
}
