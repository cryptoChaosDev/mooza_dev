import { ChevronRight } from 'lucide-react';
import AvatarComponent from './Avatar';

export interface ConnectionData {
  id: string;
  status: string;
  iAmRequester: boolean;
  myRole?: string | null;
  partnerRole?: string | null;
  needsDeal?: boolean;
  breakRequestedBy?: string | null | undefined;
  breakReasonRequester?: string | null;
  services: { id: string; name: string }[];
  profession?: { id: string; name: string } | null;
  partner: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role?: string;
    city?: string;
  };
}

const ROLE_COLOR: Record<string, string> = {
  CUSTOMER: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  EXECUTOR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  COLLEAGUE: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};
const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Заказчик',
  EXECUTOR: 'Исполнитель',
  COLLEAGUE: 'Коллега',
};

interface Props {
  connection: ConnectionData;
  onClick: () => void;
}

export default function ConnectionCard({ connection, onClick }: Props) {
  const { partner, services, profession, myRole, needsDeal } = connection;
  const name = `${partner.firstName ?? ''} ${partner.lastName ?? ''}`.trim() || 'Пользователь';
  const subtitle = profession?.name
    || services.slice(0, 2).map(s => s.name).join(' · ')
    || partner.city
    || null;
  const roleKey = myRole ?? (connection.iAmRequester ? 'CUSTOMER' : 'EXECUTOR');

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors text-left"
    >
      <AvatarComponent src={partner.avatar} name={name} size={40} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{name}</p>
        {subtitle && <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {needsDeal && <span className="text-[10px] text-amber-500">💰</span>}
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLOR[roleKey] ?? 'bg-slate-700/40 text-slate-400 border-slate-700'}`}>
          {ROLE_LABEL[roleKey] ?? roleKey}
        </span>
      </div>
      <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
    </button>
  );
}
