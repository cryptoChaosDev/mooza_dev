import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CalendarDays, MapPin, Mic2, Wallet, Users, MessageCircle, Pencil, Lock, Loader2, Send, Check, X,
  Headphones, TrendingUp, TrendingDown, Disc3, Ticket, ExternalLink, ClipboardList, Undo2, Info,
} from 'lucide-react';
import AvatarComponent from '../components/Avatar';
import ShareButton from '../components/ShareButton';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuthStore } from '../stores/authStore';
import { openAuthGate, useAuthGate } from '../components/AuthGateModal';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import { useScrollLock } from '../lib/scrollLock';
import { avatarUrl } from '../lib/avatar';
import { artistHref, safeHref } from '../lib/artistUtils';
import { personName, personHref } from '../lib/publicPerson';
import { plural } from '../lib/plural';
import { useSeo, seoTitle, seoDescription, robotsFor } from '../lib/seo';
import { trackGuestView } from '../lib/metrika';
import {
  lineupAPI, type Lineup, type LineupResponseItem, type RespondAsArtist,
  RESPONSE_STATUS_CLASS, RESPONSE_STATUS_LABEL, formatEventDateTime, formatShortDateMsk, formatListeners,
  feeLabel, slotTypeLabel, lineupStatusBadge, isEventPast,
} from '../lib/lineups';

