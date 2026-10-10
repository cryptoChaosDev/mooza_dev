// «Сцена» — концерты по городам (server: routes/scene.ts, lib/sceneConcerts.ts).
import { api } from './api';

export type ScenePeriod = 'today' | 'weekend' | 'week' | 'month' | 'all';
export type SceneSort = 'date' | 'price_asc' | 'price_desc' | 'new';

/** Фильтры ленты (в адресе: q, type, price, moooza, sort). */
export interface SceneFilterParams {
  q?: string;
  /** Через запятую: «Концерт,Фестиваль». */
  type?: string;
  priceMax?: number;
  moooza?: '1';
  sort?: SceneSort;
}

export const SCENE_TYPES = ['Концерт', 'Фестиваль', 'Рейв', 'Вечеринка'] as const;
export const SCENE_PRICES: Array<[number, string]> = [[1000, 'до 1 000 ₽'], [2000, 'до 2 000 ₽'], [3000, 'до 3 000 ₽'], [5000, 'до 5 000 ₽']];
export const SCENE_SORTS: Array<[SceneSort, string]> = [
  ['date', 'По дате'],
  ['price_asc', 'Сначала дешёвые'],
  ['price_desc', 'Сначала дорогие'],
  ['new', 'Новые в афише'],
];
export type ConcertSource = 'YANDEX_MUSIC' | 'MANUAL' | 'QTICKETS';

export interface SceneCity { slug: string; name: string; upcoming: number }

export interface SceneConcert {
  id: string;
  source: ConcertSource;
  title: string;
  type: string | null;
  /** ISO с местным поясом города («…T19:00:00+04:00»). */
  startsAt: string;
  hasTime: boolean;
  /** Смещение местного времени города от UTC, минут. */
  utcOffsetMin: number;
  cityName: string;
  citySlug: string;
  venue: string | null;
  address: string | null;
  url: string | null;
  ticketUrl: string | null;
  imageUrl: string | null;
  priceFrom: number | null;
  artist: { id: string; slug: string | null; name: string; avatar: string | null; verified: boolean } | null;
}

export interface SceneConcertDetail extends SceneConcert {
  description: string | null;
  /** ISO с местным поясом города; null — неизвестно. */
  endsAt: string | null;
  ageLimit: string | null;
  organizer: string | null;
  posterUrl: string | null;
  /** Показывается на «Сцене» (афиша или проверенный артист). */
  onScene: boolean;
  /** Об артисте Moooza (описание, жанры, слушатели, площадки «Слушать»). */
  artistAbout: {
    description: string | null;
    banner: string | null;
    listeners: number | null;
    genres: string[];
    listen: Record<string, string>;
  } | null;
}

export interface SceneConcertPageData {
  concert: SceneConcertDetail;
  moreByArtist: SceneConcert[];
  sameDay: SceneConcert[];
}

export interface SceneConcertPage {
  city: { slug: string; name: string } | null;
  period: ScenePeriod;
  items: SceneConcert[];
  page: number;
  hasMore: boolean;
  total: number;
  /** Точных совпадений не было — показаны похожие (поиск с опечатками). */
  fuzzy?: boolean;
}

export interface SceneSuggestions {
  events: Array<Pick<SceneConcert, 'id' | 'title' | 'startsAt' | 'hasTime' | 'utcOffsetMin' | 'cityName' | 'venue' | 'imageUrl'>>;
  artists: Array<{ id: string; slug: string | null; name: string; avatar: string | null }>;
  venues: Array<{ name: string; cityName: string; count: number }>;
  cities: SceneCity[];
  fuzzy?: boolean;
}

export interface NewConcertPayload {
  artistId: string;
  /** ГГГГ-ММ-ДД и ЧЧ:ММ — местное время города. */
  date: string;
  time: string;
  city: string;
  venue: string;
  ticketUrl?: string;
}

export const sceneAPI = {
  cities: () => api.get<{ cities: SceneCity[] }>('/scene/cities').then((r) => r.data.cities),
  concerts: (params: { city?: string; period?: ScenePeriod; page?: number; limit?: number } & SceneFilterParams) =>
    api.get<SceneConcertPage>('/scene/concerts', { params }).then((r) => r.data),
  concert: (id: string) => api.get<SceneConcertPageData>(`/scene/concerts/${id}`).then((r) => r.data),
  suggest: (q: string, city?: string) =>
    api.get<SceneSuggestions>('/scene/suggest', { params: { q, city } }).then((r) => r.data),
  artistConcerts: (artistId: string) =>
    api.get<{ items: SceneConcert[] }>(`/scene/artist/${artistId}/concerts`).then((r) => r.data.items),
  addConcert: (data: NewConcertPayload) => api.post<{ id: string }>('/scene/concerts', data),
  deleteConcert: (id: string) => api.delete(`/scene/concerts/${id}`),
};

