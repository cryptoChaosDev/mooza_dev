import { useState, useEffect, useRef } from 'react';
import { authAPI } from '../lib/api';

interface TelegramLoginButtonProps {
  onAuth: (user: any, token: string) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

const BOT_NAME = 'moooza_auth_bot';
const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 5 * 60 * 1000;

export default function TelegramLoginButton({ onAuth, onError, disabled }: TelegramLoginButtonProps) {
  const [state, setState] = useState<'idle' | 'waiting' | 'done'>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef<number>(0);
  const tokenRef = useRef<string>('');

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => stopPolling(), []);

  const handleClick = async () => {
    if (disabled || state === 'waiting') return;
    onError('');
    try {
      const { data } = await authAPI.telegramToken();
      const token: string = data.token;
      tokenRef.current = token;

      window.open(`https://t.me/${BOT_NAME}?start=${token}`, '_blank');

      setState('waiting');
      startedRef.current = Date.now();

      pollRef.current = setInterval(async () => {
        if (Date.now() - startedRef.current > POLL_TIMEOUT) {
          stopPolling();
          setState('idle');
          onError('Время ожидания истекло. Попробуйте снова.');
          return;
        }
        try {
          const { data: res } = await authAPI.telegramPoll(token);
          if (res.status === 'ok') {
            stopPolling();
            setState('done');
            onAuth(res.user, res.token);
          }
        } catch (e: any) {
          if (e.response?.status === 404) {
            stopPolling();
            setState('idle');
            onError('Сессия истекла. Попробуйте снова.');
          }
        }
      }, POLL_INTERVAL);
    } catch {
      onError('Не удалось начать авторизацию. Попробуйте снова.');
    }
  };

  const handleCancel = () => {
    stopPolling();
    setState('idle');
    tokenRef.current = '';
  };

  if (state === 'waiting') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-3 bg-[#229ED9]/10 border border-[#229ED9]/30 rounded-xl text-sm text-[#5bb8e8] w-full justify-center">
          <span className="animate-pulse w-2 h-2 rounded-full bg-[#229ED9] flex-shrink-0" />
          Ожидаем подтверждения в Telegram...
        </div>
        <button onClick={handleCancel} className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
          Отмена
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state === 'done'}
      className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-[#229ED9] hover:bg-[#1a8bc4] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-lg shadow-[#229ED9]/20"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.026 9.547c-.148.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.24 14.238l-2.95-.924c-.642-.2-.654-.642.136-.953l11.527-4.443c.535-.194 1.003.13.609.33z"/>
      </svg>
      Войти через Telegram
    </button>
  );
}