/** Нижний лист/модалка: портал + блокировка скролла + safe-area. */
function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useScrollLock(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-800 p-5 shadow-2xl"
        style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * /lineups/:id — запрос на выступление. Автор видит отклики карточками
 * артистов («Принять» / «Отклонить» / «Написать»); админ артиста —
 * «Откликнуться от имени …»; гость — описание и число откликов (AuthGate).
 */
export default function LineupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isGuest = !useAuthStore((s) => s.token);
  const gate = useAuthGate();

  const [respondOpen, setRespondOpen] = useState(false);
  const [respondArtistId, setRespondArtistId] = useState<string | null>(null);
  const [respondMessage, setRespondMessage] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [suggestClose, setSuggestClose] = useState(false);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);

  const { data: lineup, isLoading, error } = useQuery({
    queryKey: ['lineup', id],
    queryFn: async () => (await lineupAPI.get(id!)).data as Lineup,
    enabled: !!id,
    retry: (count, e: any) => e?.response?.status !== 404 && count < 1,
  });

  useEffect(() => { if (id) trackGuestView('lineup', id); }, [id]);
  useSeo({
    title: lineup ? seoTitle(`Ищем артистов: ${lineup.title}`, lineup.cityName) : seoTitle('Запрос на выступление'),
    description: lineup ? seoDescription(`${formatEventDateTime(lineup.eventDate)}, ${lineup.cityName}. ${lineup.description}`) : null,
    canonical: `/lineups/${id}`,
    robots: robotsFor(lineup, lineup?.status === 'active'),
  });

  const respondAs: RespondAsArtist[] = lineup?.respondAs ?? [];
  const canRespondAs = respondAs.filter((a) => !a.response || a.response.status === 'withdrawn');
  const isOpen = !!lineup && lineup.status === 'active' && !isEventPast(lineup.eventDate);

  // ?as=<artistId> из уведомления — предвыбор артиста в форме отклика.
  useEffect(() => {
    const as = sp.get('as');
    if (!respondArtistId && canRespondAs.length) {
      setRespondArtistId(canRespondAs.find((a) => a.id === as)?.id ?? canRespondAs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup?.id, canRespondAs.length]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lineup', id] });
    qc.invalidateQueries({ queryKey: ['lineups'] });
  };

  const respondMut = useMutation({
    mutationFn: () => lineupAPI.respond(id!, { artistId: respondArtistId!, message: respondMessage.trim() }),
    onSuccess: () => {
      toast.success('Отклик отправлен — организатор получил уведомление');
      setRespondOpen(false);
      setRespondMessage('');
      invalidate();
    },
    onError: (e) => toast.error(getApiError(e, 'Не удалось отправить отклик')),
  });

  const acceptMut = useMutation({
    mutationFn: (responseId: string) => lineupAPI.accept(responseId),
    onSuccess: ({ data }) => {
      toast.success('Отклик принят — артист получил уведомление');
      invalidate();
      if (data?.slotsFilled) setSuggestClose(true);
    },
    onError: (e) => { toast.error(getApiError(e, 'Не удалось принять отклик')); invalidate(); },
  });

  const declineMut = useMutation({
    mutationFn: (responseId: string) => lineupAPI.decline(responseId),
    onSuccess: () => { toast.success('Отклик отклонён'); invalidate(); },
    onError: (e) => { toast.error(getApiError(e, 'Не удалось отклонить отклик')); invalidate(); },
  });

  const withdrawMut = useMutation({
    mutationFn: (responseId: string) => lineupAPI.withdraw(responseId),
    onSuccess: () => { toast.success('Отклик отозван'); invalidate(); },
    onError: (e) => { toast.error(getApiError(e, 'Не удалось отозвать отклик')); invalidate(); },
  });

  const closeMut = useMutation({
    mutationFn: () => lineupAPI.close(id!),
    onSuccess: () => { toast.success('Запрос закрыт'); setSuggestClose(false); invalidate(); },
    onError: (e) => { toast.error(getApiError(e, 'Не удалось закрыть запрос')); invalidate(); },
  });

  if (isLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 size={26} className="animate-spin text-primary-400" /></div>;
  }
  if (error || !lineup) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-4 text-center">
        <CalendarDays size={32} className="text-slate-600" />
        <p className="text-slate-400">{(error as any)?.response?.status === 404 || !error ? 'Запрос не найден или снят с публикации' : getApiError(error, 'Не удалось загрузить запрос')}</p>
        <Link to="/lineups" className="text-primary-400 text-sm">К лайнапам</Link>
      </div>
    );
  }

  const badge = lineupStatusBadge(lineup);
  const free = Math.max(0, lineup.slots - (lineup.acceptedCount ?? 0));
  const authorHref = personHref(lineup.author);
  const authorName = personName(lineup.author, { fallback: 'Организатор на Moooza' });
  const responses: LineupResponseItem[] = lineup.responses ?? [];
  const pendingResponses = responses.filter((r) => r.status === 'pending').length;

  const openRespond = () => {
    if (isGuest) {
      openAuthGate('generic', { type: 'lineup_respond' }, 'Войдите, чтобы откликнуться на запрос от имени артиста');
      return;
    }
    setRespondOpen(true);
  };

  const writeTo = (userId: string | null | undefined) => {
    if (!userId) { toast.info('Не удалось найти, кому написать'); return; }
    gate.ensure('message', { type: 'lineup' }, () => navigate(`/messages/${userId}`));
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-32">
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Назад + заголовок */}
        <div className="flex items-center gap-3">
          <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/lineups'))} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all flex-shrink-0" aria-label="Назад">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <CalendarDays size={16} className="text-primary-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-300 truncate">Запрос на выступление</span>
          </div>
          {lineup.status !== 'draft' && (
            <ShareButton
              url={`/lineups/${lineup.id}`}
              title={`Ищем артистов: ${lineup.title} — Moooza`}
              iconSize={14}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex-shrink-0"
            />
          )}
        </div>

        {/* Основная карточка */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 space-y-4">
          {badge && <span className={`inline-flex text-xs px-2 py-0.5 rounded-lg border font-medium ${badge.cls}`}>{badge.label}</span>}
          <h1 className="text-xl font-bold text-white leading-tight break-words [overflow-wrap:anywhere]">{lineup.title}</h1>

          <div className="space-y-2.5">
            <div className="flex items-start gap-2">
              <CalendarDays size={15} className="text-primary-400 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-white font-medium">{formatEventDateTime(lineup.eventDate)}</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin size={15} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-slate-300 break-words [overflow-wrap:anywhere]">{[lineup.cityName, lineup.venue].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mic2 size={15} className="text-slate-500 flex-shrink-0" />
              <span className="text-sm text-slate-300">{slotTypeLabel(lineup.slotType)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users size={15} className="text-slate-500 flex-shrink-0" />
              <span className="text-sm text-slate-300">
                Нужно {lineup.slots} {plural(lineup.slots, 'артист', 'артиста', 'артистов')}
                {lineup.acceptedCount > 0 && <> · занято {lineup.acceptedCount}{free > 0 ? `, свободно ${free}` : ''}</>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Wallet size={15} className="text-amber-500/80 flex-shrink-0" />
              <span className="text-base font-bold text-amber-300">{feeLabel(lineup.feeType, lineup.feeAmount)}</span>
            </div>
          </div>

          {lineup.genres?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {lineup.genres.map((g) => (
                <span key={g.id} className="px-2.5 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full text-xs text-slate-300">{g.name}</span>
              ))}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">О событии</p>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{lineup.description}</p>
          </div>

          {lineup.requirements && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><ClipboardList size={12} />Требования</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{lineup.requirements}</p>
            </div>
          )}

          {/* Организатор */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60">
            <div className="pt-3 flex items-center gap-2 flex-1 min-w-0">
              <AvatarComponent src={lineup.author?.avatar} name={authorName} size={28} />
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider leading-none mb-0.5">Организатор</p>
                {authorHref ? (
                  <Link to={authorHref} className="text-sm text-slate-200 hover:text-white truncate block">{authorName}</Link>
                ) : (
                  <span className="text-sm text-slate-300 truncate block">{authorName}</span>
                )}
              </div>
            </div>
            {!lineup.isAuthor && (isGuest || lineup.author?.id) && (
              <button
                onClick={() => (isGuest ? openAuthGate('message', { type: 'lineup' }) : writeTo(lineup.author?.id))}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-colors flex-shrink-0"
              >
                <MessageCircle size={13} /> Написать
              </button>
            )}
          </div>
        </div>

        {/* ── Автор ── */}
        {lineup.isAuthor ? (
          <>
            {lineup.status !== 'closed' && (
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/lineups/${lineup.id}/edit`)}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-2xl transition-colors"
                >
                  <Pencil size={15} /> Редактировать
                </button>
                <button
                  onClick={() => setConfirmClose(true)}
                  disabled={closeMut.isPending}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-red-300 hover:border-red-500/40 rounded-2xl transition-colors disabled:opacity-50"
                >
                  <Lock size={15} /> Закрыть запрос
                </button>
              </div>
            )}
            {lineup.status === 'draft' && (
              <p className="flex items-start gap-2 text-xs text-slate-400 bg-slate-900/60 border border-slate-800/60 rounded-2xl px-4 py-3">
                <Info size={14} className="flex-shrink-0 mt-0.5" /> Черновик видите только вы. Опубликуйте запрос, чтобы артисты могли откликнуться.
              </p>
            )}

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Отклики</h2>
                <span className="text-xs text-slate-500">{responses.length}</span>
                {pendingResponses > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-lg bg-primary-500/15 text-primary-300 border border-primary-500/30 font-semibold">
                    {pendingResponses} {plural(pendingResponses, 'ждёт', 'ждут', 'ждут')} ответа
                  </span>
                )}
              </div>
              {responses.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-900/40 border border-slate-800/60 rounded-2xl px-4 py-6 text-center">
                  {lineup.status === 'active' ? 'Откликов пока нет. Подходящие артисты уже получили уведомление.' : 'Откликов нет.'}
                </p>
              ) : (
                responses.map((r) => (
                  <ResponseCard
                    key={r.id}
                    r={r}
                    canDecide={lineup.status === 'active'}
                    slotsFull={free <= 0}
                    busy={acceptMut.isPending || declineMut.isPending}
                    onAccept={() => acceptMut.mutate(r.id)}
                    onDecline={() => declineMut.mutate(r.id)}
                    onWrite={() => writeTo(r.contactUserId)}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {/* ── Отклики моих артистов на этот запрос ── */}
            {(lineup.myResponses ?? []).filter((m) => m.status !== 'withdrawn').map((m) => {
              const artist = respondAs.find((a) => a.id === m.artistId);
              return (
                <div key={m.id} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AvatarComponent src={artist?.avatar} name={artist?.name ?? 'Артист'} size={24} />
                    <p className="text-sm text-slate-200 flex-1 min-w-0 truncate">Отклик от «{artist?.name ?? 'вашего артиста'}»</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-medium ${RESPONSE_STATUS_CLASS[m.status]}`}>{RESPONSE_STATUS_LABEL[m.status]}</span>
                  </div>
                  <p className="text-xs text-slate-400 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.message}</p>
                  {m.status === 'accepted' && (
                    <p className="text-xs text-emerald-300">Организатор принял отклик — напишите ему, чтобы обсудить детали.</p>
                  )}
                  {(m.status === 'pending' || m.status === 'accepted') && (
                    <button onClick={() => setWithdrawId(m.id)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-300 transition-colors">
                      <Undo2 size={13} /> Отозвать отклик
                    </button>
                  )}
                </div>
              );
            })}

            {/* ── Откликнуться ── */}
            {isOpen && (
              isGuest ? (
                <button onClick={openRespond} className="w-full py-3.5 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-2xl transition-colors">
                  <Send size={16} /> Откликнуться
                </button>
              ) : canRespondAs.length > 0 ? (
                <button onClick={openRespond} className="w-full py-3.5 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-2xl transition-colors">
                  <Send size={16} />
                  <span className="truncate">
                    {canRespondAs.length === 1 ? `Откликнуться от имени «${canRespondAs[0].name}»` : 'Откликнуться от имени артиста'}
                  </span>
                </button>
              ) : respondAs.length === 0 && (
                <p className="text-xs text-slate-400 bg-slate-900/60 border border-slate-800/60 rounded-2xl px-4 py-3 flex items-start gap-2">
                  <Info size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Откликаться могут админы и владельцы артистов — от имени артиста.{' '}
                    <Link to="/artist/create" className="text-primary-400 hover:text-primary-300">Создать артиста</Link>
                  </span>
                </p>
              )
            )}
            <p className="text-center text-xs text-slate-500">
              {lineup.responsesCount} {plural(lineup.responsesCount, 'отклик', 'отклика', 'откликов')}
            </p>
          </>
        )}
      </div>

      {/* Отклик от имени артиста */}
      <Sheet open={respondOpen} onClose={() => setRespondOpen(false)}>
        <h3 className="text-base font-bold text-white mb-1">Отклик на запрос</h3>
        <p className="text-xs text-slate-500 mb-4">Организатор увидит карточку артиста: релизы, слушателей и ближайшие концерты.</p>
        {canRespondAs.length > 1 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-300 mb-1.5">От имени</p>
            <div className="space-y-1.5">
              {canRespondAs.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setRespondArtistId(a.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${respondArtistId === a.id ? 'border-primary-500 bg-primary-500/10' : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600'}`}
                >
                  <AvatarComponent src={a.avatar} name={a.name} size={28} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-white truncate">{a.name}</span>
                    {a.city && <span className="block text-[11px] text-slate-500 truncate">{a.city}</span>}
                  </span>
                  {respondArtistId === a.id && <Check size={16} className="text-primary-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
        {canRespondAs.length === 1 && (
          <div className="mb-4 flex items-center gap-2">
            <AvatarComponent src={canRespondAs[0].avatar} name={canRespondAs[0].name} size={28} />
            <span className="text-sm text-white truncate">от имени «{canRespondAs[0].name}»</span>
          </div>
        )}
        <label className="block text-xs font-semibold text-slate-300 mb-1.5">Сообщение организатору</label>
        <textarea
          value={respondMessage}
          onChange={(e) => setRespondMessage(e.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="Пара слов о себе, длительность сета, что нужно по технике…"
          className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
        />
        <div className="flex gap-2 mt-4">
          <button onClick={() => setRespondOpen(false)} className="flex-1 py-3 text-sm text-slate-300 hover:text-white border border-slate-700 rounded-2xl transition-colors">
            Отмена
          </button>
          <button
            onClick={() => respondMut.mutate()}
            disabled={respondMut.isPending || !respondArtistId || !respondMessage.trim()}
            className="flex-[2] py-3 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5"
          >
            {respondMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Отправить отклик
          </button>
        </div>
      </Sheet>

      {/* Все места заняты — предложить закрыть запрос */}
      <Sheet open={suggestClose} onClose={() => setSuggestClose(false)}>
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-emerald-500/15 rounded-xl flex-shrink-0"><Check size={18} className="text-emerald-400" /></div>
          <div>
            <h3 className="text-base font-bold text-white">Все места заняты</h3>
            <p className="text-sm text-slate-400 mt-1">Вы приняли {lineup.slots} {plural(lineup.slots, 'артиста', 'артистов', 'артистов')}. Закрыть запрос, чтобы он ушёл из ленты и новые отклики не приходили?</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSuggestClose(false)} className="flex-1 py-3 text-sm text-slate-300 hover:text-white border border-slate-700 rounded-2xl transition-colors">
            Оставить открытым
          </button>
          <button
            onClick={() => closeMut.mutate()}
            disabled={closeMut.isPending}
            className="flex-1 py-3 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5"
          >
            {closeMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Закрыть запрос
          </button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmClose}
        message="Закрыть запрос? Он уйдёт из ленты, новые отклики приходить не будут. Это действие нельзя отменить."
        confirmLabel="Закрыть"
        onConfirm={() => closeMut.mutate()}
        onCancel={() => setConfirmClose(false)}
      />
      <ConfirmDialog
        open={!!withdrawId}
        message="Отозвать отклик? Организатор больше не увидит его в списке."
        confirmLabel="Отозвать"
        onConfirm={() => { if (withdrawId) withdrawMut.mutate(withdrawId); }}
        onCancel={() => setWithdrawId(null)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Карточка отклика (видит автор запроса)
// ─────────────────────────────────────────────────────────────────────────────

function ResponseCard({
  r, canDecide, slotsFull, busy, onAccept, onDecline, onWrite,
}: {
  r: LineupResponseItem;
  canDecide: boolean;
  slotsFull: boolean;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onWrite: () => void;
}) {
  const a = r.artist;
  if (!a) return null;
  const delta = a.listenersDelta ?? 0;
  return (
    <div className={`bg-slate-900/60 border rounded-2xl p-4 space-y-3 ${r.status === 'accepted' ? 'border-emerald-500/30' : 'border-slate-800/60'}`}>
      {/* Артист */}
      <div className="flex items-start gap-3">
        <Link to={artistHref(a)} className="flex-shrink-0">
          <AvatarComponent src={a.avatar} name={a.name} size={52} className="rounded-2xl" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <Link to={artistHref(a)} className="flex-1 min-w-0 text-[15px] font-semibold text-white hover:text-primary-300 truncate">{a.name}</Link>
            <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-lg border font-medium ${RESPONSE_STATUS_CLASS[r.status]}`}>{RESPONSE_STATUS_LABEL[r.status]}</span>
          </div>
          {(a.city || a.tourReady) && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{[a.city, a.tourReady].filter(Boolean).join(' · ')}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            <Headphones size={12} className="text-slate-500" />
            <span className="text-slate-300">{formatListeners(a.listeners)} слушателей в месяц</span>
            {delta !== 0 && (
              <span className={`flex items-center gap-0.5 ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{delta > 0 ? '+' : '−'}{formatListeners(Math.abs(delta))}
              </span>
            )}
          </div>
        </div>
      </div>

      {a.genres.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {a.genres.slice(0, 5).map((g) => (
            <span key={g.id} className="px-2 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full text-[11px] text-slate-300">{g.name}</span>
          ))}
        </div>
      )}

      {/* Последние релизы */}
      {a.releases.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Disc3 size={11} />Последние релизы</p>
          <div className="grid grid-cols-3 gap-2">
            {a.releases.map((rel) => {
              const cover = avatarUrl(rel.coverUrl);
              return (
                <Link key={rel.id} to={`/releases/${rel.id}`} className="min-w-0 group">
                  <div className="aspect-square rounded-xl bg-slate-800 border border-slate-700/50 overflow-hidden flex items-center justify-center">
                    {cover ? <img src={cover} alt={rel.title} className="w-full h-full object-cover" loading="lazy" /> : <Disc3 size={20} className="text-slate-600" />}
                  </div>
                  <p className="text-[11px] text-slate-300 group-hover:text-white mt-1 truncate">{rel.title}</p>
                  {rel.releaseDate && <p className="text-[10px] text-slate-500">{new Date(rel.releaseDate).getFullYear()}</p>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Ближайшие концерты (Яндекс Афиша) */}
      {a.concerts.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Ticket size={11} />Ближайшие концерты</p>
          <div className="space-y-1">
            {a.concerts.map((c, i) => {
              const href = safeHref(c.url);
              const body = (
                <span className="text-xs text-slate-300 min-w-0">
                  <span className="text-slate-500">{formatShortDateMsk(c.date)}</span> · {[c.city, c.place].filter(Boolean).join(', ') || c.title}
                </span>
              );
              return href ? (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-white">
                  {body}<ExternalLink size={11} className="text-slate-500 flex-shrink-0" />
                </a>
              ) : <div key={i}>{body}</div>;
            })}
          </div>
        </div>
      )}

      {/* Сообщение */}
      <div className="bg-slate-800/40 rounded-xl px-3 py-2.5">
        <p className="text-sm text-slate-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{r.message}</p>
        {r.submittedBy && (
          <p className="text-[11px] text-slate-500 mt-1.5">— {`${r.submittedBy.firstName} ${r.submittedBy.lastName}`.trim()}, {formatShortDateMsk(r.createdAt)}</p>
        )}
      </div>

      {/* Действия */}
      <div className="flex gap-2">
        <button
          onClick={onWrite}
          className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
        >
          <MessageCircle size={14} /> Написать
        </button>
        {canDecide && (r.status === 'pending' || r.status === 'accepted') && (
          <button
            onClick={onDecline}
            disabled={busy}
            className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-red-300 rounded-xl transition-colors disabled:opacity-50"
          >
            <X size={14} /> Отклонить
          </button>
        )}
        {canDecide && r.status === 'pending' && (
          <button
            onClick={onAccept}
            disabled={busy || slotsFull}
            title={slotsFull ? 'Все места уже заняты' : undefined}
            className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-xl transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Принять
          </button>
        )}
      </div>
    </div>
  );
}
