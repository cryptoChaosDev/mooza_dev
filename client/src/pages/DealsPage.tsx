import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, HandshakeIcon } from 'lucide-react';
import { dealAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';
import { useAuthStore } from '../stores/authStore';

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  PENDING:          { label: 'На согласовании',  color: 'bg-amber-500/15 text-amber-400' },
  AWAITING_PAYMENT: { label: 'Ожидает оплаты',   color: 'bg-blue-500/15 text-blue-400' },
  IN_PROGRESS:      { label: 'В работе',          color: 'bg-primary-500/15 text-primary-400' },
  REVIEW:           { label: 'На проверке',       color: 'bg-violet-500/15 text-violet-400' },
  REVISION:         { label: 'На доработке',      color: 'bg-orange-500/15 text-orange-400' },
  COMPLETED:        { label: 'Завершена',         color: 'bg-emerald-500/15 text-emerald-400' },
  CANCELLED:        { label: 'Отменена',          color: 'bg-red-500/15 text-red-400' },
};

const ACTIVE_STATUSES = ['PENDING', 'AWAITING_PAYMENT', 'IN_PROGRESS', 'REVIEW', 'REVISION'];
const ARCHIVE_STATUSES = ['COMPLETED', 'CANCELLED'];

export default function DealsPage() {
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const [tab, setTab] = useState<'active' | 'archive'>('active');

  const { data: deals = [], isLoading } = useQuery<any[]>({
    queryKey: ['deals'],
    queryFn: async () => { const { data } = await dealAPI.getAll(); return data as any[]; },
  });

  const filtered = deals.filter(d =>
    tab === 'active' ? ACTIVE_STATUSES.includes(d.status) : ARCHIVE_STATUSES.includes(d.status)
  );

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800/60">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <HandshakeIcon size={16} className="text-primary-400" />
            <h1 className="text-base font-bold text-white">Мои сделки</h1>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2">
          {(['active', 'archive'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {t === 'active' ? 'Действующие' : 'Архив'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <HandshakeIcon size={36} className="text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">{tab === 'active' ? 'Нет активных сделок' : 'Архив пуст'}</p>
          </div>
        ) : filtered.map((deal: any) => {
          const isCustomer = me?.id === deal.customerId;
          const partner = isCustomer ? deal.executor : deal.customer;
          const partnerRole = isCustomer ? 'Исполнитель' : 'Заказчик';
          const badge = STATUS_BADGE[deal.status];
          return (
            <button key={deal.id} onClick={() => navigate(`/deals/${deal.id}`)}
              className="w-full flex items-center gap-3 p-4 bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 hover:border-slate-700 rounded-2xl transition-all text-left">
              <AvatarComponent src={partner?.avatar} name={`${partner?.firstName} ${partner?.lastName}`} size={44} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{deal.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{partner?.firstName} {partner?.lastName} · {partnerRole}</p>
                {deal.service && <p className="text-xs text-primary-400/70 mt-0.5 truncate">{deal.service.name}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {badge && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ${badge.color}`}>{badge.label}</span>}
                {deal.price != null && <span className="text-xs text-slate-400">{deal.price.toLocaleString('ru')} ₽</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
