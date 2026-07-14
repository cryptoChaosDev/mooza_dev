import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface RailItem {
  id: string;
  title: string;
  coverUrl?: string | null;
  /** Optional second line under the title (e.g. «Профессия · Формат» for vacancies). */
  subtitle?: string;
  /** Optional status chip shown on the tile (e.g. vacancy draft/active/archived). */
  badge?: { label: string; className: string };
}

interface Props {
  title: string;
  items: RailItem[];
  /** Route base: '/releases' or '/clips'. */
  to: string;
  /** Иконка в шапке карточки (Disc3 / Clapperboard / Briefcase). */
  icon?: LucideIcon;
  /** Show the «+ Добавить» action in the card header (admin edit mode). */
  showAdd?: boolean;
  onAdd?: () => void;
  /** Optional route for a «Смотреть все» link in the header (e.g. vacancies tabs). */
  seeAllTo?: string;
  /** Optional count shown next to the title (e.g. active vacancies). */
  count?: number;
}

/**
 * Горизонтальный слайдер плиток (релизы / клипы / вакансии) на странице артиста.
 * Оформлен карточкой в едином стиле блоков профиля (шапка с иконкой + тело).
 */
export default function MediaRail({ title, items, to, icon: Icon, showAdd = false, onAdd, seeAllTo, count }: Props) {
  const navigate = useNavigate();
  const shownCount = count ?? items.length;

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden mb-3">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
        {Icon && <Icon size={14} className="text-primary-400" />}
        <span className="text-sm font-semibold text-white">{title}</span>
        {shownCount > 0 && <span className="text-xs text-slate-500">{shownCount}</span>}
        <div className="ml-auto flex items-center gap-3">
          {seeAllTo && (
            <button
              onClick={() => navigate(seeAllTo)}
              className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
            >
              Смотреть все
            </button>
          )}
          {showAdd && (
            <button
              onClick={onAdd}
              className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
            >
              + Добавить
            </button>
          )}
        </div>
      </div>

      <div className="p-3">
        {items.length === 0 ? (
          <p className="text-xs text-slate-600 italic">Пока пусто</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => navigate(`${to}/${it.id}`)}
                className="flex-shrink-0 w-28 flex flex-col items-center"
              >
                <div className="relative w-28 h-28 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center">
                  {it.coverUrl ? (
                    <img src={it.coverUrl} alt={it.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-slate-600 text-2xl font-bold">{it.title?.[0]?.toUpperCase()}</span>
                  )}
                  {it.badge && (
                    <span className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-semibold leading-none ${it.badge.className}`}>
                      {it.badge.label}
                    </span>
                  )}
                </div>
                <span className="mt-1.5 text-xs text-slate-300 text-center line-clamp-2 w-full">{it.title}</span>
                {it.subtitle && <span className="text-[10px] text-slate-500 text-center line-clamp-1 w-full">{it.subtitle}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
