import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Чипсы значений фильтров профессии, сгруппированные по категориям (родительский
 * фильтр: «Жанр», «Инструмент», …). Категории — ГОРИЗОНТАЛЬНЫЕ пилюли в одну строку
 * (с переносом), по умолчанию свёрнуты; тап по пилюле раскрывает её чипсы ниже.
 * Используется в блоке «Профессии» своего (ProfilePage) и чужого (UserProfilePage) профиля.
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
  const entries = [...groups.entries()];

  const toggle = (id: string) =>
    setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="mt-1.5 space-y-1.5">
      {/* Категории — горизонтальный ряд пилюль */}
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([gid, g]) => {
          const isOpen = open.has(gid);
          return (
            <button
              key={gid}
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(gid); }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                isOpen
                  ? 'bg-primary-600/20 border-primary-500/40 text-primary-300'
                  : 'bg-slate-800/70 border-slate-700/60 text-slate-400 hover:text-white'
              }`}
            >
              <span className="truncate max-w-[120px]">{g.name}</span>
              <span className={`text-[10px] font-semibold ${isOpen ? 'text-primary-300' : 'text-slate-500'}`}>{g.items.length}</span>
              <ChevronDown size={10} className={`transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          );
        })}
      </div>

      {/* Чипсы раскрытых категорий */}
      {entries.filter(([gid]) => open.has(gid)).map(([gid, g]) => (
        <div key={gid} className="flex flex-wrap items-center gap-1">
          {entries.filter(([id]) => open.has(id)).length > 1 && (
            <span className="text-[10px] text-slate-600 mr-0.5">{g.name}:</span>
          )}
          {g.items.map((cfv: any) => (
            <span key={cfv.id} className="text-[10px] bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded-full">
              {cfv.value}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
