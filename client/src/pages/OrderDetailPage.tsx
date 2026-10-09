import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Briefcase, DollarSign, Calendar, MessageCircle,
  Archive, Loader2, Send, Link2, Users, Sparkles, HandshakeIcon, Share2,
  Pencil, Check,
} from 'lucide-react';
import { orderAPI, messageAPI } from '../lib/api';
import { avatarUrl } from '../lib/avatar';
import { DEALS_ENABLED } from '../lib/features';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import AvatarComponent from '../components/Avatar';
import OrderStatusChip from '../components/OrderStatusChip';
import ChatPicker from '../components/ChatPicker';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDateMsk, maskDateInput, maskedToMskEndOfDayIso, isMaskedDatePast, isoToMaskedMsk } from '../lib/mskDate';
import { useAuthStore } from '../stores/authStore';
import { useAuthGate, openAuthGate } from '../components/AuthGateModal';
import ShareButton from '../components/ShareButton';
import { personName, hiddenMaterialsCount } from '../lib/publicPerson';
import { useSeo, seoTitle, seoDescription, robotsFor } from '../lib/seo';
import { trackGuestView } from '../lib/metrika';
import { plural } from '../lib/plural';

// Budget «от X ₽ до Y ₽» / «По договорённости»
function formatBudget(from?: number | null, to?: number | null): string {
  if (from == null && to == null) return 'По договорённости';
  return [
    from != null ? `от ${from.toLocaleString('ru')} ₽` : null,
    to != null ? `до ${to.toLocaleString('ru')} ₽` : null,
  ].filter(Boolean).join(' ');
}

