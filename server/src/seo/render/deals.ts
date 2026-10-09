/**
 * Снимки /orders/:id (Demand) и /vacancies/:id (JobPosting).
 * draft / без поста / скрытое → 404; закрытые (archived, done для вакансий) —
 * 200 + noindex (indexable из publicData). Материалы — только количество.
 */

import { getPublicOrder, getPublicVacancy, ANON_CUSTOMER_NAME } from '../../lib/publicData';
import { SITE_NAME } from '../config';
import { ogImageUrl, plainText, formatRub, escapeHtml } from '../html';
import { demandLd, jobPostingLd } from '../jsonld';
import {
  RenderOutcome, buildSnapshot, notFoundSnapshot, pageTitle, siteUrl, h1, para, facts,
  profilePath, artistPathOf, personLabel,
} from './common';
import {
  WORK_FORMAT_LABELS, GEOGRAPHY_LABELS, EMPLOYMENT_LABELS, PAYMENT_LABELS, ORDER_STATUS_LABELS,
  VACANCY_STATUS_LABELS, label, pluralRu, ruDate,
} from './labels';

function materialsNote(n: number): string {
  if (!n) return '';
  return para(`${n} ${pluralRu(n, 'материал', 'материала', 'материалов')} — после входа.`, 'ssr-note');
}

export async function renderOrder(id: string): Promise<RenderOutcome> {
  const res = await getPublicOrder(id);
  if (res.status === 'not_found') return notFoundSnapshot();
  const o = res.data;
  const path = `/orders/${encodeURIComponent(o.id)}`;
  const url = siteUrl(path);
  const budget = formatRub(o.budgetFrom, o.budgetTo);
  const section = o.service?.section?.name ?? null;
  const title = pageTitle(`Заказ: ${o.title}`, section);
  const description = plainText([budget ? `Бюджет ${budget}` : null, o.description].filter(Boolean).join('. '), 160)
    || plainText(`Заказ «${o.title}» на Moooza.`, 160);
  const author = personLabel(o.author, ANON_CUSTOMER_NAME);
  const authorPath = o.author?.id ? profilePath(o.author.id) : null;
  const responses = Number(o.responsesCount) || 0;

  const bodyHtml =
    h1(o.title)
    + `<p class="ssr-desc">${authorPath ? `<a href="${escapeHtml(authorPath)}">${escapeHtml(author)}</a>` : escapeHtml(author)}</p>`
    + facts([
      ['Статус', label(ORDER_STATUS_LABELS, o.status)],
      ['Бюджет', budget],
      ['Срок', ruDate(o.deadline)],
      ['Раздел', section],
      ['Услуга', o.service?.name ?? null],
      ['Откликов', responses > 0 ? String(responses) : null],
      ['Опубликован', ruDate(o.createdAt)],
    ])
    + para(plainText(o.description, 4000))
    + materialsNote(Number(o.materialsCount) || 0)
    + para('Откликнуться на заказ — после входа на Moooza.', 'ssr-note');

  return buildSnapshot({
    title,
    description,
    canonicalPath: path,
    indexable: res.status === 'ok',
    ogType: 'article',
    image: null,
    jsonLd: [demandLd(o, { url, description })],
    crumbs: [
      { name: SITE_NAME, url: '/' },
      { name: 'Лента', url: '/feed' },
      { name: `Заказ: ${o.title}` },
    ],
    bodyHtml,
    lastModified: res.lastModified,
  });
}

function compensationText(v: any): string | null {
  const n = Number(v.compensation);
  if (v.compensation == null || !Number.isFinite(n) || n <= 0) return null;
  if (v.paymentType === 'percent') return `${n}%`;
  if (v.paymentType === 'rate') return formatRub(n, null)?.replace(/^от /, '') ?? null;
  return null;
}

export async function renderVacancy(id: string): Promise<RenderOutcome> {
  const res = await getPublicVacancy(id);
  if (res.status === 'not_found') return notFoundSnapshot();
  const v = res.data;
  const path = `/vacancies/${encodeURIComponent(v.id)}`;
  const url = siteUrl(path);
  const artistPath = v.artist ? artistPathOf(v.artist) : null;
  const artistName: string | null = v.artist?.name ?? null;
  const title = pageTitle(`Вакансия: ${v.title}`, artistName);
  const description = plainText([v.profession?.name, v.description].filter(Boolean).join('. '), 160)
    || plainText(`Вакансия «${v.title}» на Moooza.`, 160);
  const fullDescription = plainText(v.description, 4000);

  const bodyHtml =
    h1(v.title)
    + (artistPath && artistName ? `<p class="ssr-desc"><a href="${escapeHtml(artistPath)}">${escapeHtml(artistName)}</a></p>` : '')
    + facts([
      ['Статус', label(VACANCY_STATUS_LABELS, v.status)],
      ['Профессия', v.profession?.name ?? null],
      ['Формат', label(WORK_FORMAT_LABELS, v.workFormat)],
      ['География', label(GEOGRAPHY_LABELS, v.geography)],
      ['Занятость', label(EMPLOYMENT_LABELS, v.employmentType)],
      ['Оплата', label(PAYMENT_LABELS, v.paymentType)],
      ['Вознаграждение', compensationText(v)],
      ['Опубликована', ruDate(v.createdAt)],
    ])
    + para(fullDescription)
    + materialsNote(Number(v.materialsCount) || 0)
    + para('Откликнуться на вакансию — после входа на Moooza.', 'ssr-note');

  return buildSnapshot({
    title,
    description,
    canonicalPath: path,
    indexable: res.status === 'ok',
    ogType: 'article',
    image: ogImageUrl(v.artist?.avatar),
    imageAlt: artistName ?? v.title,
    jsonLd: [jobPostingLd(v, {
      url,
      artistUrl: artistPath ? siteUrl(artistPath) : null,
      description: fullDescription || description,
      logo: ogImageUrl(v.artist?.avatar),
    })],
    crumbs: [
      { name: SITE_NAME, url: '/' },
      { name: 'Лента', url: '/feed' },
      { name: `Вакансия: ${v.title}` },
    ],
    bodyHtml,
    lastModified: res.lastModified,
  });
}
