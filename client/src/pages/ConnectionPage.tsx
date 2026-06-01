import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Link2, Star } from 'lucide-react';
import { connectionAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import AvatarComponent from '../components/Avatar';
import RateConnectionModal from '../components/RateConnectionModal';

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

function getServiceCounts(conns: any[]) {
  const counts: Record<string, { id: string; name: string; count: number }> = {};
  for (const conn of conns) {
    for (const svc of conn.services ?? []) {
      if (!counts[svc.id]) counts[svc.id] = { id: svc.id, name: svc.name, count: 0 };
      counts[svc.id].count++;
    }
    // if no services, use role as tag
    if (!conn.services?.length) {
      const key = conn.myRole ?? 'unknown';
      if (!counts[key]) counts[key] = { id: key, name: ROLE_LABEL[key] ?? key, count: 0 };
      counts[key].count++;
    }
  }
  return Object.values(counts).sort((a, b) => b.count - a.count);
}

function TagCloud({ items, colorClass }: { items: { id: string; name: string; count: number }[]; colorClass: string }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(item => (
        <div key={item.id} className="relative">
          <span className={`inline-block px-3 py-1.5 rounded-xl text-xs font-medium border ${colorClass}`}>
            {item.name}
          </span>
          {item.count > 1 && (
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 bg-slate-700 border border-slate-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              ×{item.count}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ConnectionPage() {
  const { partnerId } = useParams<{ partnerId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useAuthStore(s => s.user);
  const [showRate, setShowRate] = useState(false);

  // Try to get connections from location state (passed from FriendsPage for instant load)
  const stateData = (location.state as any) as { partner: any; connections: any[] } | null;

  const { data: allConns = [], isLoading } = useQuery({
    queryKey: ['connections-all'],
    queryFn: async () => { const { data } = await connectionAPI.getAll(); return data as any[]; },
    enabled: !stateData, // skip if we have state data
  });

  const connections: any[] = stateData?.connections
    ?? allConns.filter((c: any) => c.partner?.id === partnerId);

  const partner: any = stateData?.partner
    ?? connections[0]?.partner
    ?? null;

  const partnerName = partner ? `${partner.firstName ?? ''} ${partner.lastName ?? ''}`.trim() : '…';

  if (!stateData && isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }
  const isMe = !!(me); // we're always the viewer

  // Group connections by my role
  const colleagueConns = connections.filter((c: any) => (c.myRole ?? 'COLLEAGUE') === 'COLLEAGUE');
  const executorConns  = connections.filter((c: any) => c.myRole === 'EXECUTOR');
  const customerConns  = connections.filter((c: any) => c.myRole === 'CUSTOMER');

  const colleagueTags = getServiceCounts(colleagueConns);
  const executorTags  = getServiceCounts(executorConns);
  const customerTags  = getServiceCounts(customerConns);

  const totalConns = connections.length;

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800/60">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ChevronLeft size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Link2 size={15} className="text-primary-400 flex-shrink-0" />
            <h1 className="text-base font-bold text-white truncate">Связи с {partner?.firstName ?? '…'}</h1>
          </div>
          {totalConns > 0 && (
            <span className="text-xs text-slate-500 flex-shrink-0">{totalConns}</span>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Partner card */}
        {partner && (
          <button
            onClick={() => navigate(`/profile/${partner.id}`)}
            className="w-full flex items-center gap-4 bg-slate-900/60 border border-slate-800/60 rounded-2xl px-4 py-3.5 hover:border-primary-700/40 transition-colors text-left"
          >
            <div className="flex-shrink-0">
              <AvatarComponent
                src={partner.avatar}
                name={partnerName}
                size={52}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-white truncate">{partnerName}</p>
              {partner.city && <p className="text-xs text-slate-500 truncate mt-0.5">{partner.city}</p>}
            </div>
            <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
          </button>
        )}

        {/* Rate the interaction with this partner */}
        {partner?.id && partner.id !== me?.id && (
          <button
            onClick={() => setShowRate(true)}
            className="w-full flex items-center justify-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 rounded-2xl py-3 text-sm font-medium transition-colors"
          >
            <Star size={16} /> Оценить взаимодействие
          </button>
        )}

        {connections.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <Link2 size={36} className="text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">Нет данных о связях</p>
          </div>
        )}

        {/* Section: Коллеги */}
        {colleagueTags.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Коллеги</span>
              <span className="text-xs text-slate-600">{colleagueConns.length}</span>
            </div>
            <TagCloud items={colleagueTags} colorClass={ROLE_COLOR.COLLEAGUE} />
          </div>
        )}

        {/* Section: Я — исполнитель */}
        {executorTags.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {isMe ? 'Я — исполнитель' : `${partner?.firstName ?? ''} — исполнитель`}
              </span>
              <span className="text-xs text-slate-600">{executorConns.length}</span>
            </div>
            <TagCloud items={executorTags} colorClass={ROLE_COLOR.EXECUTOR} />
          </div>
        )}

        {/* Section: Я — заказчик */}
        {customerTags.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {isMe ? 'Я — заказчик' : `${partner?.firstName ?? ''} — заказчик`}
              </span>
              <span className="text-xs text-slate-600">{customerConns.length}</span>
            </div>
            <TagCloud items={customerTags} colorClass={ROLE_COLOR.CUSTOMER} />
          </div>
        )}

        {/* Fallback: if all connections have no role data */}
        {totalConns > 0 && !colleagueTags.length && !executorTags.length && !customerTags.length && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Связи</span>
            <div className="flex flex-wrap gap-2">
              {connections.map((c: any) => (
                <span key={c.id} className="px-3 py-1.5 rounded-xl text-xs font-medium border bg-primary-500/10 text-primary-400 border-primary-500/20">
                  {c.services?.[0]?.name ?? ROLE_LABEL[c.myRole ?? ''] ?? 'Связь'}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {showRate && partner?.id && (
        <RateConnectionModal
          targetId={partner.id}
          targetName={partnerName}
          serviceId={connections[0]?.services?.[0]?.id}
          onClose={() => setShowRate(false)}
        />
      )}
    </div>
  );
}
