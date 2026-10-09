/** Снимок /artist/:idOrSlug — MusicGroup. UUID и прежний слаг → 301 на /artist/<slug>. */

import { getPublicArtist, getPublicArtistReleases, getPublicArtistClips } from '../../lib/publicData';
import { SITE_NAME } from '../config';
import { ogImageUrl, plainText, safeHttpUrl, escapeHtml } from '../html';
import { musicGroupLd } from '../jsonld';
import {
  RenderOutcome, buildSnapshot, notFoundSnapshot, pageTitle, siteUrl, h1, h2, para, facts, linkList, image,
  profilePath, artistPathOf, personLabel,
} from './common';
import { ARTIST_TYPE_LABELS, ARTIST_ACTIVITY_LABELS, label, pluralRu } from './labels';

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * «Ближайшие концерты» визитки (ymData.concerts из синка ЯМ/Афиши): будущие,
 * от сегодняшнего дня по МСК, по дате. Ссылка на билеты — только http(s).
 */
export function upcomingConcertsHtml(concerts: unknown, now: Date = new Date()): string {
  if (!Array.isArray(concerts)) return '';
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const from = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()) - MSK_OFFSET_MS;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const pad = (n: number) => String(n).padStart(2, '0');
  const items = concerts
    .map((c: any) => ({ c, t: Date.parse(str(c?.datetime) ?? str(c?.date) ?? '') }))
    .filter((x) => Number.isFinite(x.t) && x.t >= from)
    .sort((a, b) => a.t - b.t)
    .slice(0, 10);
  if (!items.length) return '';
  const lis = items.map(({ c, t }) => {
    const d = new Date(t + MSK_OFFSET_MS);
    const date = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
    const text = [date, str(c?.city), str(c?.place) ?? str(c?.address)].filter(Boolean).join(' — ');
    const href = safeHttpUrl(c?.afishaUrl) ?? safeHttpUrl(c?.url);
    return href
      ? `<li><a href="${escapeHtml(href)}" rel="nofollow noopener" target="_blank">${escapeHtml(text)}</a></li>`
      : `<li>${escapeHtml(text)}</li>`;
  });
  return `${h2('Ближайшие концерты')}<ul class="ssr-list">${lis.join('')}</ul>`;
}

export async function renderArtist(key: string): Promise<RenderOutcome> {
  const res = await getPublicArtist(key);
  if (res.status === 'not_found') return notFoundSnapshot();
  const a = res.data;

  // Канонический адрес — по слагу. /artist/<uuid>, прежний слаг, другой регистр → 301.
  const canonicalKey = a.slug || a.id;
  if (key !== canonicalKey) return { kind: 'redirect', location: artistPathOf(a) };

  const [releasesRes, clipsRes] = await Promise.all([getPublicArtistReleases(a.id), getPublicArtistClips(a.id)]);
  const releases: any[] = releasesRes.status === 'not_found' ? [] : releasesRes.data;
  const clips: any[] = clipsRes.status === 'not_found' ? [] : clipsRes.data;

  const path = artistPathOf(a);
  const url = siteUrl(path);
  const typeLabel = label(ARTIST_TYPE_LABELS, a.type);
  const genres: string[] = (a.genres ?? []).map((g: any) => g?.name).filter(Boolean);
  const description =
    plainText(a.description, 160)
    || plainText(
      `${a.name} — ${(typeLabel ?? 'артист').toLowerCase()}${a.city ? ` из города ${a.city}` : ''}`
      + `${genres.length ? `. Жанры: ${genres.join(', ')}` : ''}. Состав, релизы и клипы на Moooza.`,
      160,
    );
  const title = pageTitle(a.name, [typeLabel ?? 'артист', a.city].filter(Boolean).join(', '));

  const members = (a.confirmedMembers ?? []).filter((m: any) => m?.user?.id);
  const hidden = Number(a.hiddenMembersCount) || 0;
  const memberItems = members.map((m: any) => ({
    href: profilePath(m.user.id),
    text: personLabel(m.user, 'Участник'),
    note: (m.roles ?? []).map((r: any) => r?.name).filter(Boolean).join(', ') || null,
  }));
  const hiddenNote = hidden > 0
    ? para(`${members.length ? 'И ещё' : 'В составе'} ${hidden} ${pluralRu(hidden, 'участник', 'участника', 'участников')} — после входа.`, 'ssr-note')
    : '';

  const links = Object.entries((a.socialLinks ?? {}) as Record<string, unknown>)
    .map(([, v]) => safeHttpUrl(v))
    .filter((u): u is string => !!u);
  const bandLink = safeHttpUrl(a.bandLink);
  if (bandLink && !links.includes(bandLink)) links.push(bandLink);

  const listeners = Number(a.listeners) || 0;
  const bodyHtml =
    image(ogImageUrl(a.avatar), a.name)
    + h1(a.name)
    + facts([
      ['Тип', typeLabel],
      ['Город', a.city],
      ['Жанры', genres.join(', ')],
      ['Статус', label(ARTIST_ACTIVITY_LABELS, a.activityStatus)],
      ['Слушателей в месяц', listeners > 0 ? listeners.toLocaleString('ru-RU').replace(/[\u00a0\u202f]/g, ' ') : null],
      ['Готовность к туру', a.tourReady],
    ])
    + para(plainText(a.description, 4000))
    + upcomingConcertsHtml(a.ymData?.concerts)
    + (memberItems.length ? linkList('Состав', memberItems) : (hidden > 0 ? '<h2>Состав</h2>' : ''))
    + hiddenNote
    + linkList('Релизы', releases.slice(0, 50).map((r) => ({ href: `/releases/${encodeURIComponent(r.id)}`, text: r.title })))
    + linkList('Клипы', clips.slice(0, 50).map((c) => ({ href: `/clips/${encodeURIComponent(c.id)}`, text: c.title })))
    + linkList('Ссылки', links.slice(0, 20).map((u) => ({ href: u, text: u.replace(/^https?:\/\//, '') })), { external: true });

  return buildSnapshot({
    title,
    description,
    canonicalPath: path,
    indexable: res.status === 'ok',
    ogType: 'profile',
    image: ogImageUrl(a.avatar) ?? ogImageUrl(a.banner),
    imageAlt: a.name,
    jsonLd: [musicGroupLd(a, {
      url,
      profileUrl: (id) => siteUrl(profilePath(id)),
      releases,
      releaseUrl: (id) => siteUrl(`/releases/${encodeURIComponent(id)}`),
    })],
    crumbs: [
      { name: SITE_NAME, url: '/' },
      { name: 'Артисты', url: '/search?tab=artists' },
      { name: a.name },
    ],
    bodyHtml,
    lastModified: res.lastModified,
  });
}
