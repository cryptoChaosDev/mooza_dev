import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Check, X, Clock, Loader2 } from 'lucide-react';
import { friendshipAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';

export default function FriendRequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'received' | 'sent'>('received');

  const { data: received = [], isLoading: loadingR } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: async () => { const { data } = await friendshipAPI.getRequests(); return data as any[]; },
  });
  const { data: sent = [], isLoading: loadingS } = useQuery({
    queryKey: ['friend-requests-sent'],
    queryFn: async () => { const { data } = await friendshipAPI.getSentRequests(); return data as any[]; },
  });

  const acceptMut = useMutation({
    mutationFn: (id: string) => friendshipAPI.acceptRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
  const rejectMut = useMutation({
    mutationFn: (id: string) => friendshipAPI.rejectRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friend-requests'] }),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => friendshipAPI.rejectRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friend-requests-sent'] }),
  });

  const isLoading = tab === 'received' ? loadingR : loadingS;
  const list = tab === 'received' ? received : sent;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="px-4 pt-4 pb-3 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
              <ChevronLeft size={22} />
            </button>
            <h1 className="text-base font-bold text-white">Запросы дружбы</h1>
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
            {tab === 'received' && received.map((req: any) => (
              <div key={req.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
                <button onClick={() => navigate(`/profile/${req.requester.id}`)} className="flex-shrink-0">
                  <AvatarComponent src={req.requester.avatar} name={`${req.requester.firstName} ${req.requester.lastName}`} size={44} />
                </button>
                <button onClick={() => navigate(`/profile/${req.requester.id}`)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-white truncate">{req.requester.firstName} {req.requester.lastName}</p>
                  {(req.requester.city || req.requester.role) && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{[req.requester.role, req.requester.city].filter(Boolean).join(' · ')}</p>
                  )}
                </button>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => acceptMut.mutate(req.id)}
                    disabled={acceptMut.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
                  >
                    <Check size={13} /> Принять
                  </button>
                  <button
                    onClick={() => rejectMut.mutate(req.id)}
                    disabled={rejectMut.isPending}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                    title="Отклонить"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ))}
            {tab === 'sent' && sent.map((req: any) => (
              <div key={req.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
                <button onClick={() => navigate(`/profile/${req.receiver.id}`)} className="flex-shrink-0">
                  <AvatarComponent src={req.receiver.avatar} name={`${req.receiver.firstName} ${req.receiver.lastName}`} size={44} />
                </button>
                <button onClick={() => navigate(`/profile/${req.receiver.id}`)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-white truncate">{req.receiver.firstName} {req.receiver.lastName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={11} className="text-slate-600" />
                    <span className="text-xs text-slate-500">{[req.receiver.role, req.receiver.city].filter(Boolean).join(' · ') || 'Ожидает ответа'}</span>
                  </div>
                </button>
                <button
                  onClick={() => cancelMut.mutate(req.id)}
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
  );
}
