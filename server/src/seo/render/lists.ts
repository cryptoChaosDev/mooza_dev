/**
 * Снимки-хабы: / (лендинг для гостя), /feed (лента) и /search (каталог) —
 * CollectionPage + ItemList. Данные — гостевые загрузчики publicData (лента:
 * те же правила видимости и обезличивание, что у JSON /api/posts/feed).
 */

import {
  getPublicFeedPage, getPublicArtistCatalog, getPublicPeopleCatalog, getPublicServiceCatalog,
  ANON_PERSON_NAME, ANON_CUSTOMER_NAME,
} from '../../lib/publicData';
import { SITE_NAME, ROBOTS_NOINDEX_FOLLOW } from '../config';
import { stripTags, truncate, formatRub } from '../html';
import { collectionPageLd, ListEntry } from '../jsonld';
import {
  RenderOutcome, buildSnapshot, pageTitle, siteUrl, h1, para, linkList, LinkItem,
  profilePath, artistPathOf, personLabel, DEFAULT_DESCRIPTION,
} from './common';
import { ARTIST_TYPE_LABELS, label, ruDate } from './labels';

// ── Лента ────────────────────────────────────────────────────────────────────

/** Карточка поста в снимке: ссылка на страницу сущности, если она есть. */
export function feedItem(p: any): LinkItem & { name: string } {
  const author = p.artist?.name ?? personLabel(p.author, p.type === 'order' ? ANON_CUSTOMER_NAME : ANON_PERSON_NAME);
  const date = ruDate(p.createdAt);
  const note = [author, date].filter(Boolean).join(', ');
  const excerpt = truncate(stripTags(p.title || p.content || p.repostComment || ''), 140);
  if (p.type === 'order' && p.order?.id) {
    const name = `Заказ: ${truncate(stripTags(p.order.title), 120)}`;
    return { href: `/orders/${encodeURIComponent(p.order.id)}`, text: name, name, note };
  }
  if (p.type === 'vacancy' && p.vacancy?.id) {
    const name = `Вакансия: ${truncate(stripTags(p.vacancy.title), 120)}`;
    return { href: `/vacancies/${encodeURIComponent(p.vacancy.id)}`, text: name, name, note };
  }
  if (p.type === 'service' && p.service?.id) {
    const name = `Услуга: ${truncate(stripTags(p.service.name || p.service.service?.name || ''), 120)}`;
    return { href: `/services/${encodeURIComponent(p.service.id)}`, text: name, name, note };
  }
  const name = excerpt || 'Публикация';
  if (p.artist?.id) return { href: artistPathOf(p.artist), text: name, name, note };
  if (p.author?.id) return { href: profilePath(p.author.id), text: name, name, note };
  return { href: '', text: name, name, note };
}

async function feedItems(limit: number): Promise<Array<LinkItem & { name: string }>> {
  const res = await getPublicFeedPage({ limit });
  const items: any[] = res.status === 'not_found' ? [] : (Array.isArray(res.data) ? res.data : res.data?.items ?? []);
  return items.map(feedItem);
}

function toLd(items: Array<LinkItem & { name: string }>): ListEntry[] {
  return items.map((it) => ({ name: it.name, url: it.href || null }));
}

const FEED_TITLE = pageTitle('Поток', 'публикации, заказы и вакансии музыкантов');
const FEED_DESCRIPTION = 'Лента Moooza: новости артистов, услуги, заказы и вакансии в музыкальной индустрии.';

/** /feed. `filtered` — в адресе есть фильтры: noindex,follow (канон — /feed). */
export async function renderFeed(opts: { filtered: boolean }): Promise<RenderOutcome> {
  const items = await feedItems(20);
  return buildSnapshot({
    title: FEED_TITLE,
    description: FEED_DESCRIPTION,
    canonicalPath: '/feed',
    indexable: true,
    robots: opts.filtered ? ROBOTS_NOINDEX_FOLLOW : undefined,
    jsonLd: [collectionPageLd({ url: siteUrl('/feed'), name: FEED_TITLE, description: FEED_DESCRIPTION, items: toLd(items) })],
    crumbs: [{ name: SITE_NAME, url: '/' }, { name: 'Лента' }],
    bodyHtml:
      h1('Поток Moooza')
      + para(FEED_DESCRIPTION)
      + (items.length ? linkList('Свежие публикации', items) : para('Публикаций пока нет.', 'ssr-note'))
      + para('Лайки, комментарии и отклики — после входа на Moooza.', 'ssr-note'),
  });
}

// ── Главная ──────────────────────────────────────────────────────────────────

const HOME_TITLE = `${SITE_NAME} — Музыкальная социальная сеть`;

