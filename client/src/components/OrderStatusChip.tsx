/**
 * Статус-чип заказа — единый визуальный язык жизненного цикла:
 *   Черновик → Ищем исполнителя → В работе (исполнитель выбран) → Выполнен / В архиве.
 * Используется в профиле («Мои заказы»), на /orders и на странице заказа.
 */
export function orderStatusMeta(o: { status?: string; executorId?: string | null }) {
  if (o.status === 'draft') return { label: 'Черновик', cls: 'bg-slate-700/50 text-slate-300 border-slate-600/50' };
  if (o.status === 'archived') return { label: 'В архиве', cls: 'bg-slate-700/50 text-slate-400 border-slate-600/50' };
  if (o.status === 'done') return { label: '✓ Выполнен', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  if (o.executorId) return { label: 'В работе', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
  return { label: 'Ищем исполнителя', cls: 'bg-teal-500/15 text-teal-400 border-teal-500/30' };
}

export default function OrderStatusChip({ order, className = '' }: { order: { status?: string; executorId?: string | null }; className?: string }) {
  const m = orderStatusMeta(order);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${m.cls} ${className}`}>
      {m.label}
    </span>
  );
}
