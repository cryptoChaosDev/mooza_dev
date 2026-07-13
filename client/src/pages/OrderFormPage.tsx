import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { orderAPI } from '../lib/api';
import OrderForm from '../components/OrderForm';

/**
 * Страница создания/редактирования Заказа — /orders/new и /orders/edit/:orderId.
 * Заменяет модалки (профиль, /orders, страница заказа): единая механика
 * «карточка = отдельная страница» для Профессий/Услуг/Заказов.
 */
export default function OrderFormPage() {
  const { orderId } = useParams<{ orderId?: string }>();
  const navigate = useNavigate();
  const isEdit = !!orderId;

  const { data: order, isLoading } = useQuery({
    queryKey: ['order-form', orderId],
    queryFn: async () => { const { data } = await orderAPI.getOne(orderId!); return data as any; },
    enabled: isEdit,
  });

  if (isEdit && isLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-teal-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      <div className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <ClipboardList size={16} className="text-teal-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">{isEdit ? 'Редактирование заказа' : 'Новый заказ'}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        <OrderForm order={isEdit ? order : undefined} onClose={() => navigate(-1)} />
      </div>
    </div>
  );
}
