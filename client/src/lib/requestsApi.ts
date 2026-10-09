// «Ищу музыканта» — клиент /api/requests (server/src/routes/requests.ts).
// Отдельный модуль, чтобы не трогать общий lib/api.ts.
import { api } from './api';

export type RequestChipKind = 'profession' | 'genre' | 'city' | 'remote' | 'date' | 'dateHint' | 'budget' | 'service';

export interface RequestChip {
  kind: RequestChipKind;
  id?: string;
  label: string;
  removable: boolean;
}

/** Правки поверх разбора. Ключ не передан — берётся из текста. */
export interface RequestOverrides {
  professionIds?: string[];
  genreIds?: string[];
  city?: string | null;
  isRemote?: boolean;
  /** «ГГГГ-ММ-ДД» (календарный день; сервер хранит конец дня по МСК) или null. */
  date?: string | null;
  dateHint?: null;
  budget?: { from: number | null; to: number | null } | null;
  serviceId?: string;
}

export interface ParsedRequest {
  professionIds: string[];
  genreIds: string[];
  cityName: string | null;
  isRemote: boolean;
  date: string | null;
  dateHint: string | null;
  budgetFrom: number | null;
  budgetTo: number | null;
  isFree: boolean;
  serviceId: string | null;
  title: string;
  unknownTokens: string[];
}

export interface ParseResponse {
  parsed: ParsedRequest;
  chips: RequestChip[];
  professions: Array<{ id: string; name: string }>;
  service: { id: string; name: string; sectionName: string | null } | null;
  serviceOptions: Array<{ id: string; name: string; sectionName: string | null }>;
  estimatedMatches: number;
  needsProfession: boolean;
  errors: string[];
}

export interface PreviewUser {
  id: string;
  displayName: string;
  avatar: string | null;
  isVerified: boolean;
  profession: string | null;
  city: string | null;
}

export interface CreateRequestResponse {
  orderId: string;
  title: string;
  notifiedCount: number;
  previewUsers: PreviewUser[];
  remainingToday: number;
}

export const requestsAPI = {
  parse: (text: string, overrides?: RequestOverrides) =>
    api.post<ParseResponse>('/requests/parse', { text, overrides }),
  create: (text: string, overrides: RequestOverrides) =>
    api.post<CreateRequestResponse>('/requests', { text, overrides }),
  quota: () => api.get<{ limit: number; used: number; remaining: number }>('/requests/quota'),
  /** Голосовой ввод: запись ≤ 30 с → распознанный текст (наш STT, гостю тоже). */
  transcribe: (audio: Blob, mimeType: string, ext: string, signal?: AbortSignal) => {
    const fd = new FormData();
    fd.append('audio', new File([audio], `voice.${ext}`, { type: mimeType }));
    return api.post<{ text: string }>('/requests/transcribe', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
      // Очередь распознавания (до минуты) + сама расшифровка.
      timeout: 100_000,
    });
  },
};
