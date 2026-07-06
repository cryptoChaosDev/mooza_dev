import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, Link2, Clock, CheckCheck, XCircle, ChevronRight } from 'lucide-react';
import AvatarComponent from './Avatar';
import ConnectionViewModal from './ConnectionViewModal';
import { type ConnectionData } from './ConnectionCard';
import { useNavigate } from 'react-router-dom';
import { useScrollLock } from "../lib/scrollLock";

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

function statusIcon(status: string) {
  if (status === 'ACCEPTED')  return <CheckCheck size={13} className="text-emerald-400 flex-shrink-0" />;
  if (status === 'PENDING')   return <Clock size={13} className="text-slate-400 flex-shrink-0" />;
  if (status === 'REJECTED')  return <XCircle size={13} className="text-red-400 flex-shrink-0" />;
  return null;
}
function statusLabel(conn: ConnectionData) {
  if (conn.status === 'ACCEPTED')  return 'Активна';
  if (conn.status === 'PENDING')   return conn.iAmRequester ? 'Ожидает ответа' : 'Входящий запрос';
  if (conn.status === 'REJECTED')  return 'Отклонена';
  return conn.status;
}

interface Props {
  partner: ConnectionData['partner'];
  connections: ConnectionData[];
  onClose: () => void;
  onConnectionUpdated?: () => void;
}

export default function PartnerConnectionsModal({ partner, connections, onClose, onConnectionUpdated }: Props) {
  const navigate = useNavigate();
  useScrollLock(true);
  const [viewConn, setViewConn] = useState<ConnectionData | null>(null);
  const name = `${partner.firstName} ${partner.lastName}`.trim();

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 flex-shrink-0 bg-slate-900/80 backdrop-blur"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Link2 size={15} className="text-primary-400 flex-shrink-0" />
            <h2 className="text-base font-semibold text-white truncate">Связи с {partner.firstName}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Partner card */}
        <button
          onClick={() => { navigate(`/profile/${partner.id}`); onClose(); }}
          className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors flex-shrink-0"
        >
          <AvatarComponent src={partner.avatar} name={name} size={44} />
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-bold text-white truncate">{name}</p>
            {partner.city && <p className="text-xs text-slate-500 truncate">{partner.city}</p>}
          </div>
          <ChevronRight size={15} className="text-slate-600 flex-shrink-0" />
        </button>

        {/* Connections list */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <p className="px-5 pt-4 pb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Всего связей: {connections.length}
          </p>
          <div className="divide-y divide-slate-800/40">
            {connections.map(conn => {
              const roleKey = conn.myRole ?? (conn.iAmRequester ? 'CUSTOMER' : 'EXECUTOR');
              const roleColor = ROLE_COLOR[roleKey] ?? 'bg-slate-700/40 text-slate-400 border-slate-700';
              const roleText = ROLE_LABEL[roleKey] ?? roleKey;
              const subtitle = conn.services?.slice(0, 2).map((s: any) => s.name).join(' · ') || null;

              return (
                <button
                  key={conn.id}
                  onClick={() => setViewConn(conn)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-800/40 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleColor}`}>
                        {roleText}
                      </span>
                      {conn.needsDeal && <span className="text-[10px] text-amber-500">💰</span>}
                    </div>
                    {subtitle && (
                      <p className="text-xs text-slate-500 truncate mt-1">{subtitle}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {statusIcon(conn.status)}
                      <span className="text-[11px] text-slate-500">{statusLabel(conn)}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {viewConn && (
        <ConnectionViewModal
          connection={viewConn}
          onClose={() => {
            setViewConn(null);
            onConnectionUpdated?.();
          }}
        />
      )}
    </>,
    document.body
  );
}
