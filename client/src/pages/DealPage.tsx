import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Loader2, HandshakeIcon, CheckCheck, XCircle,
  Clock, AlertCircle, Wrench, Send, Check, X, Star, Copy, Pencil, Calendar,
} from 'lucide-react';
import { dealAPI, reviewAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import AvatarComponent from '../components/Avatar';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  PENDING:           { label: 'На согласовании',  color: 'text-amber-400',   icon: Clock },
  AWAITING_PAYMENT:  { label: 'Ожидает оплаты',   color: 'text-blue-400',    icon: AlertCircle },
  IN_PROGRESS:       { label: 'В работе',          color: 'text-primary-400', icon: Wrench },
  REVIEW:            { label: 'На проверке',       color: 'text-violet-400',  icon: AlertCircle },
  REVISION:          { label: 'На доработке',      color: 'text-orange-400',  icon: Wrench },
  COMPLETED:         { label: 'Завершена',         color: 'text-emerald-400', icon: CheckCheck },
  CANCELLED:         { label: 'Отменена',          color: 'text-red-400',     icon: XCircle },
  AWAITING_EVENT:        { label: 'Ожидает события',        color: 'text-cyan-400',   icon: Calendar },
  AWAITING_CONFIRMATION: { label: 'Ожидает подтверждения', color: 'text-violet-400', icon: AlertCircle },
};

