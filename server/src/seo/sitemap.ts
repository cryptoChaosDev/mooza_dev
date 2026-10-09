/**
 * Динамический sitemap (план, раздел E): /sitemap.xml — индекс, дочерние по
 * типам: sitemap-static, -artists, -releases, -clips, -profiles, -services,
 * -vacancies, -orders, -lineups. Не больше 45 000 URL в файле: продолжение —
 * sitemap-<тип>-2.xml, -3.xml…
 *
 * Отбор — загрузчики lib/publicData (listSitemap*): только индексируемое
 * (артисты VERIFIED/APPROVED с контентом и адресом по слагу; профили — согласие,
 * порог качества, без lastmod; заказы/вакансии — active с постом…).
 * Списки кэшируются на 30 минут и сбрасываются вместе с кэшем снимков.
 * SEO_INDEXABLE=false → роутер отвечает 404 на все sitemap (DEV).
 */

import {
  listSitemapArtists, listSitemapReleases, listSitemapClips, listSitemapProfiles,
  listSitemapServices, listSitemapVacancies, listSitemapOrders, listSitemapLineups, SitemapEntry,
} from '../lib/publicData';
import { cached, SEO_TTL } from './cache';
import { escapeXml, isoDateTime } from './html';
import { siteUrl } from './render/common';

export const SITEMAP_CHUNK_SIZE = 45_000;

export const SITEMAP_TYPES = ['static', 'artists', 'releases', 'clips', 'profiles', 'services', 'vacancies', 'orders', 'lineups'] as const;
export type SitemapType = (typeof SITEMAP_TYPES)[number];

/** Публичные страницы без БД. */
export const STATIC_SITEMAP_PATHS: readonly string[] = [
  '/', '/feed', '/search', '/search?tab=artists', '/search?tab=people', '/privacy', '/terms',
];

const LOADERS: Record<Exclude<SitemapType, 'static'>, () => Promise<SitemapEntry[]>> = {
  artists: listSitemapArtists,
  releases: listSitemapReleases,
  clips: listSitemapClips,
  profiles: () => listSitemapProfiles(),
  services: listSitemapServices,
  vacancies: listSitemapVacancies,
  orders: listSitemapOrders,
  lineups: () => listSitemapLineups(),
};

export function isSitemapType(v: string): v is SitemapType {
  return (SITEMAP_TYPES as readonly string[]).includes(v);
}

async function entriesFor(type: SitemapType): Promise<SitemapEntry[]> {
  if (type === 'static') return STATIC_SITEMAP_PATHS.map((path) => ({ path, lastmod: null }));
  return cached(`sitemap|${type}`, SEO_TTL.sitemap, LOADERS[type]);
}

function chunkName(type: SitemapType, page: number): string {
  return page <= 1 ? `/sitemap-${type}.xml` : `/sitemap-${type}-${page}.xml`;
}

function maxLastmod(entries: SitemapEntry[]): Date | null {
  let best: Date | null = null;
  for (const e of entries) if (e.lastmod && (!best || e.lastmod > best)) best = e.lastmod;
  return best;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** /sitemap.xml — индекс дочерних файлов (пустые типы не перечисляются). */
export async function renderSitemapIndex(): Promise<string> {
  const parts: string[] = [];
  for (const type of SITEMAP_TYPES) {
    const entries = await entriesFor(type);
    if (!entries.length) continue;
    const pages = Math.ceil(entries.length / SITEMAP_CHUNK_SIZE);
    for (let page = 1; page <= pages; page++) {
      const slice = entries.slice((page - 1) * SITEMAP_CHUNK_SIZE, page * SITEMAP_CHUNK_SIZE);
      const lastmod = isoDateTime(maxLastmod(slice));
      parts.push(
        `  <sitemap><loc>${escapeXml(siteUrl(chunkName(type, page)))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</sitemap>`,
      );
    }
  }
  return `${XML_HEAD}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.join('\n')}${parts.length ? '\n' : ''}</sitemapindex>\n`;
}

/** Дочерний sitemap; null — нет такой страницы (404). Первая страница пустого типа — пустой urlset. */
export async function renderSitemapChunk(type: SitemapType, page = 1): Promise<string | null> {
  if (!Number.isInteger(page) || page < 1) return null;
  const entries = await entriesFor(type);
  const pages = Math.max(1, Math.ceil(entries.length / SITEMAP_CHUNK_SIZE));
  if (page > pages) return null;
  const slice = entries.slice((page - 1) * SITEMAP_CHUNK_SIZE, page * SITEMAP_CHUNK_SIZE);
  const urls = slice.map((e) => {
    const lastmod = isoDateTime(e.lastmod);
    return `  <url><loc>${escapeXml(siteUrl(e.path))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
  });
  return `${XML_HEAD}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}${urls.length ? '\n' : ''}</urlset>\n`;
}
