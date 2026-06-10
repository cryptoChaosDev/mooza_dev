import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Link2, CheckCheck, Clock, ChevronRight } from 'lucide-react';
import { connectionAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { type ConnectionData } from '../components/ConnectionCard';
import PartnerConnectionsModal from '../components/PartnerConnectionsModal';
import AvatarComponent from '../components/Avatar';

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Заказчик',
  EXECUTOR: 'Исполнитель',
  COLLEAGUE: 'Коллега',
};
const ROLE_COLOR: Record<string, string> = {
  CUSTOMER: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  EXECUTOR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  COLLEAGUE: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};


interface PartnerGroup {
  partner: ConnectionData['partner'];
  connections: ConnectionData[];
}

function groupByPartner(connections: ConnectionData[]): PartnerGroup[] {
  const map = new Map<string, PartnerGroup>();
  for (const conn of connections) {
    const pid = conn.partner.id;
    if (!map.has(pid)) map.set(pid, { partner: conn.partner, connections: [] });
    map.get(pid)!.connections.push(conn);
  }
  return Array.from(map.values());
}

export default function ConnectionsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const isOwn = me?.id === userId;

  const [viewGroup, setViewGroup] = useState<PartnerGroup | null>(null);

  const { data: connections = [], isLoading, refetch } = useQuery({
    queryKey: isOwn ? ['connections-all'] : ['user-connections', userId],
    queryFn: async () => {
      const { data } = isOwn
        ? await connectionAPI.getAll()
        : await connectionAPI.getUserConnections(userId!);
      return data as ConnectionData[];
    },
    enabled: !!userId,
  });

  const groups = groupByPartner(connections);

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
            {groups.length > 0 && <span className="text-xs text-slate-500">{groups.length}</span>}
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center pt-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent" />
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-4 py-8 text-center">
            <p className="text-slate-500 text-sm">Связей пока нет</p>
          </div>
        )}

        {groups.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden divide-y divide-slate-800/40">
            {groups.map(group => {
              const { partner, connections: conns } = group;
              const name = `${partner.firstName} ${partner.lastName}`.trim();
              const accepted = conns.filter(c => c.status === 'ACCEPTED');
              const pending  = conns.filter(c => c.status === 'PENDING');
              const roles = [...new Set(conns.map(c => c.myRole ?? (c.iAmRequester ? 'CUSTOMER' : 'EXECUTOR')))];

              return (
                <button
                  key={partner.id}
                  onClick={() => setViewGroup(group)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-800/30 transition-colors text-left"
                >
                  <AvatarComponent src={partner.avatar} name={name} size={42} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {roles.map(r => (
                        <span key={r} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${ROLE_COLOR[r] ?? 'bg-slate-700/40 text-slate-400 border-slate-700'}`}>
                          {ROLE_LABEL[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      {accepted.length > 0 && <CheckCheck size={12} className="text-emerald-400" />}
                      {pending.length > 0  && <Clock size={12} className="text-slate-400" />}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}

      </div>

      {viewGroup && (
        <PartnerConnectionsModal
          partner={viewGroup.partner}
          connections={viewGroup.connections}
          onClose={() => setViewGroup(null)}
          onConnectionUpdated={() => refetch()}
        />
      )}
    </div>
  );
}
