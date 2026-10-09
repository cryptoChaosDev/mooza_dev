// Установка Moooza как PWA и определение платформы — для блока «Открыть или
// установить» на лендинге (components/landing/LaunchOptions.tsx).
import { useSyncExternalStore } from 'react';
import { isAndroidApp } from './androidApp';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

/**
 * Один раз при старте (main.tsx): Chrome присылает beforeinstallprompt сразу после
 * загрузки — раньше, чем откроется лендинг. Сохраняем событие, чтобы кнопка
 * «Android» открывала системный диалог установки.
 */
export function capturePwaInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // своя кнопка вместо мини-баннера Chrome
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** Браузер готов показать системный диалог установки (Chrome/Edge/Samsung Internet). */
export function useCanInstallPwa(): boolean {
  return useSyncExternalStore(
    (cb) => { subscribers.add(cb); return () => { subscribers.delete(cb); }; },
    () => deferred !== null,
    () => false,
  );
}

/** Показывает системный диалог установки. true — пользователь согласился. */
export async function promptPwaInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // событие одноразовое
  notify();
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  // iPad с iPadOS 13+ представляется Mac'ом — отличаем по сенсорному экрану.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** Уже открыто как приложение: PWA с экрана «Домой» или Android-приложение (TWA). */
export function isInstalledApp(): boolean {
  if (isAndroidApp()) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
