import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Чипсы значений фильтров профессии, сгруппированные по категориям («Жанр»,
 * «Инструмент», …). Категории — горизонтальные пилюли в одну строку с переносом.
 * Тап по пилюле раскрывает её чипсы ПРЯМО ЗА НЕЙ в том же потоке (визуально
 * привязано к нажатой категории); открыта максимум одна категория за раз.
 * Используется в блоке «Профессии» своего и чужого профиля.
 *
 * values: [{ id, value, filter?: { id, name } }] — filter уже приходит с сервера.
 */
export default function GroupedFilterChips({ values }: { values: any[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!values?.length) return null;

  const groups = new Map<string, { name: string; items: any[] }>();
  for (const v of values) {
    const gid = v.filter?.id ?? '__other__';
    if (!groups.has(gid)) groups.set(gid, { name: v.filter?.name ?? 'Другое', items: [] });
    groups.get(gid)!.items.push(v);
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {[...groups.entries()].map(([gid, g]) => {
        const isOpen = openId === gid;
        return (
          <span key={gid} className="contents">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpenId(isOpen ? null : gid); }}
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
            {/* Чипсы раскрытой категории — сразу за её пилюлей, в том же потоке */}
            {isOpen && g.items.map((cfv: any) => (
              <span key={cfv.id} className="text-[10px] bg-primary-500/10 border border-primary-500/20 text-slate-300 px-2 py-0.5 rounded-full">
                {cfv.value}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}
