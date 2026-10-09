/**
 * Клиент STT-сервиса (контейнер mooza-stt: Flask + Vosk + ffmpeg, stt/app.py).
 *
 *   POST {STT_URL}/transcribe, multipart: file (аудио), max_seconds (необязательно)
 *     → 200 { text, duration? }
 *     → 503 { error: 'busy' }       — оба слота распознавания заняты дольше 60 с;
 *     → 413 { error: 'too long' }   — запись длиннее max_seconds;
 *     → 422 { error: 'ffmpeg …' }   — файл не читается как аудио.
 *
 * Параллельность ограничивает сам сервис (семафор STT_MAX_PARALLEL, по умолчанию
 * 2; остальные запросы ждут в очереди до 60 с). Аудио передаётся из памяти и
 * нигде не сохраняется на стороне API.
 *
 * Используют: расшифровка голосовых в чате (routes/messages.ts) и голосовой ввод
 * «Ищу музыканта» (routes/requests.ts).
 */

export class SttBusyError extends Error {
  constructor() { super('stt busy'); this.name = 'SttBusyError'; }
}

export class SttTooLongError extends Error {
  constructor() { super('stt: audio too long'); this.name = 'SttTooLongError'; }
}

export class SttBadAudioError extends Error {
  constructor() { super('stt: unreadable audio'); this.name = 'SttBadAudioError'; }
}

export interface SttOptions {
  /** Таймаут всего запроса (очередь + распознавание), мс. По умолчанию 120 с. */
  timeoutMs?: number;
  /**
   * Предел длительности, с: STT декодирует не больше max_seconds + 1 с и на
   * более длинную запись отвечает 413. Образ STT без поддержки поля его
   * игнорирует (тогда работает только его собственный предел ~5,5 мин).
   */
  maxSeconds?: number;
  mimeType?: string;
  filename?: string;
}

export interface SttResult {
  text: string;
  /** Длительность декодированного аудио, с (если STT её сообщает). */
  duration: number | null;
}

export function sttBaseUrl(): string {
  return process.env.STT_URL || 'http://stt:5005';
}

export async function transcribeAudio(audio: Buffer, opts: SttOptions = {}): Promise<SttResult> {
  const fd = new FormData();
  fd.append('file', new Blob([audio], opts.mimeType ? { type: opts.mimeType } : undefined), opts.filename || 'audio');
  if (opts.maxSeconds) fd.append('max_seconds', String(opts.maxSeconds));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000);
  try {
    const resp = await fetch(`${sttBaseUrl()}/transcribe`, { method: 'POST', body: fd, signal: ctrl.signal });
    if (resp.status === 503) throw new SttBusyError();
    if (resp.status === 413) throw new SttTooLongError();
    if (resp.status === 422) throw new SttBadAudioError();
    if (!resp.ok) throw new Error(`stt ${resp.status}`);
    const data: any = await resp.json();
    const duration = Number(data?.duration);
    return {
      text: String(data?.text ?? '').trim(),
      duration: data?.duration != null && Number.isFinite(duration) ? duration : null,
    };
  } finally {
    clearTimeout(timer);
  }
}
