// Статистика визитки артиста: «выстрелил и забыл». Просмотр — один на сессию
// вкладки на артиста (sessionStorage), переходы — на каждый клик по ссылке
// площадки/концерта. Сервер хранит только дневные счётчики (без ПДн) и сам
// отсекает ботов; ошибки сети/лимита пользователю не показываются.
import type { TrackTarget } from './linkPlatforms';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const VIEW_KEY_PREFIX = 'mooza_artist_view:';
// Подстраховка, когда sessionStorage недоступен (приватный режим, WebView)
// и от двойного эффекта StrictMode.
const viewedInMemory = new Set<string>();

function send(artistId: string, payload: { event: 'view' | 'click'; target?: TrackTarget }): void {
  try {
    const url = `${API_URL}/api/artists/${encodeURIComponent(artistId)}/track`;
    const body = JSON.stringify(payload);
    // text/plain — «простой» CORS-запрос без preflight; sendBeacon переживает
    // уход со страницы (переход в приложение площадки).
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
    }
    void fetch(url, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      keepalive: true,
      credentials: 'omit',
    }).catch(() => { /* статистика не должна мешать */ });
  } catch { /* статистика не должна мешать */ }
}

/** Переход по ссылке визитки (площадка, соцсеть, релиз, билеты). */
export function trackArtistClick(artistId: string | null | undefined, target: TrackTarget): void {
  if (!artistId) return;
  send(artistId, { event: 'click', target });
}

/** Просмотр визитки — не чаще раза за сессию вкладки на артиста. */
export function trackArtistViewOnce(artistId: string | null | undefined): void {
  if (!artistId || viewedInMemory.has(artistId)) return;
  viewedInMemory.add(artistId);
  const key = VIEW_KEY_PREFIX + artistId;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch { /* storage недоступен — хватит дедупа в памяти */ }
  send(artistId, { event: 'view' });
}