// Срок — календарный день по МСК (хранится как конец дня 23:59:59 МСК).
function formatDeadline(deadline?: string | null): string {
  return deadline ? formatDateMsk(deadline) : 'Срок не ограничен';
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showRespond, setShowRespond] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [respondPrice, setRespondPrice] = useState('');
  const [respondComment, setRespondComment] = useState('');
  const [confirmDone, setConfirmDone] = useState(false);
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set());
  const [deadlineEditOpen, setDeadlineEditOpen] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => { const { data } = await orderAPI.getOne(orderId!); return data as any; },
    enabled: !!orderId,
    retry: (count, e: any) => e?.response?.status !== 404 && count < 1,
  });

  const isOwner = !!order?.isOwner;
  const isGuest = !useAuthStore((s) => s.token);
  const gate = useAuthGate();
  useEffect(() => { if (orderId) trackGuestView('order', orderId); }, [orderId]);
  useSeo({
    title: order ? seoTitle(`Заказ: ${order.title}`, order.service?.section?.name) : seoTitle('Заказ'),
    description: order
      ? seoDescription([formatBudget(order.budgetFrom, order.budgetTo), order.description].filter(Boolean).join('. '))
      : null,
    canonical: `/orders/${orderId}`,
    // Закрытые заказы — 200 + noindex (план, раздел A).
    robots: robotsFor(order, order?.status === 'active'),
  });

  // «Предложено» переживает перезагрузку: сервер отдаёт, кому автор уже предлагал заказ.
  useEffect(() => {
    if (order?.offeredExecutorIds) setOfferedIds(new Set(order.offeredExecutorIds));
  }, [order?.offeredExecutorIds]);

  // «Подходящие исполнители» (author only) — page of 5, «Показать больше» loads next.
  const {
    data: matchesData,
    fetchNextPage: fetchMoreMatches,
    hasNextPage: hasMoreMatches,
    isFetchingNextPage: loadingMoreMatches,
  } = useInfiniteQuery({
    queryKey: ['order-matches', orderId],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await orderAPI.getMatches(orderId!, { page: pageParam, limit: 5 });
      return data as any;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: any) => {
      const p = lastPage?.pagination;
      return p && p.page < p.totalPages ? p.page + 1 : undefined;
    },
    enabled: !!orderId && isOwner,
  });

  // «Отклики» (author only)
  const { data: responses = [] } = useQuery<any[]>({
    queryKey: ['order-responses', orderId],
    queryFn: async () => { const { data } = await orderAPI.getResponses(orderId!); return data as any[]; },
    enabled: !!orderId && isOwner,
  });

  const statusMut = useMutation({
    mutationFn: (status: string) => orderAPI.setStatus(orderId!, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders', 'mine'] });
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось изменить статус заказа')),
  });

  const offerMut = useMutation({
    mutationFn: (executorId: string) => orderAPI.offer(orderId!, executorId),
    onSuccess: (res: any, executorId) => {
      setOfferedIds(prev => { const n = new Set(prev); n.add(executorId); return n; });
      toast.success(res?.data?.alreadyOffered ? 'Заказ уже был предложен этому исполнителю' : 'Заказ предложен исполнителю');
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось предложить заказ')),
  });

  // Изменение срока доступно и при откликах (сервер разрешает менять только срок):
  // иначе заказ, ушедший в архив по сроку, нельзя было опубликовать снова.
  const deadlineMut = useMutation({
    mutationFn: (deadline: string | null) => orderAPI.update(orderId!, { deadline }),
    onSuccess: () => {
      setDeadlineEditOpen(false);
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders', 'mine'] });
      toast.success('Срок обновлён');
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось изменить срок')),
  });

  const respondMut = useMutation({
    mutationFn: () => orderAPI.respond(orderId!, {
      price: Number(respondPrice),
      comment: respondComment.trim() || undefined,
    }),
    onSuccess: () => {
      setShowRespond(false);
      setRespondPrice('');
      setRespondComment('');
      // Перечитать заказ — сервер отдаёт мой отклик (myResponse), кнопка
      // «Откликнуться» не появится снова.
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      toast.success('Отклик отправлен');
    },
    onError: (e: any) => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      toast.error(getApiError(e, 'Не удалось отправить отклик'));
    },
  });

  const dealMut = useMutation({
    mutationFn: (responseId: string) => orderAPI.createDeal(orderId!, responseId),
    onSuccess: (res: any) => {
      const dealId = res?.data?.deal?.id;
      if (dealId) navigate(`/deals/${dealId}`);
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось оформить сделку')),
  });

  // Выбор исполнителя — однократный, с подтверждением (после него отклики закрываются)
  const [confirmChoose, setConfirmChoose] = useState<{ responseId: string; name: string } | null>(null);
  const chooseMut = useMutation({
    mutationFn: (responseId: string) => orderAPI.chooseExecutor(orderId!, responseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['order-responses', orderId] });
      toast.success('Исполнитель выбран');
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось выбрать исполнителя')),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Заказ не найден</p>
      </div>
    );
  }

  const budget = formatBudget(order.budgetFrom, order.budgetTo);
  const sectionName = order.service?.section?.name ?? null;
  const matchResults: any[] = matchesData?.pages.flatMap((pg: any) => pg.results ?? []) ?? [];
  const matchesEmpty = (matchesData?.pages?.[0] as any)?.fallbackLevel === 'empty';

  // Grouped custom filters (mirror ServicePage)
  const customFilterValues: { filterName: string; values: string[] }[] = [];
  if (order.selectedCustomFilterValues?.length) {
    const grouped: Record<string, { filterName: string; values: string[] }> = {};
    for (const v of order.selectedCustomFilterValues) {
      const fId = v.filter?.id ?? v.filterId ?? 'unknown';
      if (!grouped[fId]) grouped[fId] = { filterName: v.filter?.name ?? '', values: [] };
      grouped[fId].values.push(v.value ?? v.name ?? '');
    }
    customFilterValues.push(...Object.values(grouped));
  }

  // Editing is disabled once the order has responses (server-enforced too).
  const hasResponses = responses.length > 0;
  const deadlineExpired = !!order.deadline && new Date(order.deadline).getTime() < Date.now();
  const myResponse = order.myResponse ?? null;
  // «Выполнен» — когда исполнитель выбран: и в активном, и в архивном заказе.
  const canMarkDone = !!order.executorId && (order.status === 'active' || order.status === 'archived');
  const doneBtn = canMarkDone ? (
    <button
      onClick={() => setConfirmDone(true)}
      disabled={statusMut.isPending}
      className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl transition-colors disabled:opacity-50"
    >
      {statusMut.isPending ? <Loader2 size={15} className="animate-spin" /> : '✓'}
      Выполнен
    </button>
  ) : null;
  const deadlineInvalid = deadlineInput.trim() !== '' && maskedToMskEndOfDayIso(deadlineInput) === null;
  const deadlinePast = !deadlineInvalid && deadlineInput.length === 10 && isMaskedDatePast(deadlineInput);
  const editBtn = (
    <button
      onClick={() => hasResponses
        ? toast.error('Заказ нельзя редактировать — на него уже есть отклики')
        : navigate(`/orders/edit/${orderId}`)}
      className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium border rounded-2xl transition-colors ${
        hasResponses ? 'border-slate-800 text-slate-500' : 'border-slate-700 text-slate-300 hover:text-white hover:border-slate-600'
      }`}
      title={hasResponses ? 'Есть отклики — редактирование недоступно' : 'Редактировать'}
    >
      <Pencil size={15} />
      Редактировать
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 pb-32">
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Back + title */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all flex-shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Briefcase size={16} className="text-teal-400 flex-shrink-0" />
            <h1 className="text-base font-bold text-white truncate">{order.title}</h1>
          </div>
          <OrderStatusChip order={order} className="flex-shrink-0" />
          {/* «Поделиться» доступно без входа; вошедшему — «Отправить в чат» */}
          {isGuest ? (
            <ShareButton
              url={`/orders/${order.id}`}
              title={`Заказ «${order.title}» — Moooza`}
              iconSize={14}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex-shrink-0"
            />
          ) : (
            <button
              onClick={() => setShareOpen(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex-shrink-0"
              title="Отправить в чат"
            >
              <Share2 size={14} />
            </button>
          )}
        </div>

        {/* «Отправить в чат» — заказ уходит сообщением со ссылкой */}
        {shareOpen && (
          <ChatPicker
            title="Отправить заказ в чат"
            onClose={() => setShareOpen(false)}
            onPick={async (convId) => {
              try {
                await messageAPI.sendMessage(convId, `Заказ «${order.title}» — ${window.location.origin}/orders/${order.id}`);
                setShareOpen(false);
                toast.success('Отправлено в чат');
              } catch (e: any) {
                toast.error(getApiError(e, 'Не удалось отправить'));
              }
            }}
          />
        )}

        {/* Main card */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 space-y-4">
          {sectionName && (
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">{sectionName}</p>
          )}

          <h2 className="text-xl font-bold text-white leading-tight break-words [overflow-wrap:anywhere]">{order.title}</h2>

          {/* Filters */}
          {customFilterValues.length > 0 && (
            <div className="space-y-2">
              {customFilterValues.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 flex-shrink-0 pt-0.5 min-w-[80px]">{f.filterName}</span>
                  <div className="flex flex-wrap gap-1">
                    {f.values.map((v, j) => (
                      <span key={j} className="px-2 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full text-xs text-slate-300">{v}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Budget */}
          <div className="flex items-center gap-2">
            <DollarSign size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-base font-bold text-teal-400">{budget}</span>
          </div>

          {/* Deadline */}
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-sm text-slate-300">{formatDeadline(order.deadline)}</span>
          </div>

          {/* Description */}
          {order.description && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Описание</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{order.description}</p>
            </div>
          )}

          {/* References — files */}
          {order.referenceFiles?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Референсы</p>
              <div className="space-y-2">
                {order.referenceFiles.map((file: any) => {
                  const url = avatarUrl(file.url) || undefined;
                  const isImage = IMAGE_EXT.test(file.originalName || file.url || '');
                  const isAudio = (file.mimeType || '').startsWith('audio') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.originalName || file.url || '');
                  return (
                    <div key={file.id}>
                      {isImage ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={file.originalName} className="max-h-48 rounded-xl border border-slate-800 object-cover" />
                        </a>
                      ) : isAudio ? (
                        <audio controls src={url} className="w-full" />
                      ) : (
                        <a href={url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors min-w-0">
                          <Link2 size={14} className="flex-shrink-0" /><span className="min-w-0 break-all">{file.originalName}</span>
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Гостю материалы заказа не отдаются — только их число */}
          {!order.referenceFiles?.length && !order.referenceLinks?.length
            && hiddenMaterialsCount(order) > 0 && (() => {
            const n = hiddenMaterialsCount(order);
            return (
              <button
                onClick={() => openAuthGate('page', { type: 'order_materials' }, 'Материалы заказа доступны после входа')}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                <Link2 size={14} className="flex-shrink-0" />
                {n} {plural(n, 'материал', 'материала', 'материалов')} — после входа
              </button>
            );
          })()}

          {/* References — links */}
          {order.referenceLinks?.length > 0 && (
            <div>
              {!order.referenceFiles?.length && (
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Референсы</p>
              )}
              <div className="space-y-1.5">
                {order.referenceLinks.map((link: any) => (
                  <a key={link.id} href={link.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors break-all">
                    <Link2 size={14} className="flex-shrink-0" />{link.title || link.url}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── OWNER ── */}
        {isOwner ? (
          <>
            {/* Status actions */}
            {/* Срок истёк / изменение срока при откликах */}
            {order.status !== 'done' && order.status !== 'draft' && (deadlineExpired || hasResponses) && (
              <div className={`rounded-2xl border p-3 space-y-2 ${deadlineExpired ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800/60 bg-slate-900/60'}`}>
                <div className="flex items-center gap-2">
                  <Calendar size={14} className={deadlineExpired ? 'text-amber-400' : 'text-slate-500'} />
                  <p className={`text-xs flex-1 ${deadlineExpired ? 'text-amber-300' : 'text-slate-400'}`}>
                    {deadlineExpired
                      ? (order.executorId ? 'Срок выполнения истёк.' : 'Срок выполнения истёк — чтобы опубликовать заказ снова, укажите новый срок.')
                      : 'На заказ есть отклики — можно изменить только срок.'}
                  </p>
                  {!deadlineEditOpen && (
                    <button
                      onClick={() => { setDeadlineInput(isoToMaskedMsk(order.deadline)); setDeadlineEditOpen(true); }}
                      className="text-xs font-semibold text-primary-400 hover:text-primary-300 flex-shrink-0"
                    >
                      Изменить срок
                    </button>
                  )}
                </div>
                {deadlineEditOpen && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="ДД.ММ.ГГГГ"
                      maxLength={10}
                      value={deadlineInput}
                      onChange={e => setDeadlineInput(maskDateInput(e.target.value))}
                      className={`w-full min-w-0 px-3 py-2 bg-slate-800 border rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ${deadlineInvalid || deadlinePast ? 'border-red-500/60' : 'border-slate-700'}`}
                    />
                    {deadlineInvalid && <p className="text-[11px] text-red-400">Введите существующую дату в формате ДД.ММ.ГГГГ</p>}
                    {deadlinePast && <p className="text-[11px] text-red-400">Срок уже прошёл — укажите будущую дату</p>}
                    <div className="flex gap-2">
                      <button onClick={() => setDeadlineEditOpen(false)} className="flex-1 py-2 text-xs text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
                      <button
                        onClick={() => deadlineMut.mutate(deadlineInput.trim() ? maskedToMskEndOfDayIso(deadlineInput) : null)}
                        disabled={deadlineMut.isPending || deadlineInvalid || deadlinePast || (deadlineInput.trim() !== '' && deadlineInput.length < 10)}
                        className="flex-1 py-2 text-xs font-semibold bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                      >
                        {deadlineMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        {deadlineInput.trim() ? 'Сохранить срок' : 'Без срока'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {order.status === 'active' && (
              <div className="flex gap-2">
                {editBtn}
                {doneBtn}
                <button
                  onClick={() => statusMut.mutate('archived')}
                  disabled={statusMut.isPending}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-2xl transition-colors disabled:opacity-50"
                >
                  {statusMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />}
                  В архив
                </button>
              </div>
            )}

            {order.status === 'draft' && (
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/orders/edit/${orderId}`)}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-2xl transition-colors disabled:opacity-50"
                >
                  <Pencil size={15} />
                  Редактировать
                </button>
                <button
                  onClick={() => deadlineExpired
                    ? toast.error('Срок выполнения истёк — измените срок в редактировании заказа')
                    : statusMut.mutate('active')}
                  disabled={statusMut.isPending}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-2xl transition-colors disabled:opacity-50"
                >
                  {statusMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Опубликовать
                </button>
              </div>
            )}

            {order.status === 'archived' && (
              <div className="flex gap-2">
                <button
                  onClick={() => deadlineExpired
                    ? toast.error('Срок выполнения истёк — сначала укажите новый срок')
                    : statusMut.mutate('active')}
                  disabled={statusMut.isPending}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-2xl transition-colors disabled:opacity-50"
                >
                  {statusMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Опубликовать
                </button>
                {doneBtn}
                {editBtn}
              </div>
            )}

            {/* Matches */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-primary-400" />
                <h3 className="text-sm font-bold text-white">Подходящие исполнители</h3>
              </div>

              {matchesEmpty ? (
                <div className="text-center py-4 space-y-3">
                  <Sparkles size={28} className="text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">Заказ уже виден всей платформе</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Пока нет точных совпадений по фильтрам, но ваш заказ опубликован в Потоке — его увидят подходящие специалисты и смогут откликнуться.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => navigate(order.postId ? `/?post=${order.postId}` : '/')}
                      className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
                      Посмотреть заказ в Потоке
                    </button>
                    <button onClick={() => navigate('/invite')}
                      className="inline-flex items-center justify-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                      <Share2 size={12} />Пригласить специалиста по ссылке
                    </button>
                  </div>
                </div>
              ) : matchResults.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Загрузка подходящих исполнителей...</p>
              ) : (
                <div className="space-y-2">
                  {matchResults.map((m: any) => {
                    const u = m.user ?? m;
                    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
                    const professions: string[] = (m.professions?.map((p: any) => p?.name).filter(Boolean))
                      ?? (m.searchProfile?.professions?.map((p: any) => p?.name).filter(Boolean))
                      ?? [];
                    const city = u.city || u.country || '';
                    return (
                      <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-800/40 border border-slate-800/60">
                        <button onClick={() => navigate(`/profile/${u.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          <AvatarComponent src={u.avatar} name={name} size={40} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{name}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {[professions.join(', '), city].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </button>
                        {offeredIds.has(u.id) ? (
                          <span className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-green-400 flex items-center gap-1">
                            <Check size={13} /> Предложено
                          </span>
                        ) : order.status === 'active' && !order.executorId ? (
                          <button
                            onClick={() => offerMut.mutate(u.id)}
                            disabled={offerMut.isPending}
                            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                          >
                            Предложить заказ
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  {hasMoreMatches && (
                    <button
                      onClick={() => fetchMoreMatches()}
                      disabled={loadingMoreMatches}
                      className="w-full py-2 text-xs font-semibold text-primary-400 hover:text-primary-300 transition-colors disabled:opacity-50"
                    >
                      {loadingMoreMatches ? 'Загрузка…' : 'Показать больше'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Responses */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageCircle size={15} className="text-primary-400" />
                <h3 className="text-sm font-bold text-white">Отклики</h3>
                {responses.length > 0 && (
                  <span className="text-xs text-slate-500">{responses.length}</span>
                )}
              </div>

              {responses.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Пока никто не откликнулся.</p>
              ) : (
                <div className="space-y-3">
                  {responses.map((r: any) => {
                    const u = r.executor ?? {};
                    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
                    const isChosen = !!order.executorId && u.id === order.executorId;
                    return (
                      <div key={r.id} className={`p-3 rounded-xl space-y-2 border ${isChosen ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-slate-800/40 border-slate-800/60'} ${order.executorId && !isChosen ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-3">
                          <button onClick={() => navigate(`/profile/${u.id}`)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                            <AvatarComponent src={u.avatar} name={name} size={36} />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{name}</p>
                              <p className="text-xs text-teal-400 font-semibold">{Number(r.price).toLocaleString('ru')} ₽</p>
                            </div>
                          </button>
                          {isChosen && (
                            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-semibold flex-shrink-0">
                              ✓ Исполнитель
                            </span>
                          )}
                        </div>
                        {r.comment && (
                          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{r.comment}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/messages/${u.id}`)}
                            className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                          >
                            <MessageCircle size={13} />Написать
                          </button>
                          {!order.executorId && order.status === 'active' && (
                            <button
                              onClick={() => setConfirmChoose({ responseId: r.id, name })}
                              disabled={chooseMut.isPending}
                              className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              {chooseMut.isPending ? <Loader2 size={13} className="animate-spin" /> : '✓'}
                              Выбрать исполнителем
                            </button>
                          )}
                          {DEALS_ENABLED && (
                            <button
                              onClick={() => dealMut.mutate(r.id)}
                              disabled={dealMut.isPending}
                              className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              {dealMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <HandshakeIcon size={13} />}
                              Оформить сделку
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── NON-OWNER ── */
          <div className="space-y-2">
            {/* Гостю вместо executorId — hasExecutor + обезличенная персона executor */}
            {(order.executorId || order.hasExecutor) ? (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/25">
                <span className="text-emerald-400 text-lg flex-shrink-0">✓</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    Исполнитель выбран{order.executor ? `: ${personName(order.executor)}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">Отклики на этот заказ закрыты.</p>
                </div>
              </div>
            ) : myResponse && !showRespond ? (
              /* Я уже откликнулся — показываем мой отклик (с сервера, переживает перезагрузку) */
              <div className="border border-slate-800/60 bg-slate-900/60 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Check size={15} className="text-emerald-400 flex-shrink-0" />
                  <p className="text-sm font-semibold text-white flex-1">Ваш отклик отправлен</p>
                  <span className="text-xs text-teal-400 font-semibold flex-shrink-0">{Number(myResponse.price).toLocaleString('ru')} ₽</span>
                </div>
                {myResponse.comment && (
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{myResponse.comment}</p>
                )}
                {order.status === 'active' ? (
                  <button
                    onClick={() => { setRespondPrice(String(myResponse.price ?? '')); setRespondComment(myResponse.comment ?? ''); setShowRespond(true); }}
                    className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    Изменить отклик
                  </button>
                ) : (
                  <p className="text-xs text-slate-500">{order.status === 'done' ? 'Заказ выполнен' : 'Заказ в архиве'} — отклики закрыты.</p>
                )}
              </div>
            ) : order.status !== 'active' ? (
              /* Архив/выполнен/черновик — отклики закрыты (сервер тоже гейтит) */
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/40">
                <Archive size={18} className="text-slate-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {isGuest ? 'Заказ закрыт' : order.status === 'done' ? 'Заказ выполнен' : 'Заказ в архиве'}
                  </p>
                  <p className="text-xs text-slate-400">Отклики на этот заказ закрыты.</p>
                </div>
              </div>
            ) : showRespond ? (
              <div className="space-y-3 border border-primary-500/20 bg-primary-500/5 rounded-2xl p-4">
                <p className="text-sm font-semibold text-white">{myResponse ? 'Изменить отклик' : 'Откликнуться на заказ'}</p>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Цена (₽)</label>
                  <input
                    type="number"
                    value={respondPrice}
                    onChange={e => setRespondPrice(e.target.value)}
                    placeholder="Ваша цена ₽"
                    className="w-full min-w-0 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Комментарий (необязательно)</label>
                  <textarea
                    value={respondComment}
                    onChange={e => setRespondComment(e.target.value)}
                    placeholder="Расскажите, как вы можете помочь..."
                    rows={3}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowRespond(false)} className="flex-1 py-2 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
                  <button
                    onClick={() => respondMut.mutate()}
                    disabled={respondMut.isPending || !respondPrice || !Number.isInteger(Number(respondPrice)) || Number(respondPrice) < 0}
                    className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {respondMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {myResponse ? 'Сохранить' : 'Отправить отклик'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => gate.ensure('respondOrder', { type: 'order' }, () => setShowRespond(true))}
                className="w-full py-3.5 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white rounded-2xl transition-colors"
              >
                <Send size={16} />Откликнуться
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDone}
        message="Отметить заказ выполненным? Он перейдёт во «Выполненные», отклики будут закрыты."
        confirmLabel="Выполнен"
        onConfirm={() => statusMut.mutate('done')}
        onCancel={() => setConfirmDone(false)}
      />

      <ConfirmDialog
        open={!!confirmChoose}
        message={`Выбрать ${confirmChoose?.name || 'этого исполнителя'} исполнителем заказа? После выбора отклики закроются, изменить выбор будет нельзя.`}
        confirmLabel="Выбрать"
        onConfirm={() => { if (confirmChoose) chooseMut.mutate(confirmChoose.responseId); setConfirmChoose(null); }}
        onCancel={() => setConfirmChoose(null)}
      />
    </div>
  );
}
