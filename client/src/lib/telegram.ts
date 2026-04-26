// Minimal type declarations for Telegram Web App SDK
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      language_code?: string;
    };
  };
  colorScheme: 'light' | 'dark';
  ready: () => void;
  expand: () => void;
  close: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const twa = (): TelegramWebApp | null => window.Telegram?.WebApp ?? null;

export const IS_TMA = !!(
  typeof window !== 'undefined' &&
  window.Telegram?.WebApp?.initData
);

export function initTelegramApp() {
  const app = twa();
  if (!app) return;
  app.ready();
  app.expand();
  app.setHeaderColor('#020617');    // slate-950
  app.setBackgroundColor('#020617');
  app.disableVerticalSwipes?.();
}
