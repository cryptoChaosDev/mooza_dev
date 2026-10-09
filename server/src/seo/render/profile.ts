/**
 * Снимок /profile/:userId — ProfilePage + Person. Нет пользователя / нет
 * согласия / заблокирован → ОДИНАКОВЫЙ 404 (notFoundSnapshot): по снимку нельзя
 * понять, существует ли человек. Ниже порога качества или запрет индексации —
 * 200 + noindex (indexable из publicData).
 */

import { getPublicProfile } from '../../lib/publicData';
import { SITE_NAME } from '../config';
import { ogImageUrl, plainText, formatRub } from '../html';
import { profilePageLd } from '../jsonld';
import {
  RenderOutcome, buildSnapshot, notFoundSnapshot, pageTitle, siteUrl, h1, para, facts, linkList, image,
  profilePath, artistPathOf,
} from './common';
import { OCCUPANCY_LABELS, label } from './labels';

export async function renderProfile(userId: string): Promise<RenderOutcome> {
  const res = await getPublicProfile(userId);
  if (res.status === 'not_found') return notFoundSnapshot();
  const p = res.data;
  const path = profilePath(p.id);
  const url = siteUrl(path);
  const name: string = p.displayName || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Участник Moooza';
  const professions: string[] = (p.userProfessions ?? []).map((up: any) => up?.profession?.name).filter(Boolean);
  const mainProfession = professions[0] ?? null;
  const title = pageTitle(name, [mainProfession, p.city].filter(Boolean).join(', '));
  const description =
    plainText(p.bio, 160)
    || plainText(`${name}${mainProfession ? ` — ${mainProfession}` : ''}${p.city ? `, ${p.city}` : ''}. Профиль на Moooza.`, 160);

  const services = (p.userServices ?? []).map((s: any) => ({
    href: `/services/${encodeURIComponent(s.id)}`,
    text: s.name || s.service?.name || s.profession?.name || 'Услуга',
    note: formatRub(s.priceFrom, s.priceTo),
  }));
  const artists = (p.userArtists ?? [])
    .map((ua: any) => ua?.artist)
    .filter((a: any) => a?.id && a?.name)
    .map((a: any) => ({ href: artistPathOf(a), text: a.name }));
  const genres: string[] = Array.isArray(p.genres) ? p.genres.filter((g: unknown) => typeof g === 'string') : [];

  const bodyHtml =
    image(ogImageUrl(p.avatar), name)
    + h1(name)
    + facts([
      ['Профессии', professions.join(', ')],
      ['Город', [p.city, p.country].filter(Boolean).join(', ')],
      ['Жанры', genres.join(', ')],
      ['Статус', label(OCCUPANCY_LABELS, p.occupancyStatus)],
    ])
    + para(plainText(p.bio, 4000))
    + linkList('Услуги', services)
    + linkList('Артисты', artists)
    + (p.contactsAvailable ? para('Контакты — после входа на Moooza.', 'ssr-note') : '');

  return buildSnapshot({
    title,
    description,
    canonicalPath: path,
    indexable: res.status === 'ok',
    ogType: 'profile',
    image: ogImageUrl(p.avatar),
    imageAlt: name,
    jsonLd: [profilePageLd(p, { url, title, artistUrl: (a) => siteUrl(artistPathOf(a)) })],
    crumbs: [
      { name: SITE_NAME, url: '/' },
      { name: 'Музыканты', url: '/search?tab=people' },
      { name },
    ],
    bodyHtml,
    lastModified: res.lastModified,
  });
}
