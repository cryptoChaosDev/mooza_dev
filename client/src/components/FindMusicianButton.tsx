import { Link } from 'react-router-dom';
import { UserSearch, ChevronRight } from 'lucide-react';

/**
 * Точка входа в «Ищу музыканта» (/find).
 *  - pill   — компактная кнопка в шапке Потока;
 *  - banner — полоса над каталогом в Поиске.
 * Гостю страница открыта (разбор и оценка), отправка — через AuthGate.
 */
export default function FindMusicianButton({ variant = 'pill' }: { variant?: 'pill' | 'banner' }) {
  if (variant === 'banner') {
    return (
      <Link
        to="/find"
        className="mt-3 flex items-center gap-3 px-3.5 py-3 rounded-2xl border border-primary-500/25 bg-primary-500/10 hover:bg-primary-500/15 transition-colors"
      >
        <span className="w-9 h-9 rounded-xl bg-primary-600/25 flex items-center justify-center flex-shrink-0">
          <UserSearch size={18} className="text-primary-300" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-white">Ищу музыканта</span>
          <span className="block text-xs text-slate-400 leading-snug">Опишите задачу одной фразой — разошлём запрос подходящим исполнителям</span>
        </span>
        <ChevronRight size={18} className="text-slate-500 flex-shrink-0" />
      </Link>
    );
  }
  return (
    <Link
      to="/find"
      title="Ищу музыканта"
      aria-label="Ищу музыканта"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/20 transition-colors"
    >
      <UserSearch size={15} />
      <span className="hidden min-[380px]:inline">Ищу музыканта</span>
    </Link>
  );
}
