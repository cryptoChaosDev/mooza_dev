import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, X } from 'lucide-react';

const DISMISSED_KEY = 'mooza_lineups_tile_dismissed';

/**
 * Плитка-вход в «Биржу лайнапов» в ленте: «Ищете артиста на концерт?».
 * Закрывается до конца сессии вкладки (sessionStorage) — на мобильном это
 * основной вход в /lineups (нижнее меню не перегружаем).
 */
export default function LineupsEntryTile() {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
  });
  if (dismissed) return null;
  const close = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDismissed(true);
    try { sessionStorage.setItem(DISMISSED_KEY, '1'); } catch { /* ignore */ }
  };
  return (
    <Link
      to="/lineups"
      className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary-600/15 to-amber-500/10 border border-primary-500/30 hover:border-primary-500/50 rounded-2xl transition-colors"
    >
      <div className="w-9 h-9 rounded-xl bg-primary-500/20 flex items-center justify-center flex-shrink-0">
        <CalendarDays size={18} className="text-primary-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-tight">Ищете артиста на концерт?</p>
        <p className="text-xs text-slate-400 leading-snug mt-0.5">Биржа лайнапов: разместите запрос — артисты откликнутся сами</p>
      </div>
      <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
      <button onClick={close} aria-label="Скрыть" className="p-1 -mr-1 text-slate-500 hover:text-white flex-shrink-0">
        <X size={14} />
      </button>
    </Link>
  );
}