export async function renderHome(): Promise<RenderOutcome> {
  const [items, artistsRes] = await Promise.all([feedItems(10), getPublicArtistCatalog(12)]);
  const artists: any[] = artistsRes.status === 'not_found' ? [] : artistsRes.data;
  const artistItems = artists.map((a) => ({
    href: artistPathOf(a),
    text: a.name,
    note: [label(ARTIST_TYPE_LABELS, a.type), a.city].filter(Boolean).join(', ') || null,
  }));
  return buildSnapshot({
    title: HOME_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonicalPath: '/',
    indexable: true,
    jsonLd: [collectionPageLd({
      url: siteUrl('/'),
      name: HOME_TITLE,
      description: DEFAULT_DESCRIPTION,
      items: [...toLd(artistItems.map((a) => ({ ...a, name: a.text }))), ...toLd(items)],
    })],
    crumbs: [{ name: SITE_NAME }],
    bodyHtml:
      h1('Moooza — социальная сеть для музыкантов')
      + para(DEFAULT_DESCRIPTION)
      + linkList('Разделы', [
        { href: '/feed', text: 'Лента: новости, заказы и вакансии' },
        { href: '/search', text: 'Каталог услуг музыкантов' },
        { href: '/search?tab=artists', text: 'Артисты и группы' },
        { href: '/search?tab=people', text: 'Музыканты и специалисты' },
      ])
      + linkList('Артисты', artistItems)
      + linkList('Свежее в ленте', items),
  });
}

// ── Каталог ──────────────────────────────────────────────────────────────────

export type CatalogTab = 'services' | 'artists' | 'people';

export const CATALOG_TABS: readonly CatalogTab[] = ['services', 'artists', 'people'];

const TAB_SEO: Record<CatalogTab, { title: string; description: string; h1: string }> = {
  services: {
    title: 'Услуги музыкантов и специалистов индустрии',
    h1: 'Услуги музыкантов',
    description: 'Каталог услуг Moooza: запись, сведение, аранжировка, выступления, обучение и другие услуги музыкантов с ценами и отзывами.',
  },
  artists: {
    title: 'Артисты и группы',
    h1: 'Артисты и группы',
    description: 'Каталог артистов и групп на Moooza: составы, жанры, релизы и клипы.',
  },
  people: {
    title: 'Музыканты и специалисты',
    h1: 'Музыканты и специалисты',
    description: 'Музыканты, звукорежиссёры, продюсеры и другие специалисты музыкальной индустрии на Moooza.',
  },
};

/** /search?tab=…: `filtered` — в адресе поиск/фильтры, noindex,follow (канон — вкладка). */
export async function renderSearch(tab: CatalogTab, opts: { filtered: boolean }): Promise<RenderOutcome> {
  const seo = TAB_SEO[tab];
  let items: LinkItem[] = [];
  if (tab === 'artists') {
    const res = await getPublicArtistCatalog();
    items = (res.status === 'not_found' ? [] : res.data).map((a: any) => ({
      href: artistPathOf(a),
      text: a.name,
      note: [label(ARTIST_TYPE_LABELS, a.type), a.city, (a.genres ?? []).map((g: any) => g?.name).filter(Boolean).slice(0, 3).join(', ')]
        .filter(Boolean).join(' · ') || null,
    }));
  } else if (tab === 'people') {
    const res = await getPublicPeopleCatalog();
    items = (res.status === 'not_found' ? [] : res.data)
      .filter((u: any) => u?.id)
      .map((u: any) => ({
        href: profilePath(u.id),
        text: personLabel(u, ANON_PERSON_NAME),
        note: [(u.professions ?? []).slice(0, 3).join(', '), u.city].filter(Boolean).join(' · ') || null,
      }));
  } else {
    const res = await getPublicServiceCatalog();
    items = (res.status === 'not_found' ? [] : res.data).map((s: any) => ({
      href: `/services/${encodeURIComponent(s.id)}`,
      text: s.name || s.service || s.profession || 'Услуга',
      note: [personLabel(s.user, ''), s.user?.city, formatRub(s.priceFrom, s.priceTo)].filter(Boolean).join(' · ') || null,
    }));
  }
  const canonicalPath = tab === 'services' ? '/search' : `/search?tab=${tab}`;
  const title = pageTitle(seo.title, 'каталог');
  return buildSnapshot({
    title,
    description: seo.description,
    canonicalPath,
    indexable: true,
    robots: opts.filtered ? ROBOTS_NOINDEX_FOLLOW : undefined,
    jsonLd: [collectionPageLd({
      url: siteUrl(canonicalPath),
      name: title,
      description: seo.description,
      items: items.map((it) => ({ name: it.text, url: it.href })),
    })],
    crumbs: [{ name: SITE_NAME, url: '/' }, { name: 'Каталог', url: '/search' }, { name: seo.h1 }],
    bodyHtml:
      h1(seo.h1)
      + para(seo.description)
      + linkList(null, CATALOG_TABS.filter((t) => t !== tab).map((t) => ({
        href: t === 'services' ? '/search' : `/search?tab=${t}`,
        text: TAB_SEO[t].h1,
      })))
      + (items.length ? linkList(null, items) : para('Пока пусто.', 'ssr-note')),
  });
}
