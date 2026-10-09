// Аудиодемо в выдаче каталога: ОДИН глобальный плеер на всё приложение.
// Запуск другой карточки останавливает предыдущую; играем только первые
// 30 секунд. iOS: элемент создаётся и play() вызывается строго внутри обработчика
// тапа (иначе Safari блокирует звук), preload='none' — ничего не качаем заранее.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/** Сколько секунд демо играет в выдаче. */
export const DEMO_LIMIT_SEC = 30;

export interface DemoState {
  /** Ключ карточки, которая сейчас играет (не url: у одного исполнителя может быть несколько карточек). */
  key: string | null;
  status: 'idle' | 'loading' | 'playing';
  /** 0..1 — доля от min(длительность, 30 с). */
  progress: number;
}

let audio: HTMLAudioElement | null = null;
let state: DemoState = { key: null, status: 'idle', progress: 0 };
const listeners = new Set<() => void>();

function emit(next: Partial<DemoState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribeDemo(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getDemoState(): DemoState {
  return state;
}

/** Абсолютный адрес демо: сервер отдаёт только наши /uploads/… пути. */
export function demoSrc(url: string): string | null {
  if (typeof url !== 'string' || !/^\/uploads\/[\w\-./]+$/.test(url) || url.includes('..')) return null;
  return `${API_URL}${url}`;
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = 'none';
  a.addEventListener('timeupdate', () => {
    if (!state.key) return;
    const t = a.currentTime;
    if (t >= DEMO_LIMIT_SEC) { stopDemo(); return; }
    const dur = Number.isFinite(a.duration) && a.duration > 0 ? Math.min(a.duration, DEMO_LIMIT_SEC) : DEMO_LIMIT_SEC;
    emit({ progress: Math.min(1, t / dur) });
  });
  a.addEventListener('playing', () => { if (state.key) emit({ status: 'playing' }); });
  a.addEventListener('waiting', () => { if (state.key) emit({ status: 'loading' }); });
  a.addEventListener('ended', () => stopDemo());
  a.addEventListener('error', () => { if (state.key && a.getAttribute('src')) stopDemo(); });
  audio = a;
  return a;
}

/**
 * Запустить/остановить демо карточки. Вызывать СИНХРОННО из обработчика тапа.
 * Повторный тап по играющей карточке — стоп.
 */
export function toggleDemo(key: string, url: string): void {
  const src = demoSrc(url);
  if (!src) return;
  if (state.key === key && state.status !== 'idle') { stopDemo(); return; }
  const a = ensureAudio();
  // остальные плееры страницы (портфолио и т.п.) — на паузу
  document.querySelectorAll('audio').forEach((el) => { if (el !== a) el.pause(); });
  a.pause();
  a.src = src;
  emit({ key, status: 'loading', progress: 0 });
  const p = a.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => { if (state.key === key) stopDemo(); });
  }
}

export function stopDemo(): void {
  if (audio) {
    audio.pause();
    // сбрасываем источник — прерывает загрузку файла
    audio.removeAttribute('src');
    try { audio.load(); } catch { /* ignore */ }
  }
  if (state.key !== null || state.status !== 'idle') emit({ key: null, status: 'idle', progress: 0 });
}

/** Остановить, если играет именно эта карточка (уход со страницы / размонтирование). */
export function stopDemoIfKey(key: string): void {
  if (state.key === key) stopDemo();
}
