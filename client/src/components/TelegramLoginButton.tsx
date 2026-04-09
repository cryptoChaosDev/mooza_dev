import { useEffect, useRef } from 'react';

interface TelegramLoginButtonProps {
  onAuth: (data: Record<string, string | number>) => void;
  disabled?: boolean;
}

declare global {
  interface Window {
    onTelegramAuth: (user: Record<string, string | number>) => void;
  }
}

const BOT_NAME = 'MooozaAuthBot';

export default function TelegramLoginButton({ onAuth, disabled }: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.onTelegramAuth = onAuth;

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', BOT_NAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-radius', '12');
    script.async = true;

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(script);
    }

    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, [onAuth]);

  return (
    <div
      ref={containerRef}
      className={`flex justify-center ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    />
  );
}