export default function DealPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const qc = useQueryClient();

  const [revisionComment, setRevisionComment] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelInput, setShowCancelInput] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSent, setReviewSent] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editDeadline, setEditDeadline] = useState('');
  const [editRevisions, setEditRevisions] = useState('');

  const { data: deal, isLoading } = useQuery({
    queryKey: ['deal', dealId],
    queryFn: async () => { const { data } = await dealAPI.getOne(dealId!); return data as any; },
    enabled: !!dealId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['deal', dealId] });

  const reviewMut = useMutation({
    mutationFn: () => reviewAPI.create({
      targetId: partner?.id,
      rating: reviewRating,
      text: reviewText.trim() || undefined,
      type: 'deal',
      dealId: dealId!,
    }),
    onSuccess: () => { setReviewSent(true); qc.invalidateQueries({ queryKey: ['reviews', partner?.id] }); },
  });

  const acceptMut  = useMutation({ mutationFn: () => dealAPI.accept(dealId!),  onSuccess: invalidate });
  const rejectMut  = useMutation({ mutationFn: (r: string) => dealAPI.reject(dealId!, r), onSuccess: invalidate });
  const cancelMut  = useMutation({ mutationFn: (r: string) => dealAPI.cancel(dealId!, r), onSuccess: () => { invalidate(); setShowCancelInput(false); } });
  const payMut     = useMutation({ mutationFn: () => dealAPI.pay(dealId!),     onSuccess: invalidate });
  const submitMut  = useMutation({ mutationFn: () => dealAPI.submit(dealId!),  onSuccess: invalidate });
  const approveMut = useMutation({ mutationFn: () => dealAPI.approve(dealId!), onSuccess: invalidate });
  const revisionMut= useMutation({ mutationFn: () => dealAPI.revision(dealId!, revisionComment), onSuccess: () => { invalidate(); setShowRevisionInput(false); setRevisionComment(''); } });
  const confirmMut = useMutation({ mutationFn: () => dealAPI.confirm(dealId!), onSuccess: invalidate });

  const requestEditMut = useMutation({
    mutationFn: () => dealAPI.requestEdit(dealId!, {
      deadline: editDeadline || undefined,
      revisionCount: editRevisions ? Number(editRevisions) : undefined,
    }),
    onSuccess: () => { invalidate(); setShowEditForm(false); setEditDeadline(''); setEditRevisions(''); },
  });

  const acceptEditMut = useMutation({
    mutationFn: (reqId: string) => dealAPI.acceptEdit(reqId),
    onSuccess: invalidate,
  });
  const rejectEditMut = useMutation({
    mutationFn: (reqId: string) => dealAPI.rejectEdit(reqId),
    onSuccess: invalidate,
  });

  if (isLoading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
    </div>
  );
  if (!deal) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Сделка не найдена</p>
    </div>
  );

  const isCustomer = me?.id === deal.customerId;
  const isExecutor = me?.id === deal.executorId;
  const cfg = STATUS_CONFIG[deal.status] ?? { label: deal.status, color: 'text-slate-400', icon: Clock };
  const StatusIcon = cfg.icon;
  const partner = isCustomer ? deal.executor : deal.customer;
  const partnerRole = isCustomer ? 'Исполнитель' : 'Заказчик';
  const myRole = isCustomer ? 'Заказчик' : 'Исполнитель';
  const isDone = ['COMPLETED', 'CANCELLED'].includes(deal.status);
  const pendingEdit = deal.editRequests?.[0];

  return (
    <div className="min-h-screen bg-slate-950 pb-32">
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Back + duplicate */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <HandshakeIcon size={16} className="text-primary-400 flex-shrink-0" />
            <h1 className="text-base font-bold text-white truncate">{deal.title}</h1>
          </div>
          {/* Дублировать — открывает форму создания с заполненными полями */}
          <button
            onClick={() => {
              const other = isCustomer ? deal.executor : deal.customer;
              const otherId = isCustomer ? deal.executorId : deal.customerId;
              const otherName = other ? `${other.firstName} ${other.lastName}` : '';
              navigate('/deals', { state: { duplicate: { title: deal.title, executorId: otherId, executorName: otherName, price: deal.price, revisionCount: deal.revisionCount, result: deal.result } } });
            }}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all flex-shrink-0"
            title="Дублировать сделку"
          >
            <Copy size={16} />
          </button>
        </div>

        {/* Status */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900/60 border border-slate-800/60 ${cfg.color}`}>
          <StatusIcon size={16} />
          <span className="text-sm font-semibold">{cfg.label}</span>
          {deal.status === 'REVISION' && (
            <span className="ml-auto text-xs text-slate-500">Правок: {deal.revisionsUsed}/{deal.revisionCount}</span>
          )}
        </div>

        {/* Participants */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Участники</p>
          <button
            onClick={() => navigate(`/profile/${partner.id}`)}
            className="w-full flex items-center gap-3 hover:bg-slate-800/50 rounded-xl p-2 -mx-2 transition-colors text-left"
          >
            <AvatarComponent src={partner.avatar} name={`${partner.firstName} ${partner.lastName}`} size={40} />
            <div>
              <p className="text-sm font-semibold text-white">{partner.firstName} {partner.lastName}</p>
              <p className="text-xs text-slate-500">{partnerRole}</p>
            </div>
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-primary-500" />
            <span>Вы — {myRole}</span>
          </div>
        </div>

        {/* Details */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Условия</p>
          {deal.service && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Услуга</span>
              <span className="text-primary-300 font-medium">{deal.service.name}</span>
            </div>
          )}
          {deal.price != null && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Стоимость</span>
              <span className="text-white font-semibold">{deal.price.toLocaleString('ru')} ₽</span>
            </div>
          )}
          {deal.dealType === 'event' && deal.eventDate && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Дата события</span>
              <span className="text-white font-semibold">{new Date(deal.eventDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          )}
          {deal.dealType === 'event' && deal.deposit != null && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Депозит (невозвратный)</span>
              <span className="text-amber-400 font-medium">{deal.deposit.toLocaleString('ru')} ₽</span>
            </div>
          )}
          {deal.dealType !== 'event' && deal.deadline && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Срок сдачи</span>
              <span className="text-white">{new Date(deal.deadline).toLocaleDateString('ru')}</span>
            </div>
          )}
          {deal.dealType !== 'event' && deal.acceptDeadline && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Срок приёмки</span>
              <span className="text-white">{new Date(deal.acceptDeadline).toLocaleDateString('ru')}</span>
            </div>
          )}
          {deal.dealType !== 'event' && deal.revisionCount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Правок</span>
              <span className="text-white">{deal.revisionCount}</span>
            </div>
          )}
          {deal.result && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Ожидаемый результат</p>
              <p className="text-sm text-slate-300">{deal.result}</p>
            </div>
          )}
        </div>

        {deal.cancelReason && (
          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
            <p className="text-[11px] font-semibold text-red-400/70 uppercase tracking-wide mb-1">Причина отмены</p>
            <p className="text-sm text-slate-300">{deal.cancelReason}</p>
          </div>
        )}

        {/* Review block — shown when COMPLETED */}
        {deal.status === 'COMPLETED' && (
          reviewSent ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3">
              <Check size={15} />Оценка отправлена
            </div>
          ) : showReview ? (
            <div className="space-y-3 border border-amber-500/20 bg-amber-500/5 rounded-2xl p-4">
              <p className="text-sm font-semibold text-white">Оценить взаимодействие с {partner?.firstName}</p>
              <div className="flex gap-1 flex-wrap">
                {[1,2,3,4,5,6,7,8,9,10].map(i => (
                  <button key={i} onClick={() => setReviewRating(i)} className="transition-transform hover:scale-110">
                    <Star size={22} className={i <= reviewRating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
                  </button>
                ))}
              </div>
              {reviewRating > 0 && (
                <p className="text-xs text-amber-400/80 font-medium">
                  {reviewRating} — {({10:'Восхитительно',9:'Отлично',8:'Очень хорошо',7:'Хорошо',6:'Приемлемо',5:'Посредственно',4:'Ниже среднего',3:'Плохо',2:'Очень плохо',1:'Ужасно'} as Record<number,string>)[reviewRating]}
                </p>
              )}
              <textarea value={reviewText} onChange={e => setReviewText(e.target.value)}
                placeholder="Комментарий (необязательно)..." rows={3}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none" />
              <div className="flex gap-2">
                <button onClick={() => setShowReview(false)} className="flex-1 py-2 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
                <button onClick={() => reviewMut.mutate()} disabled={reviewRating === 0 || reviewMut.isPending}
                  className="flex-1 py-2 text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5">
                  {reviewMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}Отправить
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowReview(true)}
              className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 rounded-2xl transition-colors">
              <Star size={15} />Оценить взаимодействие
            </button>
          )
        )}

        {/* Actions */}
        {!isDone && (
          <div className="space-y-2">
            {/* Executor: PENDING → accept / reject */}
            {isExecutor && deal.status === 'PENDING' && (
              <>
                <button onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending}
                  className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-2xl transition-colors disabled:opacity-50">
                  {acceptMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Принять сделку
                </button>
                <button onClick={() => rejectMut.mutate('')} disabled={rejectMut.isPending}
                  className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-2xl transition-colors disabled:opacity-50">
                  {rejectMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                  Отклонить
                </button>
              </>
            )}

            {/* Customer: AWAITING_PAYMENT → pay */}
            {isCustomer && deal.status === 'AWAITING_PAYMENT' && (
              <button onClick={() => payMut.mutate()} disabled={payMut.isPending}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl transition-colors disabled:opacity-50">
                {payMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCheck size={15} />}
                Подтвердить и начать работу
              </button>
            )}

            {/* Executor: IN_PROGRESS / REVISION → submit (только для process) */}
            {isExecutor && deal.dealType !== 'event' && ['IN_PROGRESS', 'REVISION'].includes(deal.status) && (
              <button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-2xl transition-colors disabled:opacity-50">
                {submitMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Сдать работу
              </button>
            )}

            {/* Event deal: customer confirms */}
            {isCustomer && deal.dealType === 'event' && ['AWAITING_EVENT', 'AWAITING_CONFIRMATION'].includes(deal.status) && (
              <button onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl transition-colors disabled:opacity-50">
                {confirmMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCheck size={15} />}
                Подтвердить оказание услуги
              </button>
            )}

            {/* Customer: REVIEW → approve / revision */}
            {isCustomer && deal.dealType !== 'event' && deal.status === 'REVIEW' && (
              <>
                <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}
                  className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl transition-colors disabled:opacity-50">
                  {approveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCheck size={15} />}
                  Принять работу
                </button>
                {deal.revisionsUsed < deal.revisionCount ? (
                  showRevisionInput ? (
                    <div className="space-y-2">
                      <textarea
                        value={revisionComment}
                        onChange={e => setRevisionComment(e.target.value)}
                        placeholder="Что нужно доработать..."
                        rows={3}
                        className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setShowRevisionInput(false)} className="flex-1 py-2 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
                        <button onClick={() => revisionMut.mutate()} disabled={revisionMut.isPending}
                          className="flex-1 py-2 text-sm bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                          {revisionMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
                          Отправить на доработку
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowRevisionInput(true)}
                      className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 rounded-2xl transition-colors">
                      На доработку ({deal.revisionCount - deal.revisionsUsed} осталось)
                    </button>
                  )
                ) : null}
              </>
            )}

            {/* Pending edit request — counterparty needs to approve/reject */}
            {pendingEdit && pendingEdit.requesterId !== me?.id && (
              <div className="space-y-3 border border-amber-500/30 bg-amber-500/5 rounded-2xl p-4">
                <p className="text-sm font-semibold text-amber-300">Запрос на изменение условий</p>
                <div className="space-y-1 text-sm">
                  {pendingEdit.changes?.deadline && (
                    <p className="text-slate-300">Новый срок сдачи: {new Date(pendingEdit.changes.deadline).toLocaleDateString('ru-RU')}</p>
                  )}
                  {pendingEdit.changes?.acceptDeadline && (
                    <p className="text-slate-300">Новый срок приёмки: {new Date(pendingEdit.changes.acceptDeadline).toLocaleDateString('ru-RU')}</p>
                  )}
                  {pendingEdit.changes?.revisionCount != null && (
                    <p className="text-slate-300">Новое кол-во правок: {pendingEdit.changes.revisionCount}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => rejectEditMut.mutate(pendingEdit.id)} disabled={rejectEditMut.isPending}
                    className="flex-1 py-2 text-sm border border-slate-700 text-slate-400 rounded-xl hover:text-white transition-colors">Отклонить</button>
                  <button onClick={() => acceptEditMut.mutate(pendingEdit.id)} disabled={acceptEditMut.isPending}
                    className="flex-1 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold transition-colors">Принять</button>
                </div>
              </div>
            )}

            {/* Pending edit request — author waiting for counterparty */}
            {pendingEdit && pendingEdit.requesterId === me?.id && (
              <div className="border border-slate-700/60 bg-slate-900/60 rounded-2xl p-4 text-sm text-slate-400">
                Запрос на изменение условий отправлен — ожидание подтверждения второй стороны.
              </div>
            )}

            {/* Edit conditions — either party, only when in active progress statuses */}
            {!isDone && !pendingEdit && ['IN_PROGRESS', 'REVIEW', 'REVISION'].includes(deal.status) && (
              showEditForm ? (
                <div className="space-y-2 border border-slate-700/60 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-white mb-2">Запросить изменение условий</p>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Новый срок сдачи</label>
                    <input type="date" value={editDeadline} onChange={e => setEditDeadline(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Новое количество правок</label>
                    <input type="number" value={editRevisions} onChange={e => setEditRevisions(e.target.value)}
                      placeholder={String(deal.revisionCount)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setShowEditForm(false)} className="flex-1 py-2 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
                    <button onClick={() => requestEditMut.mutate()} disabled={requestEditMut.isPending || (!editDeadline && !editRevisions)}
                      className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-semibold transition-colors disabled:opacity-50">Отправить</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowEditForm(true)}
                  className="w-full py-2.5 text-sm text-slate-400 hover:text-white border border-slate-700/60 rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                  <Pencil size={14} />Изменить условия
                </button>
              )
            )}

            {/* Cancel */}
            {!['COMPLETED', 'CANCELLED', 'REVIEW'].includes(deal.status) && (
              showCancelInput ? (
                <div className="space-y-2">
                  <input
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="Причина отмены (необязательно)..."
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowCancelInput(false)} className="flex-1 py-2 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
                    <button onClick={() => cancelMut.mutate(cancelReason)} disabled={cancelMut.isPending}
                      className="flex-1 py-2 text-sm bg-red-600/80 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                      {cancelMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
                      Отменить сделку
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowCancelInput(true)}
                  className="w-full py-2.5 text-sm text-slate-500 hover:text-red-400 transition-colors">
                  Отменить сделку
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
