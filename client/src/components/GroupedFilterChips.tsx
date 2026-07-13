/**
 * Значения фильтров профессии в блоке «Профессии» (свой и чужой профиль).
 * Табличный вид — идентично фильтрам на карточках Заказа и Услуги:
 * название категории в фиксированной колонке слева, чипсы справа; все чипсы
 * начинаются с одной вертикали, ничего не сворачивается.
 *
 * values: [{ id, value, filter?: { id, name } }] — filter приходит с сервера.
 */
export default function GroupedFilterChips({ values }: { values: any[] }) {
  if (!values?.length) return null;

  const groups = new Map<string, { name: string; items: any[] }>();
  for (const v of values) {
    const gid = v.filter?.id ?? '__other__';
    if (!groups.has(gid)) groups.set(gid, { name: v.filter?.name ?? 'Другое', items: [] });
    groups.get(gid)!.items.push(v);
  }

  return (
    <div className="mt-1.5 grid grid-cols-[92px_1fr] gap-x-2.5 gap-y-1.5">
      {[...groups.entries()].map(([gid, g]) => (
        <div key={gid} className="contents">
          <span className="text-xs text-slate-500 pt-0.5 leading-snug break-words">{g.name}</span>
          <div className="flex flex-wrap gap-1 content-start">
            {g.items.map((cfv: any) => (
              <span key={cfv.id} className="px-2 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full text-xs text-slate-300">
                {cfv.value}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
