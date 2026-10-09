/**
 * Снимок /profile/:userId — ProfilePage + Person. Нет пользователя / нет
 * согласия / заблокирован → ОДИНАКОВЫЙ 404 (notFoundSnapshot): по снимку нельзя
 * понять, существует ли человек. Ниже порога качества или запрет индексации —
 * 200 + noindex (indexable из publicData).
 */

import { getPublicProfile, getPublicCredits } from '../../lib/publicData';
import { SITE_NAME } from '../config';
import { ogImageUrl, plainText, formatRub } from '../html';
import { profilePageLd } from '../jsonld';
import {
  RenderOutcome, buildSnapshot, notFoundSnapshot, pageTitle, siteUrl, h1, para, facts, linkList, image,
  profilePath, artistPathOf,
} from './common';
import { OCCUPANCY_LABELS, label, pluralRu } from './labels';

/** Сколько кредитов (релизов) класть в снимок и JSON-LD. */
const SNAPSHOT_CREDITS = 20;
const LD_CREDITS = 10;

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

  // «Подтверждённый опыт»: человек уже проверен getPublicProfile. Сбой кредитов
  // не должен ронять снимок профиля — тогда просто без них.
  let credits: Awaited<ReturnType<typeof getPublicCredits>>['data'] = null;
  try {
    credits = (await getPublicCredits(p.id, { skipPersonCheck: true })).data;
  } catch {
    credits = null;
  }
  const creditReleases = (credits?.releases ?? []).filter((r) => r?.id && r?.title);
  const creditsFact = credits && (credits.releasesCount > 0 || credits.clipsCount > 0)
    ? [
        credits.releasesCount > 0 ? `${credits.releasesCount} ${pluralRu(credits.releasesCount, 'релиз', 'релиза', 'релизов')}` : null,
        credits.clipsCount > 0 ? `${credits.clipsCount} ${pluralRu(credits.clipsCount, 'клип', 'клипа', 'клипов')}` : null,
      ].filter(Boolean).join(' · ')
    : null;

  const bodyHtml =
    image(ogImageUrl(p.avatar), name)
    + h1(name)
    + facts([
      ['Профессии', professions.join(', ')],
      ['Город', [p.city, p.country].filter(Boolean).join(', ')],
      ['Жанры', genres.join(', ')],
      ['Статус', label(OCCUPANCY_LABELS, p.occupancyStatus)],
      ['Подтверждённый опыт', creditsFact],
      ['Роли', (credits?.roles ?? []).slice(0, 6).join(', ')],
    ])
    + para(plainText(p.bio, 4000))
    + linkList('Услуги', services)
    + linkList('Артисты', artists)
    + linkList('Релизы', creditReleases.slice(0, SNAPSHOT_CREDITS).map((r) => ({
      href: `/releases/${encodeURIComponent(r.id)}`,
      text: r.title,
      note: r.artist?.name ?? null,
    })))
    + (p.contactsAvailable ? para('Контакты — после входа на Moooza.', 'ssr-note') : '');

  return buildSnapshot({
    title,
    description,
    canonicalPath: path,
    indexable: res.status === 'ok',
    ogType: 'profile',
    image: ogImageUrl(p.avatar),
    imageAlt: name,
    jsonLd: [withCredits(profilePageLd(p, { url, title, artistUrl: (a) => siteUrl(artistPathOf(a)) }), creditReleases)],
    crumbs: [
      { name: SITE_NAME, url: '/' },
      { name: 'Музыканты', url: '/search?tab=people' },
      { name },
    ],
    bodyHtml,
    lastModified: res.lastModified,
  });
}

/** Кредиты в Person: subjectOf → MusicAlbum (релизы с подтверждённым участием). */
function withCredits(ld: Record<string, unknown>, releases: Array<{ id: string; title: string; artist?: { id: string; slug?: string | null; name: string } | null }>) {
  const person = ld.mainEntity as Record<string, unknown> | undefined;
  if (!person || releases.length === 0) return ld;
  person.subjectOf = releases.slice(0, LD_CREDITS).map((r) => ({
    '@type': 'MusicAlbum',
    name: r.title,
    url: siteUrl(`/releases/${encodeURIComponent(r.id)}`),
    byArtist: r.artist?.id && r.artist.name
      ? { '@type': 'MusicGroup', name: r.artist.name, url: siteUrl(artistPathOf(r.artist)) }
      : null,
  }));
  return ld;
}
