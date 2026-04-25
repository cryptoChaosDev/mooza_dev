import { ChevronRight } from 'lucide-react';
import AvatarComponent from './Avatar';

export interface ConnectionData {
  id: string;
  status: string;
  iAmRequester: boolean;
  breakRequestedBy?: string | null;
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

interface Props {
  connection: ConnectionData;
  onClick: () => void;
}

export default function ConnectionCard({ connection, onClick }: Props) {
  const { partner, services, profession, iAmRequester } = connection;
  const name = `${partner.firstName ?? ''} ${partner.lastName ?? ''}`.trim() || 'Пользователь';
  const subtitle = profession?.name
    || services.slice(0, 2).map(s => s.name).join(' · ')
    || partner.city
    || null;

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
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${
        iAmRequester
          ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      }`}>
        {iAmRequester ? 'Заказчик' : 'Исполнитель'}
      </span>
      <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
    </button>
  );
}
