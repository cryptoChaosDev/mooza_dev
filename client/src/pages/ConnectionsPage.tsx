import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Link2 } from 'lucide-react';
import { connectionAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import ConnectionCard, { type ConnectionData } from '../components/ConnectionCard';
import ConnectionViewModal from '../components/ConnectionViewModal';

export default function ConnectionsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const isOwn = me?.id === userId;

  const [viewConn, setViewConn] = useState<ConnectionData | null>(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: isOwn ? ['connections-accepted'] : ['user-connections', userId],
    queryFn: async () => {
      const { data } = isOwn
        ? await connectionAPI.getAccepted()
        : await connectionAPI.getUserConnections(userId!);
      return data as ConnectionData[];
    },
    enabled: !!userId,
  });

  const asRequester = connections.filter(c => c.iAmRequester);
  const asReceiver  = connections.filter(c => !c.iAmRequester);

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all flex-shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Link2 size={15} className="text-primary-400" />
            <h1 className="text-base font-semibold text-white">Связи</h1>
            {connections.length > 0 && <span className="text-xs text-slate-500">{connections.length}</span>}
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center pt-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent" />
          </div>
        )}

        {!isLoading && connections.length === 0 && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-4 py-8 text-center">
            <p className="text-slate-500 text-sm">Связей пока нет</p>
          </div>
        )}

        {/* Заказчик section */}
        {asRequester.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800/60">
              <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider">Заказчик</span>
              <span className="ml-2 text-[11px] text-slate-600">{asRequester.length}</span>
            </div>
            <div className="divide-y divide-slate-800/40">
              {asRequester.map(conn => (
                <ConnectionCard key={conn.id} connection={conn} onClick={() => setViewConn(conn)} />
              ))}
            </div>
          </div>
        )}

        {/* Исполнитель section */}
        {asReceiver.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800/60">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Исполнитель</span>
              <span className="ml-2 text-[11px] text-slate-600">{asReceiver.length}</span>
            </div>
            <div className="divide-y divide-slate-800/40">
              {asReceiver.map(conn => (
                <ConnectionCard key={conn.id} connection={conn} onClick={() => setViewConn(conn)} />
              ))}
            </div>
          </div>
        )}

      </div>

      {viewConn && <ConnectionViewModal connection={viewConn} onClose={() => setViewConn(null)} />}
    </div>
  );
}
