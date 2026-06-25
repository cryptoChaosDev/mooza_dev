import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Check, Clock, CheckCheck, Loader2, XCircle, Star, HandshakeIcon } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { connectionAPI, reviewAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import AvatarComponent from './Avatar';
import { useNavigate } from 'react-router-dom';
import DealCreateModal from './DealCreateModal';
import { DEALS_ENABLED } from '../lib/features';
import { useScrollLock } from '../lib/scrollLock';

interface Connection {
  id: string;
  status: string;
  iAmRequester: boolean;
  myRole?: string | null;
  partnerRole?: string | null;
  needsDeal?: boolean;
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
  connection: Connection;
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'заказчик',
  EXECUTOR: 'исполнитель',
  COLLEAGUE: 'коллега',
};

const ROLE_COLOR: Record<string, string> = {
  CUSTOMER: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  EXECUTOR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  COLLEAGUE: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

function RoleBadge({ role, label }: { role?: string | null; label: string }) {
  const color = ROLE_COLOR[role ?? ''] ?? 'bg-slate-700/40 text-slate-400 border-slate-700';
  return (
    <span className={`text-xs rounded-xl px-3 py-1 border font-medium ${color}`}>{label}</span>
  );
}

export default function ConnectionViewModal({ connection, onClose }: Props) {
  const queryClient = useQueryClient();
  useScrollLock(true);
  const navigate = useNavigate();
  const { partner, services, profession, status, iAmRequester, myRole, partnerRole, needsDeal, breakRequestedBy, breakReasonRequester } = connection;

  const [showReview, setShowReview] = useState(false);
  const [showDeal, setShowDeal] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSent, setReviewSent] = useState(false);

  const reviewMut = useMutation({
    mutationFn: () => reviewAPI.create({
      targetId: partner.id,
      rating,
      text: reviewText.trim() || undefined,
      type: 'connection',
      serviceId: services?.[0]?.id,
    }),
    onSuccess: () => { setReviewSent(true); queryClient.invalidateQueries({ queryKey: ['reviews', partner.id] }); },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отправить оценку')),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['connections-accepted'] });
    queryClient.invalidateQueries({ queryKey: ['connections-requests'] });
    queryClient.invalidateQueries({ queryKey: ['connections-sent'] });
    queryClient.invalidateQueries({ queryKey: ['connections-break-requests'] });
    queryClient.invalidateQueries({ queryKey: ['connections-my-break-requests'] });
    queryClient.invalidateQueries({ queryKey: ['connections-history'] });
    queryClient.invalidateQueries({ queryKey: ['connection-with', partner.id] });
    queryClient.invalidateQueries({ queryKey: ['user-connections', partner.id] });
    queryClient.invalidateQueries({ queryKey: ['connections-all'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  const acceptMut = useMutation({
    mutationFn: () => connectionAPI.accept(connection.id),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось принять запрос')),
  });
  const rejectMut = useMutation({
    mutationFn: () => connectionAPI.reject(connection.id),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отклонить запрос')),
  });
  const cancelMut = useMutation({
    mutationFn: () => connectionAPI.cancel(connection.id),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отменить запрос')),
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
    if (status === 'REJECTED') {
      return { text: 'Запрос отклонён', color: 'text-red-400', icon: <XCircle size={13} /> };
    }
    if (status === 'BREAK_REQUESTED') {
      return breakRequestedBy !== partner.id
        ? { text: 'Вы запросили разрыв — ожидаем подтверждения', color: 'text-red-400', icon: <Clock size={13} /> }
        : { text: 'Запрос на разрыв', color: 'text-red-400', icon: <X size={13} /> };
    }
    return null;
  };
  const sl = statusLabel();

  return (
    <>
      {showDeal && (
        <DealCreateModal
          executorId={iAmRequester ? partner.id : partner.id}
          executorName={`${partner.firstName} ${partner.lastName}`}
          onClose={() => setShowDeal(false)}
        />
      )}
      {createPortal(
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
          {(myRole || partnerRole) && (
            <div className="flex flex-wrap gap-2">
              <RoleBadge role={myRole} label={`Я — ${ROLE_LABEL[myRole ?? ''] ?? myRole}`} />
              <RoleBadge role={partnerRole} label={`${partner.firstName} — ${ROLE_LABEL[partnerRole ?? ''] ?? partnerRole}`} />
              {needsDeal && (
                <span className="text-xs rounded-xl px-3 py-1 border font-medium bg-amber-500/10 text-amber-400 border-amber-500/20">
                  💰 Нужна сделка
                </span>
              )}
            </div>
          )}

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

          {/* Review form */}
          {showReview && !reviewSent && (
            <div className="space-y-3 border border-amber-500/20 bg-amber-500/5 rounded-xl p-4">
              <p className="text-sm font-semibold text-white">Оценить взаимодействие с {partner.firstName}</p>
              {/* Stars 1–10 */}
              <div className="flex gap-1 flex-wrap">
                {[1,2,3,4,5,6,7,8,9,10].map(i => (
                  <button key={i} onClick={() => setRating(i)} className="transition-transform hover:scale-110">
                    <Star size={22} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-xs text-amber-400/80 font-medium">
                  {rating} — {{10:'Восхитительно',9:'Отлично',8:'Очень хорошо',7:'Хорошо',6:'Приемлемо',5:'Посредственно',4:'Ниже среднего',3:'Плохо',2:'Очень плохо',1:'Ужасно'}[rating]}
                </p>
              )}
              <textarea
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                placeholder="Комментарий (необязательно)..."
                rows={3}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowReview(false)} className="flex-1 py-2 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
                <button
                  onClick={() => reviewMut.mutate()}
                  disabled={rating === 0 || reviewMut.isPending}
                  className="flex-1 py-2 text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  {reviewMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
                  Отправить
                </button>
              </div>
            </div>
          )}
          {reviewSent && (
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
              <Check size={15} />Оценка отправлена
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

          {/* ACCEPTED → close + deal + review */}
          {status === 'ACCEPTED' && !showReview && (
            <>
              {DEALS_ENABLED && (
                <button
                  onClick={() => setShowDeal(true)}
                  className="flex-1 py-2.5 bg-primary-600/20 hover:bg-primary-600/30 border border-primary-500/30 text-primary-300 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <HandshakeIcon size={14} />Сделка
                </button>
              )}
              <button
                onClick={() => setShowReview(true)}
                className="flex-1 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <Star size={14} />Оценить
              </button>
            </>
          )}

          {/* REJECTED → close */}
          {status === 'REJECTED' && (
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
      )}
    </>
  );
}
