import { createPortal } from 'react-dom';
import { X, Link2, Check, Clock, CheckCheck, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { connectionAPI } from '../lib/api';
import AvatarComponent from './Avatar';
import { useNavigate } from 'react-router-dom';

interface Connection {
  id: string;
  status: string;
  iAmRequester: boolean;
  breakRequestedBy: string | null;
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
  connection: Connection;
  onClose: () => void;
}

export default function ConnectionViewModal({ connection, onClose }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { partner, services, profession, status, iAmRequester, breakRequestedBy, breakReasonRequester } = connection;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['connections-accepted'] });
    queryClient.invalidateQueries({ queryKey: ['connections-requests'] });
    queryClient.invalidateQueries({ queryKey: ['connections-sent'] });
    queryClient.invalidateQueries({ queryKey: ['connections-break-requests'] });
    queryClient.invalidateQueries({ queryKey: ['connections-my-break-requests'] });
    queryClient.invalidateQueries({ queryKey: ['connections-history'] });
    queryClient.invalidateQueries({ queryKey: ['connection-with', partner.id] });
    queryClient.invalidateQueries({ queryKey: ['user-connections', partner.id] });
  };

  const acceptMut = useMutation({
    mutationFn: () => connectionAPI.accept(connection.id),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const rejectMut = useMutation({
    mutationFn: () => connectionAPI.reject(connection.id),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const cancelMut = useMutation({
    mutationFn: () => connectionAPI.cancel(connection.id),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const statusLabel = () => {
    if (status === 'PENDING') {
      return iAmRequester
        ? { text: 'Ожидает ответа', color: 'text-slate-400', icon: <Clock size={13} /> }
        : { text: 'Входящий запрос', color: 'text-primary-400', icon: <Link2 size={13} /> };
    }
    if (status === 'ACCEPTED') {
      return { text: 'Связь установлена', color: 'text-emerald-400', icon: <CheckCheck size={13} /> };
    }
    if (status === 'BREAK_REQUESTED') {
      return breakRequestedBy !== partner.id
        ? { text: 'Вы запросили разрыв — ожидаем подтверждения', color: 'text-red-400', icon: <Clock size={13} /> }
        : { text: 'Запрос на разрыв', color: 'text-red-400', icon: <X size={13} /> };
    }
    return null;
  };
  const sl = statusLabel();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary-500/10 rounded-lg">
              <Link2 size={15} className="text-primary-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Профессиональная связь</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Partner card */}
          <button
            onClick={() => { navigate(`/profile/${partner.id}`); onClose(); }}
            className="w-full flex items-center gap-3 p-3 bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-colors text-left"
          >
            <AvatarComponent src={partner.avatar} name={`${partner.firstName} ${partner.lastName}`} size={44} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{partner.firstName} {partner.lastName}</p>
              {(partner.role || partner.city) && (
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {[partner.role, partner.city].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </button>

          {/* Status badge */}
          {sl && (
            <div className={`flex items-center gap-2 text-xs font-medium ${sl.color}`}>
              {sl.icon}
              <span>{sl.text}</span>
            </div>
          )}

          {/* Roles */}
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs rounded-xl px-3 py-1 border font-medium ${iAmRequester ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
              Я — {iAmRequester ? 'заказчик' : 'исполнитель'}
            </span>
            <span className={`text-xs rounded-xl px-3 py-1 border font-medium ${iAmRequester ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-sky-500/10 text-sky-400 border-sky-500/20'}`}>
              {partner.firstName} — {iAmRequester ? 'исполнитель' : 'заказчик'}
            </span>
          </div>

          {/* Profession */}
          {profession && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Профессия</p>
              <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/25 text-amber-300 rounded-lg text-xs font-medium">
                {profession.name}
              </span>
            </div>
          )}

          {/* Services (manual connection) */}
          {!profession && services.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {status === 'ACCEPTED' ? 'Услуги' : 'Запрошенные услуги'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {services.map(s => (
                  <span key={s.id} className="px-2.5 py-1 bg-primary-500/10 border border-primary-500/25 text-primary-300 rounded-lg text-xs font-medium">
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Break reason from requester (visible to receiver) */}
          {status === 'BREAK_REQUESTED' && breakRequestedBy === partner.id && breakReasonRequester && (
            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
              <p className="text-[11px] font-semibold text-red-400/70 uppercase tracking-wide mb-1">Причина разрыва</p>
              <p className="text-sm text-slate-300">{breakReasonRequester}</p>
            </div>
          )}

        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2.5 border-t border-slate-800 pt-4">
          {/* PENDING incoming → Accept + Reject */}
          {status === 'PENDING' && !iAmRequester && (
            <>
              <button
                onClick={() => rejectMut.mutate()}
                disabled={rejectMut.isPending}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-red-500/15 border border-slate-700 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
              >
                Отклонить
              </button>
              <button
                onClick={() => acceptMut.mutate()}
                disabled={acceptMut.isPending}
                className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 disabled:opacity-50"
              >
                {acceptMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Принять
              </button>
            </>
          )}

          {/* PENDING outgoing → Cancel */}
          {status === 'PENDING' && iAmRequester && (
            <>
              <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
                Закрыть
              </button>
              <button
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
                className="flex-1 py-2.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
              >
                Отменить запрос
              </button>
            </>
          )}

          {/* ACCEPTED → close only */}
          {status === 'ACCEPTED' && (
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
              Закрыть
            </button>
          )}

          {/* BREAK_REQUESTED (legacy) → close only */}
          {status === 'BREAK_REQUESTED' && (
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
