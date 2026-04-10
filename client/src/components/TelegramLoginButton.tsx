import { useState, useEffect } from 'react';
import { authAPI } from '../lib/api';

interface TelegramLoginButtonProps {
  onAuth: (user: any, token: string) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

const BOT_ID = 8682289483; // numeric bot ID (from token prefix)

// Load Telegram widget script once
function loadTelegramScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).Telegram?.Login) { resolve(); return; }
    const existing = document.getElementById('tg-login-script');
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.id = 'tg-login-script';
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export default function TelegramLoginButton({ onAuth, onError, disabled }: TelegramLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const [scriptReady, setScriptReady] = useState(!!(window as any).Telegram?.Login);

  useEffect(() => {
    loadTelegramScript().then(() => setScriptReady(true));
  }, []);

  const handleClick = async () => {
    if (disabled || loading || !scriptReady) return;
    onError('');

    const tg = (window as any).Telegram?.Login;
    if (!tg) { onError('Telegram виджет не загружен. Обновите страницу.'); return; }

    setLoading(true);
    tg.auth({ bot_id: BOT_ID, request_access: 'write' }, async (tgUser: any) => {
      if (!tgUser) {
        // User closed the popup
        setLoading(false);
        return;
      }
      try {
        const { data } = await authAPI.telegramLogin(tgUser);
        onAuth(data.user, data.token);
      } catch (e: any) {
        onError(e.response?.data?.error || 'Ошибка авторизации через Telegram');
        setLoading(false);
      }
    });
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading || !scriptReady}
      className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-[#229ED9] hover:bg-[#1a8bc4] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-lg shadow-[#229ED9]/20"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.026 9.547c-.148.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.24 14.238l-2.95-.924c-.642-.2-.654-.642.136-.953l11.527-4.443c.535-.194 1.003.13.609.33z"/>
      </svg>
      {loading ? 'Ожидаем Telegram...' : 'Войти через Telegram'}
    </button>
  );
}
