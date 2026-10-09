// Android-приложение Moooza — TWA (Trusted Web Activity), пакет ru.moooza.app,
// проект в android/ (twa-manifest.json). Приложение открывает этот же сайт в
// Chrome без адресной строки (связь домена — client/public/.well-known/assetlinks.json).

export const ANDROID_PACKAGE = 'ru.moooza.app';
export const ANDROID_APK_URL = '/moooza.apk';

// sessionStorage, а не localStorage: хранилище TWA общее с Chrome на телефоне —
// флаг из localStorage «протёк» бы в обычный браузер.
const APP_FLAG_KEY = 'mooza_android_app';

/**
 * Один раз при старте, до роутера. Приложение стартует с /?app=android
 * (startUrl в twa-manifest.json; работает и в запасном WebView), Chrome вдобавок
 * ставит referrer android-app://ru.moooza.app. Параметр убираем из адреса.
 */
export function detectAndroidApp(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get('app') === 'android';
    if (fromParam || document.referrer.startsWith(`android-app://${ANDROID_PACKAGE}`)) {
      sessionStorage.setItem(APP_FLAG_KEY, '1');
    }
    if (fromParam) {
      params.delete('app');
      const qs = params.toString();
      window.history.replaceState(window.history.state, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    }
  } catch { /* приватный режим / нет storage — считаем, что это сайт */ }
}

/** Запущено из Android-приложения. */
export function isAndroidApp(): boolean {
  try { return sessionStorage.getItem(APP_FLAG_KEY) === '1'; } catch { return false; }
}

/** Обычный браузер на Android (не приложение и не установленная PWA) — кому предлагать APK. */
export function isAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined' || !/Android/i.test(navigator.userAgent)) return false;
  if (isAndroidApp()) return false;
  try { return !window.matchMedia('(display-mode: standalone)').matches; } catch { return true; }
}
