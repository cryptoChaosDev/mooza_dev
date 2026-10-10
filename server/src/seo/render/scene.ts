/**
 * Снимки «Сцены»: /scene — города с концертами и ближайшие концерты страны;
 * /scene/:город — концерты города с JSON-LD MusicEvent (поисковики показывают
 * такие события прямо в выдаче). Данные — lib/sceneConcerts (только публичная
 * афиша, без ПДн). Город без предстоящих концертов — 200 + noindex (пустые
 * страницы в поиске не нужны); неизвестный слаг — 404.
 */

import {
  ConcertDTO, formatConcertLocal, listSceneCities, listSceneConcerts, resolveSceneCity,
} from '../../lib/sceneConcerts';
import { SITE_NAME, ROBOTS_NOINDEX_FOLLOW } from '../config';
import { escapeHtml } from '../html';
import { collectionPageLd } from '../jsonld';
import {
  RenderOutcome, buildSnapshot, notFoundSnapshot, pageTitle, siteUrl, h1, h2, para, linkList, artistPathOf,
} from './common';
import { pluralRu } from './labels';

type Json = Record<string, unknown>;

const SCENE_TITLE = pageTitle('Сцена', 'концерты по городам');
const SCENE_DESCRIPTION =
  'Сцена Moooza: концерты и живая музыка по городам России — кто играет сегодня, на выходных и в этом месяце.';

const concertsWord = (n: number) => pluralRu(n, 'концерт', 'концерта', 'концертов');

/** Дата начала для JSON-LD: с местным поясом города; без известного времени — только дата. */
function ldStartDate(c: ConcertDTO): string {
  return c.hasTime ? c.startsAt : c.startsAt.slice(0, 10);
}

/** schema.org MusicEvent: место (площадка, город), исполнитель Moooza, билеты. */
export function musicEventLd(c: ConcertDTO, pageUrl: string): Json {
  return {
    '@type': 'MusicEvent',
    '@id': `${pageUrl}#concert-${c.id}`,
    name: c.title,
    startDate: ldStartDate(c),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: c.venue || c.cityName,
      address: { '@type': 'PostalAddress', addressLocality: c.cityName, streetAddress: c.address, addressCountry: 'RU' },
    },
    image: c.imageUrl,
    url: c.url ?? pageUrl,
    performer: c.artist ? { '@type': 'MusicGroup', name: c.artist.name, url: siteUrl(artistPathOf(c.artist)) } : null,
    offers: c.ticketUrl
      ? {
          '@type': 'Offer',
          url: c.ticketUrl,
          price: c.priceFrom,
          priceCurrency: c.priceFrom != null ? 'RUB' : null,
          availability: 'https://schema.org/InStock',
        }
      : null,
  };
}

/** Список концертов: дата · название (на визитку, если артист Moooza) · площадка · билеты. */
function concertsHtml(items: ConcertDTO[], withCity: boolean): string {
  if (!items.length) return '';
  const lis = items.map((c) => {
    const when = formatConcertLocal(new Date(c.startsAt), c.hasTime, c.utcOffsetMin);
    const name = c.artist
      ? `<a href="${escapeHtml(artistPathOf(c.artist))}">${escapeHtml(c.title)}</a>`
      : escapeHtml(c.title);
    const where = [c.venue, withCity ? c.cityName : null].filter(Boolean).join(', ');
    const tickets = c.ticketUrl
      ? ` <a href="${escapeHtml(c.ticketUrl)}" rel="nofollow noopener" target="_blank">Билеты</a>`
      : '';
    return `<li>${escapeHtml(when)} — ${name}${where ? ` <span class="ssr-note">${escapeHtml(where)}</span>` : ''}${tickets}</li>`;
  });
  return `<ul class="ssr-list">${lis.join('')}</ul>`;
}

/** /scene. `filtered` — в адресе фильтры (?period=…): noindex,follow, канон — /scene. */
export async function renderSceneIndex(opts: { filtered: boolean }): Promise<RenderOutcome> {
  const [cities, soon] = await Promise.all([
    listSceneCities(),
    listSceneConcerts({ period: 'week', limit: 20 }),
  ]);
  return buildSnapshot({
    title: SCENE_TITLE,
    description: SCENE_DESCRIPTION,
    canonicalPath: '/scene',
    indexable: cities.length > 0,
    robots: opts.filtered ? ROBOTS_NOINDEX_FOLLOW : undefined,
    jsonLd: [collectionPageLd({
      url: siteUrl('/scene'),
      name: SCENE_TITLE,
      description: SCENE_DESCRIPTION,
      items: cities.map((c) => ({ name: `Концерты: ${c.name}`, url: `/scene/${c.slug}` })),
    })],
    crumbs: [{ name: SITE_NAME, url: '/' }, { name: 'Сцена' }],
    bodyHtml:
      h1('Сцена: концерты по городам')
      + para(SCENE_DESCRIPTION)
      + (cities.length
        ? linkList('Города', cities.map((c) => ({ href: `/scene/${c.slug}`, text: c.name, note: `${c.upcoming} ${concertsWord(c.upcoming)}` })))
        : para('Скоро здесь появятся концерты.', 'ssr-note'))
      + (soon.items.length ? h2('Ближайшие концерты') + concertsHtml(soon.items, true) : ''),
  });
}

/** /scene/:город — концерты города на 4 месяца вперёд. */
export async function renderSceneCity(slug: string, opts: { filtered: boolean }): Promise<RenderOutcome> {
  const city = await resolveSceneCity(slug);
  if (!city) return notFoundSnapshot();
  const data = await listSceneConcerts({ cityKey: city.key, period: 'all', limit: 40 });
  const url = siteUrl(`/scene/${city.slug}`);
  const n = data.total;
  const description = n > 0
    ? `Концерты и живая музыка — ${city.name}: ${n} ${concertsWord(n)} в афише. Даты, площадки и билеты на Сцене Moooza.`
    : `Концерты — ${city.name}: афиша Сцены Moooza. Пока предстоящих концертов нет.`;
  return buildSnapshot({
    title: pageTitle(`Концерты — ${city.name}`, 'афиша Сцены'),
    description,
    canonicalPath: `/scene/${city.slug}`,
    indexable: data.items.length > 0,
    robots: opts.filtered ? ROBOTS_NOINDEX_FOLLOW : undefined,
    jsonLd: data.items.slice(0, 20).map((c) => musicEventLd(c, url)),
    crumbs: [{ name: SITE_NAME, url: '/' }, { name: 'Сцена', url: '/scene' }, { name: city.name }],
    bodyHtml:
      h1(`Концерты — ${city.name}`)
      + para(description)
      + (data.items.length ? concertsHtml(data.items, false) : para('Предстоящих концертов пока нет.', 'ssr-note'))
      + para('Подписка на артистов и уведомления о концертах в вашем городе — после входа на Moooza.', 'ssr-note'),
  });
}