export const SCENE_PERIODS: Array<[ScenePeriod, string]> = [
  ['all', 'Скоро'],
  ['today', 'Сегодня'],
  ['weekend', 'Выходные'],
  ['week', 'Неделя'],
  ['month', 'Месяц'],
];

export const SOURCE_LABEL: Record<ConcertSource, string> = {
  QTICKETS: 'Qtickets',
  YANDEX_MUSIC: 'Яндекс Афиша',
  MANUAL: 'от артиста',
};

// ─── Местное время концерта ──────────────────────────────────────────────────
// Время показываем по городу концерта (Самара — UTC+4), а не по устройству:
// сдвигаем момент на смещение города и форматируем «как UTC».

function localShift(c: Pick<SceneConcert, 'startsAt' | 'utcOffsetMin'>): Date {
  return new Date(Date.parse(c.startsAt) + c.utcOffsetMin * 60_000);
}

/** Ключ дня концерта по местному времени: ГГГГ-ММ-ДД. */
export function concertDayKey(c: Pick<SceneConcert, 'startsAt' | 'utcOffsetMin'>): string {
  return localShift(c).toISOString().slice(0, 10);
}

/** «19:00» по местному времени или null, если в источнике только дата. */
export function concertTime(c: Pick<SceneConcert, 'startsAt' | 'utcOffsetMin' | 'hasTime'>): string | null {
  if (!c.hasTime) return null;
  return localShift(c).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

/** «13 ноября» по местному времени. */
export function concertDate(c: Pick<SceneConcert, 'startsAt' | 'utcOffsetMin'>, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string {
  return localShift(c).toLocaleDateString('ru-RU', { ...opts, timeZone: 'UTC' });
}

/** Заголовок дня ленты: «Сегодня», «Завтра», «Пятница, 17 октября». */
export function dayHeading(dayKey: string, now = new Date()): string {
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const today = msk.toISOString().slice(0, 10);
  const tomorrow = new Date(msk.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (dayKey === today) return 'Сегодня';
  if (dayKey === tomorrow) return 'Завтра';
  const d = new Date(`${dayKey}T12:00:00Z`);
  const s = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function priceLabel(n: number | null): string | null {
  return n == null ? null : `от ${n.toLocaleString('ru-RU')} ₽`;
}

// ─── «Добавить в календарь» (.ics) ───────────────────────────────────────────

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUtc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Событие календаря (RFC 5545): время в UTC, без времени — на весь день. */
export function concertIcs(c: SceneConcertDetail, pageUrl: string): string {
  const start = Date.parse(c.startsAt);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moooza//Scene//RU', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${c.id}@moooza.ru`, `DTSTAMP:${icsUtc(new Date().toISOString())}`];
  if (c.hasTime) {
    lines.push(`DTSTART:${icsUtc(c.startsAt)}`);
    lines.push(`DTEND:${icsUtc(c.endsAt ?? new Date(start + 2 * 60 * 60 * 1000).toISOString())}`);
  } else {
    const day = concertDayKey(c).replace(/-/g, '');
    const next = new Date(Date.parse(`${concertDayKey(c)}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`);
  }
  lines.push(`SUMMARY:${icsText(c.title)}`);
  const where = [c.venue, c.address ?? c.cityName].filter(Boolean).join(', ');
  if (where) lines.push(`LOCATION:${icsText(where)}`);
  lines.push(`URL:${pageUrl}`);
  lines.push(`DESCRIPTION:${icsText([c.ticketUrl ? `Билеты: ${c.ticketUrl}` : null, pageUrl].filter(Boolean).join('\n'))}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadConcertIcs(c: SceneConcertDetail): void {
  const pageUrl = `${window.location.origin}/concerts/${c.id}`;
  const blob = new Blob([concertIcs(c, pageUrl)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'moooza-concert.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Адрес с городом: у Яндекс Афиши город в адресе не пишут («Транспортный пер., 10л»). */
export function addressWithCity(c: Pick<SceneConcert, 'address' | 'cityName'>): string | null {
  if (!c.address) return null;
  return c.address.toLowerCase().includes(c.cityName.toLowerCase()) ? c.address : `${c.address}, ${c.cityName}`;
}

/** Поиск площадки на Яндекс Картах (без API и ключей). */
export function mapsSearchUrl(c: Pick<SceneConcert, 'venue' | 'address' | 'cityName'>): string {
  const q = addressWithCity(c) ?? [c.venue, c.cityName].filter(Boolean).join(', ');
  return `https://yandex.ru/maps/?text=${encodeURIComponent(q)}`;
}

