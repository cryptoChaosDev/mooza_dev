import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Чипсы значений фильтров профессии, сгруппированные по категориям (родительский
 * фильтр: «Жанр», «Инструмент», …). По умолчанию все группы свёрнуты — виден только
 * заголовок категории со счётчиком; тап раскрывает чипсы. Используется в блоке
 * «Профессии» своего (ProfilePage) и чужого (UserProfilePage) профиля.
 *
 * values: [{ id, value, filter?: { id, name } }] — filter уже приходит с сервера.
 */
export default function GroupedFilterChips({ values }: { values: any[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!values?.length) return null;

  const groups = new Map<string, { name: string; items: any[] }>();
  for (const v of values) {
    const gid = v.filter?.id ?? '__other__';
    if (!groups.has(gid)) groups.set(gid, { name: v.filter?.name ?? 'Другое', items: [] });
    groups.get(gid)!.items.push(v);
  }

  const toggle = (id: string) =>
    setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="mt-1.5 space-y-1">
      {[...groups.entries()].map(([gid, g]) => {
        const isOpen = open.has(gid);
        return (
          <div key={gid}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(gid); }}
              className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition-colors"
            >
              <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
              <span className="truncate">{g.name}</span>
              <span className="px-1.5 rounded-full bg-slate-700/60 text-slate-300 text-[10px] font-semibold flex-shrink-0">{g.items.length}</span>
            </button>
            {isOpen && (
              <div className="flex flex-wrap gap-1 mt-1 ml-4">
                {g.items.map((cfv: any) => (
                  <span key={cfv.id} className="text-[10px] bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded-full">
                    {cfv.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
