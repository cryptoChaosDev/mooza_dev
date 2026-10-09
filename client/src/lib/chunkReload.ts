// После деплоя открытая вкладка может ссылаться на уже удалённые чанки
// (или WebKit роняет загрузку модуля при сетевом сбое) — lazy-страница падает
// в ErrorBoundary. Один раз перезагружаем страницу на свежий бандл; гвард по
// времени в sessionStorage защищает от цикла перезагрузок.
const KEY = 'mooza_chunk_reload_at';
const WINDOW_MS = 20_000;

export function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(msg);
}

/** Перезагружает страницу, если не делали этого последние 20 с. Возвращает true, если перезагрузка начата. */
export function reloadOnceForChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
