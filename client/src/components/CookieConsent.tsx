import { useState } from 'react';
import { Cookie } from 'lucide-react';
import { enableMetrika } from '../lib/metrika';

const COOKIE_KEY = 'mooza_cookie_consent';

function readConsent(): string | null {
  try { return localStorage.getItem(COOKIE_KEY); } catch { return null; }
}

// Компактная полоска внизу: на телефоне не перекрывает первый экран
// (раньше карточка занимала почти половину экрана до закрытия).
export default function CookieConsent() {
  const [visible, setVisible] = useState(() => !readConsent());

  if (!visible) return null;

  const accept = (level: 'all' | 'necessary') => {
    try { localStorage.setItem(COOKIE_KEY, level); } catch { /* приватный режим — просто скрываем */ }
    // Аналитика — только с согласия (Политика, п. 11.5).
    if (level === 'all') enableMetrika();
    setVisible(false);
  };

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[200] px-3 pt-2"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-2xl mx-auto bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl px-3 py-2 flex items-center gap-2 sm:gap-3">
        <Cookie size={16} className="text-primary-400 flex-shrink-0" />
        <p className="flex-1 min-w-0 text-xs text-slate-300 leading-snug">
          Мы используем cookies.{' '}
          <a href="/privacy" className="text-primary-400 hover:underline whitespace-nowrap">Подробнее</a>
        </p>
        <button
          onClick={() => accept('necessary')}
          className="flex-shrink-0 px-2 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          Только нужные
        </button>
        <button
          onClick={() => accept('all')}
          className="flex-shrink-0 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Принять
        </button>
      </div>
    </div>
  );
}
