// «Биржа лайнапов»: API, типы, подписи и дата+время события по МСК.
// Событие — календарная дата (маска ДД.ММ.ГГГГ, как сроки в mskDate.ts) +
// время начала (маска ЧЧ:ММ); на сервер уходит момент UTC, показ — по Москве.
import { api } from './api';
import { parseMaskedDate, isoToMaskedMsk } from './mskDate';

export type SlotType = 'opener' | 'headliner' | 'any';
export type FeeType = 'fixed' | 'percent' | 'free' | 'negotiable';
export type LineupStatus = 'active' | 'closed' | 'draft';
export type LineupResponseStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';
export type InviteResult = 'sent' | 'limited' | 'unavailable' | 'self' | 'duplicate' | null;

export interface LineupGenre { id: string; name: string }

export interface LineupPerson {
  id: string | null;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  nickname?: string | null;
  avatar?: string | null;
  isPublic?: boolean;
}

export interface LineupArtistCard {
  id: string;
  slug: string | null;
  name: string;
  type: string | null;
  avatar: string | null;
  city: string | null;
  tourReady: string | null;
  status: string;
  listeners: number;
  listenersDelta: number | null;
  genres: LineupGenre[];
  releases: Array<{ id: string; title: string; coverUrl: string | null; releaseDate: string | null; url: string | null; platform: string | null }>;
  concerts: Array<{ title: string; date: string; city: string | null; place: string | null; url: string | null }>;
  href: string;
}

export interface LineupResponseItem {
  id: string;
  status: LineupResponseStatus;
  message: string;
  createdAt: string;
  artist: LineupArtistCard | null;
  submittedBy: { id: string; firstName: string; lastName: string; avatar: string | null } | null;
  contactUserId: string | null;
}

export interface MyArtistResponse { id: string; artistId: string; status: LineupResponseStatus; message: string; createdAt: string }

export interface RespondAsArtist {
  id: string;
  slug: string | null;
  name: string;
  avatar: string | null;
  status: string;
  city: string | null;
  response: MyArtistResponse | null;
}

export interface Lineup {
  id: string;
  authorId?: string;
  title: string;
  eventDate: string;
  cityId?: string | null;
  cityName: string;
  venue: string | null;
  slots: number;
  slotType: SlotType;
  feeType: FeeType;
  feeAmount: number | null;
  description: string;
  requirements: string | null;
  status: LineupStatus;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  genres: LineupGenre[];
  author: LineupPerson | null;
  responsesCount: number;
  acceptedCount: number;
  isAuthor: boolean;
  indexable?: boolean;
  pendingCount?: number;
  responses?: LineupResponseItem[];
  respondAs?: RespondAsArtist[];
  myResponses?: MyArtistResponse[];
  invite?: InviteResult;
}

export interface LineupPage { items: Lineup[]; page: number; limit: number; total: number; hasMore: boolean }

export interface MyLineupResponse {
  id: string;
  status: LineupResponseStatus;
  message: string;
  createdAt: string;
  artist: { id: string; slug: string | null; name: string; avatar: string | null } | null;
  request: {
    id: string; title: string; eventDate: string; cityName: string; venue: string | null; status: LineupStatus;
    slots: number; slotType: SlotType; feeType: FeeType; feeAmount: number | null;
    author: { id: string; firstName: string; lastName: string; avatar: string | null } | null;
  };
}

export interface ManagedArtist { id: string; slug: string | null; name: string; avatar: string | null; status: string; city: string | null }

export interface LineupPayload {
  title: string;
  eventDate: string;
  cityName: string;
  venue: string | null;
  genreIds: string[];
  slots: number;
  slotType: SlotType;
  feeType: FeeType;
  feeAmount: number | null;
  description: string;
  requirements: string | null;
  status: 'active' | 'draft';
  inviteArtistId?: string | null;
}

export interface LineupListParams {
  city?: string;
  genre?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: 'new' | 'date';
  page?: number;
  limit?: number;
}

export const lineupAPI = {
  list: (params: LineupListParams) => api.get<LineupPage>('/lineups', { params }),
  mine: () => api.get<Lineup[]>('/lineups/mine'),
  myResponses: () => api.get<MyLineupResponse[]>('/lineups/responses/mine'),
  myArtists: () => api.get<ManagedArtist[]>('/lineups/my-artists'),
  get: (id: string) => api.get<Lineup>(`/lineups/${id}`),
  create: (data: LineupPayload) => api.post<Lineup>('/lineups', data),
  update: (id: string, data: LineupPayload) => api.put<Lineup>(`/lineups/${id}`, data),
  close: (id: string) => api.patch(`/lineups/${id}/close`),
  respond: (id: string, data: { artistId: string; message: string }) => api.post(`/lineups/${id}/respond`, data),
  accept: (responseId: string) =>
    api.patch<{ ok: boolean; acceptedCount: number; slots: number; slotsFilled: boolean }>(`/lineups/responses/${responseId}/accept`),
  decline: (responseId: string) => api.patch(`/lineups/responses/${responseId}/decline`),
  withdraw: (responseId: string) => api.patch(`/lineups/responses/${responseId}/withdraw`),
};

// ── Подписи ──────────────────────────────────────────────────────────────────

