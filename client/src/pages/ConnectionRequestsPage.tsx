import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Clock, X, Loader2 } from 'lucide-react';
import { connectionAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';
import ConnectionViewModal from '../components/ConnectionViewModal';

export default function ConnectionRequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const [viewConn, setViewConn] = useState<any>(null);

  const { data: received = [], isLoading: loadingR } = useQuery({
    queryKey: ['connections-requests'],
    queryFn: async () => { const { data } = await connectionAPI.getRequests(); return data as any[]; },
  });
  const { data: sent = [], isLoading: loadingS } = useQuery({
    queryKey: ['connections-sent'],
    queryFn: async () => { const { data } = await connectionAPI.getSent(); return data as any[]; },
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => connectionAPI.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections-sent'] }),
  });

  const isLoading = tab === 'received' ? loadingR : loadingS;
  const list = tab === 'received' ? received : sent;

  return (
    <>
    <div className="min-h-screen bg-slate-950">
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="px-4 pt-4 pb-3 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
              <ChevronLeft size={22} />
            </button>
            <h1 className="text-base font-bold text-white">Запросы связи</h1>
          </div>
          <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
            {([
              { id: 'received' as const, label: 'Получено', count: received.length },
              { id: 'sent' as const, label: 'Отправлено', count: sent.length },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t.id ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === t.id ? 'bg-white/20' : 'bg-slate-800 text-slate-400'}`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto pb-28">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-primary-500" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center px-6">
            <p className="text-slate-500 text-sm">
              {tab === 'received' ? 'Нет входящих запросов' : 'Нет отправленных запросов'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {tab === 'received' && received.map((c: any) => (
              <div
                key={c.id}
                onClick={() => setViewConn(c)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer"
              >
                <AvatarComponent src={c.partner.avatar} name={`${c.partner.firstName} ${c.partner.lastName}`} size={44} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.partner.firstName} {c.partner.lastName}</p>
                  {c.services?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.services.slice(0, 3).map((s: any) => (
                        <span key={s.id} className="text-[11px] bg-primary-500/10 text-primary-300 border border-primary-500/20 rounded-md px-1.5 py-0.5">{s.name}</span>
                      ))}
                      {c.services.length > 3 && <span className="text-[11px] text-slate-500">+{c.services.length - 3}</span>}
                    </div>
                  )}
                </div>
                <span className="text-xs text-primary-400 flex-shrink-0">Просмотреть</span>
              </div>
            ))}
            {tab === 'sent' && sent.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
                <button onClick={() => navigate(`/profile/${c.partner.id}`)} className="flex-shrink-0">
                  <AvatarComponent src={c.partner.avatar} name={`${c.partner.firstName} ${c.partner.lastName}`} size={44} />
                </button>
                <button onClick={() => navigate(`/profile/${c.partner.id}`)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-white truncate">{c.partner.firstName} {c.partner.lastName}</p>
                  {c.services?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.services.slice(0, 3).map((s: any) => (
                        <span key={s.id} className="text-[11px] bg-slate-700/60 text-slate-400 rounded-md px-1.5 py-0.5">{s.name}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={11} className="text-slate-600" />
                    <span className="text-xs text-slate-500">Ожидает ответа</span>
                  </div>
                </button>
                <button
                  onClick={() => cancelMut.mutate(c.id)}
                  disabled={cancelMut.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl text-xs font-medium border border-slate-700 hover:border-red-500/30 transition-all disabled:opacity-50 flex-shrink-0"
                >
                  <X size={12} /> Отменить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {viewConn && (
      <ConnectionViewModal
        connection={viewConn}
        onClose={() => {
          setViewConn(null);
          queryClient.invalidateQueries({ queryKey: ['connections-requests'] });
        }}
      />
    )}
    </>
  );
}
