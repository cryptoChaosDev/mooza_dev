import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface RailItem {
  id: string;
  title: string;
  coverUrl?: string | null;
}

interface Props {
  title: string;
  items: RailItem[];
  /** Route base: '/releases' or '/clips'. */
  to: string;
  /** Show the «Добавить» tile as the first item (admin edit mode). */
  showAdd?: boolean;
  onAdd?: () => void;
  /** Optional route for a «Смотреть все» link in the header (e.g. vacancies tabs). */
  seeAllTo?: string;
}

/** Horizontal slider of cover tiles for releases / clips on the artist page. */
export default function MediaRail({ title, items, to, showAdd = false, onAdd, seeAllTo }: Props) {
  const navigate = useNavigate();

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
        <div className="flex-1 h-px bg-slate-800" />
        {seeAllTo && (
          <button
            onClick={() => navigate(seeAllTo)}
            className="flex-shrink-0 text-[11px] font-medium text-primary-400 hover:text-primary-300 transition-colors"
          >
            Смотреть все
          </button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {showAdd && (
          <button
            onClick={onAdd}
            className="flex-shrink-0 w-28 flex flex-col items-center"
          >
            <div className="w-28 h-28 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900 flex items-center justify-center text-slate-500 hover:border-primary-500 hover:text-primary-400 transition-colors">
              <Plus size={26} />
            </div>
            <span className="mt-1.5 text-xs text-slate-500 text-center">Добавить</span>
          </button>
        )}

        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => navigate(`${to}/${it.id}`)}
            className="flex-shrink-0 w-28 flex flex-col items-center"
          >
            <div className="w-28 h-28 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center">
              {it.coverUrl ? (
                <img src={it.coverUrl} alt={it.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-slate-600 text-2xl font-bold">{it.title?.[0]?.toUpperCase()}</span>
              )}
            </div>
            <span className="mt-1.5 text-xs text-slate-300 text-center line-clamp-2 w-full">{it.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
