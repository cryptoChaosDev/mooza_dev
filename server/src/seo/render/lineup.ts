/**
 * Снимок /lineups/:id — запрос на выступление («Биржа лайнапов»), JSON-LD Event.
 * Данные — только из getPublicLineup (белый список): черновик / автор
 * заблокирован → 404; закрытый или прошедший — 200 + noindex. Отклики не
 * выводятся (только число). Организатор в JSON-LD — Person лишь при согласии на
 * публичные ПДн (toPublicPerson отдал id), иначе — Organization «Moooza».
 */

import { getPublicLineup, ANON_ORGANIZER_NAME } from '../../lib/publicData';
import { feeLabel, formatEventMsk, slotTypeLabel } from '../../lib/lineupQuery';
import { SITE_NAME } from '../config';
import { escapeHtml, isoDateTime, plainText } from '../html';
import {
  RenderOutcome, buildSnapshot, notFoundSnapshot, pageTitle, siteUrl, h1, para, facts, profilePath, personLabel,
} from './common';
import { pluralRu, ruDate } from './labels';

type Json = Record<string, unknown>;

const LINEUP_STATUS_LABELS: Record<string, string> = { active: 'Открыт', closed: 'Закрыт' };

/** schema.org Event: дата начала, место (город/площадка), организатор без ПДн людей без согласия. */
export function lineupEventLd(l: any, ctx: { url: string; description: string }): Json {
  const author = l.author;
  const organizer = author?.id && author?.isPublic
    ? { '@type': 'Person', name: author.displayName, url: siteUrl(profilePath(author.id)) }
    : { '@type': 'Organization', name: SITE_NAME, url: siteUrl('/') };
  return {
    '@type': 'Event',
    '@id': `${ctx.url}#event`,
    name: l.title,
    url: ctx.url,
    description: ctx.description,
    startDate: isoDateTime(l.eventDate),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: l.venue || l.cityName,
      address: { '@type': 'PostalAddress', addressLocality: l.cityName, addressCountry: 'RU' },
    },
    organizer,
    keywords: (l.genres ?? []).map((g: any) => g?.name).filter(Boolean).join(', ') || null,
  };
}

export async function renderLineup(id: string): Promise<RenderOutcome> {
  const res = await getPublicLineup(id);
  if (res.status === 'not_found') return notFoundSnapshot();
  const l = res.data;
  const path = `/lineups/${encodeURIComponent(l.id)}`;
  const url = siteUrl(path);
  const when = formatEventMsk(l.eventDate);
  const title = pageTitle(`Ищем артистов: ${l.title}`, l.cityName);
  const description = plainText(`${when} МСК, ${l.cityName}. ${slotTypeLabel(l.slotType)}, ${feeLabel(l.feeType, l.feeAmount).toLowerCase()}. ${l.description ?? ''}`, 160)
    || plainText(`Запрос на выступление «${l.title}» на Moooza.`, 160);
  const fullDescription = plainText(l.description, 4000);
  const author = personLabel(l.author, ANON_ORGANIZER_NAME);
  const authorPath = l.author?.id && l.author?.isPublic ? profilePath(l.author.id) : null;
  const responses = Number(l.responsesCount) || 0;
  const slots = Number(l.slots) || 0;
  const accepted = Number(l.acceptedCount) || 0;

  const bodyHtml =
    h1(l.title)
    + `<p class="ssr-desc">Организатор: ${authorPath ? `<a href="${escapeHtml(authorPath)}">${escapeHtml(author)}</a>` : escapeHtml(author)}</p>`
    + facts([
      ['Статус', LINEUP_STATUS_LABELS[l.status] ?? null],
      ['Дата и время', when ? `${when} МСК` : null],
      ['Город', l.cityName],
      ['Площадка', l.venue],
      ['Слот', slotTypeLabel(l.slotType)],
      ['Нужно артистов', slots ? `${slots}${accepted ? `, занято ${accepted}` : ''}` : null],
      ['Гонорар', feeLabel(l.feeType, l.feeAmount)],
      ['Жанры', (l.genres ?? []).map((g: any) => g?.name).filter(Boolean).join(', ') || null],
      ['Откликов', responses > 0 ? `${responses} ${pluralRu(responses, 'отклик', 'отклика', 'откликов')}` : null],
      ['Опубликован', ruDate(l.createdAt)],
    ])
    + para(fullDescription)
    + (l.requirements ? para(`Требования: ${plainText(l.requirements, 2000)}`) : '')
    + para('Откликнуться от имени артиста — после входа на Moooza.', 'ssr-note');

  return buildSnapshot({
    title,
    description,
    canonicalPath: path,
    indexable: res.status === 'ok',
    ogType: 'article',
    image: null,
    jsonLd: [lineupEventLd(l, { url, description: fullDescription || description })],
    crumbs: [
      { name: SITE_NAME, url: '/' },
      { name: 'Лайнапы', url: '/lineups' },
      { name: l.title },
    ],
    bodyHtml,
    lastModified: res.lastModified,
  });
}
