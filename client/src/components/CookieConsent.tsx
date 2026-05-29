import { useState } from 'react';
import { Cookie } from 'lucide-react';

const COOKIE_KEY = 'mooza_cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(COOKIE_KEY));

  if (!visible) return null;

  const accept = (level: 'all' | 'necessary') => {
    localStorage.setItem(COOKIE_KEY, level);
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-[200] p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="max-w-lg mx-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <Cookie size={20} className="text-primary-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white mb-1">Мы используем cookies</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Файлы cookie используются для аутентификации, хранения настроек и анализа работы сервиса.{' '}
              <a href="/privacy" className="text-primary-400 hover:underline">Политика конфиденциальности</a>
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => accept('all')}
            className="flex-1 py-2.5 px-4 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Принять все
          </button>
          <button
            onClick={() => accept('necessary')}
            className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors border border-slate-700"
          >
            Только необходимые
          </button>
        </div>
      </div>
    </div>
  );
}