export const SLOT_TYPE_OPTIONS: Array<{ id: SlotType; label: string; hint: string }> = [
  { id: 'opener', label: 'Разогрев', hint: 'Открыть вечер' },
  { id: 'headliner', label: 'Хедлайнер', hint: 'Главный артист' },
  { id: 'any', label: 'Любой', hint: 'Обсудим' },
];

export const FEE_TYPE_OPTIONS: Array<{ id: FeeType; label: string }> = [
  { id: 'fixed', label: 'Фиксированный' },
  { id: 'percent', label: '% от входа' },
  { id: 'negotiable', label: 'По договорённости' },
  { id: 'free', label: 'Без гонорара' },
];

export function slotTypeLabel(v?: string | null): string {
  return SLOT_TYPE_OPTIONS.find((o) => o.id === v)?.label ?? 'Любой слот';
}

export function feeLabel(feeType?: string | null, feeAmount?: number | null): string {
  if (feeType === 'fixed' && feeAmount != null) return `${feeAmount.toLocaleString('ru-RU')} ₽`;
  if (feeType === 'percent' && feeAmount != null) return `${feeAmount}% от входа`;
  if (feeType === 'free') return 'Без гонорара';
  return 'Гонорар по договорённости';
}

export const RESPONSE_STATUS_LABEL: Record<LineupResponseStatus, string> = {
  pending: 'На рассмотрении',
  accepted: 'Принят',
  declined: 'Отклонён',
  withdrawn: 'Отозван',
};

export const RESPONSE_STATUS_CLASS: Record<LineupResponseStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  accepted: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  declined: 'bg-slate-800/60 text-slate-400 border-slate-700/60',
  withdrawn: 'bg-slate-800/60 text-slate-500 border-slate-700/60',
};

export function isEventPast(iso?: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

/** Подпись статуса запроса для бейджа (null — активный и событие впереди). */
export function lineupStatusBadge(l: Pick<Lineup, 'status' | 'eventDate'>): { label: string; cls: string } | null {
  if (l.status === 'draft') return { label: 'Черновик', cls: 'bg-slate-800/60 text-slate-300 border-slate-700/60' };
  if (l.status === 'closed') return { label: 'Закрыт', cls: 'bg-slate-800/60 text-slate-400 border-slate-700/60' };
  if (isEventPast(l.eventDate)) return { label: 'Событие прошло', cls: 'bg-slate-800/60 text-slate-400 border-slate-700/60' };
  return null;
}

// ── Дата + время по МСК ──────────────────────────────────────────────────────

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Маска ввода времени: цифры → «ЧЧ:ММ». */
export function maskTimeInput(raw: string): string {
  let v = raw.replace(/\D/g, '').slice(0, 4);
  if (v.length >= 3) v = `${v.slice(0, 2)}:${v.slice(2)}`;
  return v;
}

/** Строгий разбор «ЧЧ:ММ» (00:00–23:59). */
export function parseMaskedTime(v: string): { h: number; m: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]); const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return { h, m: mm };
}

/** «ДД.ММ.ГГГГ» + «ЧЧ:ММ» по Москве → ISO-момент UTC; null, если что-то некорректно. */
export function mskDateTimeToIso(dateMasked: string, timeMasked: string): string | null {
  const day = parseMaskedDate(dateMasked);
  const time = parseMaskedTime(timeMasked);
  if (!day || !time) return null;
  return new Date(Date.UTC(day.y, day.m - 1, day.d, time.h, time.m) - MSK_OFFSET_MS).toISOString();
}

/** ISO-момент → «ЧЧ:ММ» по Москве (префилл формы). */
export function isoToMskTime(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const msk = new Date(t + MSK_OFFSET_MS);
  return `${String(msk.getUTCHours()).padStart(2, '0')}:${String(msk.getUTCMinutes()).padStart(2, '0')}`;
}

/** ISO-момент → «ДД.ММ.ГГГГ» по Москве (префилл формы). */
export const isoToMskDate = isoToMaskedMsk;

/** «сб, 15 ноября 2026 · 20:00 МСК» — одинаково в любом часовом поясе. */
export function formatEventDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
  return `${date.replace(/\s*г\.$/, '')} · ${time} МСК`;
}

/** Плитка даты: { day: '15', month: 'ноя' } по Москве. */
export function eventDayTile(iso?: string | null): { day: string; month: string; time: string } {
  if (!iso) return { day: '—', month: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: '—', month: '', time: '' };
  return {
    day: d.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric' }),
    month: d.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', month: 'short' }).replace('.', ''),
    time: d.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }),
  };
}

/** Короткая дата концерта/релиза по МСК: «15.11.2026». */
export function formatShortDateMsk(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
}

export function formatListeners(n?: number | null): string {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace('.', ',')} млн`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 100_000 ? 0 : 1).replace('.', ',')} тыс.`;
  return String(v);
}

/** Тексты результата персонального приглашения (?artist=). */
export function inviteResultToast(r: InviteResult | undefined): { type: 'success' | 'info'; text: string } | null {
  switch (r) {
    case 'sent': return { type: 'success', text: 'Приглашение отправлено админам артиста' };
    case 'limited': return { type: 'info', text: 'Приглашение не отправлено: суточный лимит приглашений исчерпан' };
    case 'self': return { type: 'info', text: 'Это ваш артист — приглашение не нужно' };
    case 'unavailable': return { type: 'info', text: 'Не удалось отправить приглашение этому артисту' };
    default: return null;
  }
}
