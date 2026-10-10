// «Сцена» — концерты по городам (server: routes/scene.ts, lib/sceneConcerts.ts).
import { api } from './api';

export type ScenePeriod = 'today' | 'weekend' | 'week' | 'month' | 'all';
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

export interface SceneConcertPage {
  city: { slug: string; name: string } | null;
  period: ScenePeriod;
  items: SceneConcert[];
  page: number;
  hasMore: boolean;
  total: number;
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
  concerts: (params: { city?: string; period?: ScenePeriod; page?: number; limit?: number }) =>
    api.get<SceneConcertPage>('/scene/concerts', { params }).then((r) => r.data),
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
