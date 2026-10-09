/** Снимок /services/:id — Service + Offer/PriceSpecification. Не active / без согласия → 404. */

import { getPublicService } from '../../lib/publicData';
import { SITE_NAME } from '../config';
import { ogImageUrl, plainText, formatRub, escapeHtml } from '../html';
import { serviceLd } from '../jsonld';
import {
  RenderOutcome, buildSnapshot, notFoundSnapshot, pageTitle, siteUrl, h1, h2, para, facts, image,
  profilePath, personLabel,
} from './common';

function daysText(from: unknown, to: unknown): string | null {
  const f = Number(from);
  const t = Number(to);
  const hasF = from != null && Number.isFinite(f) && f > 0;
  const hasT = to != null && Number.isFinite(t) && t > 0;
  if (hasF && hasT) return f === t ? `${f} дн.` : `от ${f} до ${t} дн.`;
  if (hasF) return `от ${f} дн.`;
  if (hasT) return `до ${t} дн.`;
  return null;
}

export async function renderService(id: string): Promise<RenderOutcome> {
  const res = await getPublicService(id);
  if (res.status === 'not_found') return notFoundSnapshot();
  const s = res.data;
  const path = `/services/${encodeURIComponent(s.id)}`;
  const url = siteUrl(path);
  const serviceTitle: string = s.name || s.service?.name || s.profession?.name || 'Услуга';
  const provider = s.user?.id ? personLabel(s.user, '') : '';
  const providerPath = s.user?.id ? profilePath(s.user.id) : null;
  const title = pageTitle(serviceTitle, [provider, s.user?.city].filter(Boolean).join(', '));
  const description =
    plainText(s.description, 160)
    || plainText(`${serviceTitle}${provider ? ` — ${provider}` : ''}. Цена и условия на Moooza.`, 160);

  const priceItems: any[] = Array.isArray(s.priceItems) ? s.priceItems : [];
  const priceRows = priceItems
    .filter((it) => it && typeof it === 'object' && typeof it.name === 'string' && it.name.trim())
    .slice(0, 50)
    .map((it) => {
      const price = formatRub(it.price, null)?.replace(/^от /, '');
      return `<li>${escapeHtml(it.name)}${price ? ` <span class="ssr-note">${escapeHtml(price)}</span>` : ''}</li>`;
    });
  const genres: string[] = (s.genres ?? []).map((g: any) => g?.name).filter(Boolean);

  const bodyHtml =
    image(ogImageUrl(s.user?.avatar), provider || serviceTitle)
    + h1(serviceTitle)
    + (providerPath && provider ? `<p class="ssr-desc"><a href="${escapeHtml(providerPath)}">${escapeHtml(provider)}</a></p>` : '')
    + facts([
      ['Цена', formatRub(s.priceFrom, s.priceTo)],
      ['Срок', daysText(s.deadlineFrom, s.deadlineTo)],
      ['Раздел', s.service?.section?.name ?? null],
      ['Профессия', s.profession?.name ?? null],
      ['Город', s.user?.city ?? null],
      ['Жанры', genres.join(', ')],
    ])
    + para(plainText(s.description, 4000))
    + (priceRows.length ? `${h2('Прайс')}<ul class="ssr-list">${priceRows.join('')}</ul>` : '')
    + para('Написать исполнителю и оформить сделку — после входа на Moooza.', 'ssr-note');

  return buildSnapshot({
    title,
    description,
    canonicalPath: path,
    indexable: res.status === 'ok',
    image: ogImageUrl(s.user?.avatar),
    imageAlt: serviceTitle,
    jsonLd: [serviceLd(s, { url, providerUrl: providerPath ? siteUrl(providerPath) : null, description })],
    crumbs: [
      { name: SITE_NAME, url: '/' },
      { name: 'Услуги', url: '/search' },
      { name: serviceTitle },
    ],
    bodyHtml,
    lastModified: res.lastModified,
  });
}
