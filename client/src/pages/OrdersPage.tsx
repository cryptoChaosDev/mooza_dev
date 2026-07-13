import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Briefcase, Calendar, Loader2, Archive, Send, Pencil } from 'lucide-react';
import { orderAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import OrderForm from '../components/OrderForm';
import OrderStatusChip from '../components/OrderStatusChip';
import { useScrollLock } from '../lib/scrollLock';

type Tab = 'active' | 'done' | 'archived' | 'draft';

const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Активные' },
  { key: 'done', label: 'Выполненные' },
  { key: 'archived', label: 'В архиве' },
  { key: 'draft', label: 'Черновики' },
];

const EMPTY_LABEL: Record<Tab, string> = {
  active: 'Нет активных заказов',
  done: 'Пока нет выполненных заказов',
  archived: 'Архив пуст',
  draft: 'Нет черновиков',
};

function formatDeadline(deadline?: string | null): string {
  return deadline ? new Date(deadline).toLocaleDateString('ru-RU') : 'Срок не ограничен';
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('active');
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  useScrollLock(!!editingOrder);

  const openEdit = async (id: string) => {
    setEditLoadingId(id);
    try {
      const { data } = await orderAPI.getOne(id);
      setEditingOrder(data);
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось открыть заказ для редактирования'));
    } finally {
      setEditLoadingId(null);
    }
  };

  const { data: orders = [], isLoading } = useQuery<any[]>({
    queryKey: ['orders', 'mine', tab],
    queryFn: async () => { const { data } = await orderAPI.getMine({ status: tab }); return data as any[]; },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => orderAPI.setStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders', 'mine'] });
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось изменить статус заказа')),
  });

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Briefcase size={16} className="text-teal-400" />
            <h1 className="text-base font-bold text-white">Мои заказы</h1>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${tab === t.key ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Briefcase size={36} className="text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">{EMPTY_LABEL[tab]}</p>
          </div>
        ) : orders.map((order: any) => {
          const sectionName = order.service?.section?.name ?? '';
          const hasResponses = (order._count?.responses ?? 0) > 0;
          // Editing is disabled once the order has responses (server-enforced too).
          const editBtn = (
            <button
              onClick={() => hasResponses
                ? toast.error('Заказ нельзя редактировать — на него уже есть отклики')
                : openEdit(order.id)}
              disabled={editLoadingId === order.id}
              className={`flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border rounded-lg transition-colors disabled:opacity-50 ${
                hasResponses ? 'border-slate-800 text-slate-500' : 'border-slate-700 text-slate-300 hover:text-white'
              }`}
              title={hasResponses ? 'Есть отклики — редактирование недоступно' : 'Редактировать'}
            >
              {editLoadingId === order.id ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
              Редактировать
            </button>
          );
          return (
            <div key={order.id} className="p-4 bg-slate-900/60 border border-slate-800/60 rounded-2xl space-y-3">
              <button onClick={() => navigate(`/orders/${order.id}`)} className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white truncate min-w-0">{order.title}</p>
                  <OrderStatusChip order={order} className="flex-shrink-0" />
                </div>
                {sectionName && <p className="text-xs text-slate-500 mt-0.5 truncate">{sectionName}</p>}
                {order.executor && (
                  <p className="text-xs text-amber-400/90 mt-0.5 truncate">Исполнитель: {order.executor.firstName} {order.executor.lastName}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-400">
                  <Calendar size={12} className="text-slate-500" />
                  <span>{formatDeadline(order.deadline)}</span>
                  {order._count?.responses != null && order._count.responses > 0 && (
                    <span className="ml-auto text-teal-400">Откликов: {order._count.responses}</span>
                  )}
                </div>
              </button>

              <div className="flex gap-2">
                {tab === 'active' && (
                  <>
                    {editBtn}
                    {order.executorId && (
                      <button
                        onClick={() => statusMut.mutate({ id: order.id, status: 'done' })}
                        disabled={statusMut.isPending}
                        className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {statusMut.isPending ? <Loader2 size={13} className="animate-spin" /> : '✓'}
                        Выполнен
                      </button>
                    )}
                    <button
                      onClick={() => statusMut.mutate({ id: order.id, status: 'archived' })}
                      disabled={statusMut.isPending}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {statusMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                      В архив
                    </button>
                  </>
                )}

                {tab === 'draft' && (
                  <>
                    <button
                      onClick={() => openEdit(order.id)}
                      disabled={editLoadingId === order.id}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {editLoadingId === order.id ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                      Редактировать
                    </button>
                    <button
                      onClick={() => statusMut.mutate({ id: order.id, status: 'active' })}
                      disabled={statusMut.isPending}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {statusMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      Опубликовать
                    </button>
                  </>
                )}

                {tab === 'archived' && (
                  <>
                    <button
                      onClick={() => statusMut.mutate({ id: order.id, status: 'active' })}
                      disabled={statusMut.isPending}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {statusMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      Опубликовать
                    </button>
                    {editBtn}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editingOrder && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={() => setEditingOrder(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-800 p-4 pb-8 shadow-2xl" onClick={e => e.stopPropagation()} style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' }}>
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
            <OrderForm
              order={editingOrder}
              onClose={() => {
                setEditingOrder(null);
                qc.invalidateQueries({ queryKey: ['orders', 'mine'] });
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
