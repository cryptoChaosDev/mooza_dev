/** Снимки /releases/:id (MusicAlbum) и /clips/:id (MusicVideoObject). */

import { getPublicRelease, getPublicClip } from '../../lib/publicData';
import { SITE_NAME } from '../config';
import { ogImageUrl, plainText, safeHttpUrl, isoDuration, escapeHtml } from '../html';
import { musicAlbumLd, musicVideoLd } from '../jsonld';
import {
  RenderOutcome, buildSnapshot, notFoundSnapshot, pageTitle, siteUrl, h1, h2, para, facts, linkList, image,
  profilePath, artistPathOf, personLabel,
} from './common';
import { RELEASE_TYPE_LABELS, MEDIA_PLATFORM_LABELS, label, pluralRu, ruDate } from './labels';

function creditsHtml(item: any): string {
  const visible = (item.participants ?? []).filter((p: any) => p?.user?.id);
  const hidden = Number(item.hiddenParticipantsCount) || 0;
  const list = linkList('Участники', visible.map((p: any) => ({
    href: profilePath(p.user.id),
    text: personLabel(p.user, 'Участник'),
    note: (p.roles ?? []).map((r: any) => r?.name).filter(Boolean).join(', ') || null,
  })));
  const note = hidden > 0
    ? para(`${visible.length ? 'И ещё' : 'Участников:'} ${hidden} ${pluralRu(hidden, 'участник', 'участника', 'участников')} — после входа.`, 'ssr-note')
    : '';
  return (list || (hidden > 0 ? h2('Участники') : '')) + note;
}

function durationText(ms: unknown): string | null {
  const iso = isoDuration(ms);
  if (!iso) return null;
  const total = Math.round(Number(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export async function renderRelease(id: string): Promise<RenderOutcome> {
  const res = await getPublicRelease(id);
  if (res.status === 'not_found') return notFoundSnapshot();
  const r = res.data;
  const path = `/releases/${encodeURIComponent(r.id)}`;
  const url = siteUrl(path);
  const artistPath = r.artist ? artistPathOf(r.artist) : null;
  const artistName: string | null = r.artist?.name ?? null;
  const typeLabel = (label(RELEASE_TYPE_LABELS, r.releaseType) ?? 'релиз').toLowerCase();
  const date = ruDate(r.releaseDate);
  const description = plainText(
    `${r.title}${artistName ? ` — ${artistName}` : ''}: ${typeLabel}${date ? `, ${date}` : ''}. Участники и ссылки на площадки на Moooza.`,
    160,
  );
  const tracks: any[] = Array.isArray(r.tracklist) ? r.tracklist : [];
  const listen = safeHttpUrl(r.url);
  const platform = label(MEDIA_PLATFORM_LABELS, r.platform) ?? 'площадке';

  const trackItems = tracks.slice(0, 100)
    .filter((t) => typeof t?.title === 'string' && t.title)
    .map((t) => `<li>${escapeHtml(t.title)}${durationText(t.durationMs) ? ` <span class="ssr-note">${durationText(t.durationMs)}</span>` : ''}</li>`);

  const bodyHtml =
    image(ogImageUrl(r.coverUrl), r.title)
    + h1(r.title)
    + (artistPath && artistName ? `<p class="ssr-desc"><a href="${escapeHtml(artistPath)}">${escapeHtml(artistName)}</a></p>` : '')
    + facts([
      ['Тип', label(RELEASE_TYPE_LABELS, r.releaseType)],
      ['Дата выхода', date],
      ['Лейбл', r.label],
      ['Треков', r.trackCount ? String(r.trackCount) : (tracks.length ? String(tracks.length) : null)],
    ])
    + (trackItems.length ? `${h2('Треклист')}<ol class="ssr-list">${trackItems.join('')}</ol>` : '')
    + creditsHtml(r)
    + (listen ? linkList('Слушать', [{ href: listen, text: `Слушать на ${platform}` }], { external: true }) : '');

  return buildSnapshot({
    title: pageTitle(r.title, artistName, typeLabel),
    description,
    canonicalPath: path,
    indexable: res.status === 'ok',
    ogType: 'music.album',
    image: ogImageUrl(r.coverUrl),
    imageAlt: r.title,
    jsonLd: [musicAlbumLd(r, {
      url,
      artistUrl: artistPath ? siteUrl(artistPath) : null,
      profileUrl: (pid) => siteUrl(profilePath(pid)),
    })],
    crumbs: [
      { name: SITE_NAME, url: '/' },
      ...(artistPath && artistName ? [{ name: artistName, url: artistPath }] : []),
      { name: r.title },
    ],
    bodyHtml,
    lastModified: res.lastModified,
  });
}

export async function renderClip(id: string): Promise<RenderOutcome> {
  const res = await getPublicClip(id);
  if (res.status === 'not_found') return notFoundSnapshot();
  const c = res.data;
  const path = `/clips/${encodeURIComponent(c.id)}`;
  const url = siteUrl(path);
  const artistPath = c.artist ? artistPathOf(c.artist) : null;
  const artistName: string | null = c.artist?.name ?? null;
  const description = plainText(
    `${c.title}${artistName ? ` — ${artistName}` : ''}: клип. Участники и ссылки на площадки на Moooza.`,
    160,
  );
  const watch = safeHttpUrl(c.url);
  const platform = label(MEDIA_PLATFORM_LABELS, c.platform) ?? 'площадке';

  const bodyHtml =
    image(ogImageUrl(c.coverUrl), c.title)
    + h1(c.title)
    + (artistPath && artistName ? `<p class="ssr-desc"><a href="${escapeHtml(artistPath)}">${escapeHtml(artistName)}</a></p>` : '')
    + facts([['Тип', 'Клип'], ['Опубликован на Moooza', ruDate(c.createdAt)]])
    + creditsHtml(c)
    + (watch ? linkList('Смотреть', [{ href: watch, text: `Смотреть на ${platform}` }], { external: true }) : '');

  return buildSnapshot({
    title: pageTitle(c.title, artistName, 'клип'),
    description,
    canonicalPath: path,
    indexable: res.status === 'ok',
    ogType: 'video.other',
    image: ogImageUrl(c.coverUrl),
    imageAlt: c.title,
    jsonLd: [musicVideoLd(c, {
      url,
      artistUrl: artistPath ? siteUrl(artistPath) : null,
      description,
      profileUrl: (pid) => siteUrl(profilePath(pid)),
    })],
    crumbs: [
      { name: SITE_NAME, url: '/' },
      ...(artistPath && artistName ? [{ name: artistName, url: artistPath }] : []),
      { name: c.title },
    ],
    bodyHtml,
    lastModified: res.lastModified,
  });
}
