import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Briefcase, DollarSign, MapPin, MessageCircle,
  Archive, ArchiveRestore, Trash2, Loader2, HandshakeIcon, Send, Pencil, X, Check,
} from 'lucide-react';
import { userAPI, messageAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { useAuthStore } from '../stores/authStore';
import ConfirmDialog from '../components/ConfirmDialog';
import DealCreateModal from '../components/DealCreateModal';
import { DEALS_ENABLED } from '../lib/features';
import { useAuthGate } from '../components/AuthGateModal';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import { useScrollLock } from '../lib/scrollLock';

const STATUS_LABEL: Record<string, string> = {
  active: 'Действующая',
  draft: 'Черновик',
  archived: 'Архив',
  pending_review: 'На модерации',
};
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  draft: 'bg-slate-700/60 text-slate-400',
  archived: 'bg-amber-500/15 text-amber-400',
  pending_review: 'bg-blue-500/15 text-blue-400',
};

export default function ServicePage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showPostDialog = searchParams.get('showPostDialog') === '1';
  const me = useAuthStore(s => s.user);
  const queryClient = useQueryClient();
  const { ensureAuth, authGateModal } = useAuthGate();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [writingMessage, setWritingMessage] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [customText, setCustomText] = useState('');
  const [showDeal, setShowDeal] = useState(false);
  const [postDialogOpen, setPostDialogOpen] = useState(false);

  useScrollLock(showTemplates || postDialogOpen);

  const { data: us, isLoading } = useQuery({
    queryKey: ['user-service', serviceId],
    queryFn: async () => { const { data } = await userAPI.getUserService(serviceId!); return data as any; },
    enabled: !!serviceId,
  });

  const statusMut = useMutation({
    mutationFn: (status: 'active' | 'draft' | 'archived' | 'pending_review') => userAPI.setServiceStatus(serviceId!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-service', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['user-services'] });
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось изменить статус услуги')),
  });

  const deleteMut = useMutation({
    mutationFn: () => userAPI.deleteService(serviceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      navigate(-1);
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось удалить услугу')),
  });

  useEffect(() => {
    if (showPostDialog && us?.status === 'active') {
      setPostDialogOpen(true);
    }
  }, [showPostDialog, us?.status]);

  // Open the chat with the chosen/typed first message prefilled. The contact
  // endpoint ensures the direct conversation exists and notifies the provider
  // even if the buyer never actually sends anything.
  const openChatWith = async (prefill: string) => {
    if (!serviceId || writingMessage) return;
    setWritingMessage(true);
    try {
      const { data } = await messageAPI.contactService(serviceId);
      setShowTemplates(false);
      navigate(`/messages/${data.conversationId}`, { state: { prefillMessage: prefill } });
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось открыть чат'));
      setWritingMessage(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!us) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Услуга не найдена</p>
      </div>
    );
  }

  const isOwner = me?.id === us.user?.id;
  const status: 'active' | 'draft' | 'archived' | 'pending_review' = us.status ?? 'active';

  const price = us.priceFrom != null || us.priceTo != null
    ? [us.priceFrom != null ? `от ${us.priceFrom} ₽` : null, us.priceTo != null ? `до ${us.priceTo} ₽` : null].filter(Boolean).join(' ')
    : 'По договорённости';

  const authorName = us.user ? `${us.user.firstName ?? ''} ${us.user.lastName ?? ''}`.trim() : null;
  const authorAvatar = us.user?.avatar ? getAvatarUrl(us.user.avatar) : null;

  const customFilterValues: { filterName: string; values: string[] }[] = [];
  if (us.selectedCustomFilterValues?.length) {
    const grouped: Record<string, { filterName: string; values: string[] }> = {};
    for (const v of us.selectedCustomFilterValues) {
      const fId = v.filter?.id ?? v.filterId ?? 'unknown';
      if (!grouped[fId]) grouped[fId] = { filterName: v.filter?.name ?? '', values: [] };
      grouped[fId].values.push(v.value ?? v.name ?? '');
    }
    customFilterValues.push(...Object.values(grouped));
  }

  const allFilters = [
    ...(us.genres?.length ? [{ filterName: 'Жанры', values: us.genres.map((g: any) => g.name) }] : []),
    ...(us.workFormats?.length ? [{ filterName: 'Формат работы', values: us.workFormats.map((w: any) => w.name) }] : []),
    ...(us.employmentTypes?.length ? [{ filterName: 'Тип занятости', values: us.employmentTypes.map((e: any) => e.name) }] : []),
    ...(us.skillLevels?.length ? [{ filterName: 'Уровень', values: us.skillLevels.map((s: any) => s.name) }] : []),
    ...(us.availabilities?.length ? [{ filterName: 'Доступность', values: us.availabilities.map((a: any) => a.name) }] : []),
    ...(us.geographies?.length ? [{ filterName: 'География', values: us.geographies.map((g: any) => g.name) }] : []),
    ...customFilterValues,
  ];

  return (
    <div className="min-h-screen bg-slate-950 pb-32">
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Back + author */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all flex-shrink-0">
            <ArrowLeft size={20} />
          </button>
          {us.user && !isOwner && (
            <button onClick={() => navigate(`/profile/${us.user.id}`)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 flex-shrink-0">
                {authorAvatar
                  ? <img src={authorAvatar} alt={authorName ?? ''} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-bold">{(authorName?.[0] ?? '?').toUpperCase()}</div>
                }
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{authorName}</p>
                {us.user.nickname && <p className="text-xs text-slate-500 truncate">@{us.user.nickname}</p>}
              </div>
            </button>
          )}
          {isOwner && (
            <div className="ml-auto flex items-center gap-2">
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${STATUS_COLOR[status]}`}>
                {STATUS_LABEL[status]}
              </span>
              <button
                onClick={() => {
                  // Edit via the full profile ServiceForm (the only place that can
                  // change the catalog section + custom filters). Deep-link by the
                  // catalog serviceId — ProfilePage keys its services by it.
                  navigate(`/profile?editService=${us.serviceId}`);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                title="Редактировать"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Main card */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 space-y-4">
          {/* Service catalog label */}
          <div className="space-y-0.5">
            {us.profession?.direction?.fieldOfActivity?.name && (
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">
                {us.profession.direction.fieldOfActivity.name} · {us.profession.direction.name}
              </p>
            )}
            {us.profession?.name && (
              <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider">{us.profession.name}</p>
            )}
          </div>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-900/60 border border-primary-700/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Briefcase size={18} className="text-primary-400" />
            </div>
            <h1 className="text-xl font-bold text-white leading-tight">{us.service?.name}</h1>
          </div>

          {/* Filters */}
          {allFilters.length > 0 && (
            <div className="space-y-2">
              {allFilters.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 flex-shrink-0 pt-0.5 min-w-[80px]">{f.filterName}</span>
                  <div className="flex flex-wrap gap-1">
                    {f.values.map((v: string, j: number) => (
                      <span key={j} className="px-2 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full text-xs text-slate-300">{v}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Price */}
          <div className="flex items-center gap-2">
            <DollarSign size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-base font-bold text-primary-400">{price}</span>
          </div>

          {/* Geography */}
          {(us.geographies?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              <MapPin size={13} className="text-slate-500 flex-shrink-0" />
              <span className="text-sm text-slate-300">{us.geographies.map((g: any) => g.name).join(', ')}</span>
            </div>
          )}

          {/* Description */}
          {us.description && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Описание</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{us.description}</p>
            </div>
          )}

          {/* Price list */}
          {us.priceItems && Array.isArray(us.priceItems) && (us.priceItems as any[]).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Прайс-лист</p>
              <div className="space-y-1.5">
                {(us.priceItems as any[]).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-300 flex-1">{item.name}</span>
                    <span className="text-sm font-medium text-primary-400 flex-shrink-0">{item.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── OWNER ACTIONS ── */}
        {isOwner && (
          <div className="space-y-2">
            {status === 'active' && (
              <button
                onClick={() => statusMut.mutate('archived')}
                disabled={statusMut.isPending}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-2xl transition-colors disabled:opacity-50"
              >
                {statusMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />}
                Убрать в архив
              </button>
            )}
            {status === 'draft' && (
              <>
                <button
                  onClick={() => statusMut.mutate('active')}
                  disabled={statusMut.isPending}
                  className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-2xl transition-colors disabled:opacity-50"
                >
                  {statusMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Опубликовать
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-2xl transition-colors"
                >
                  <Trash2 size={15} />Удалить
                </button>
              </>
            )}
            {status === 'archived' && (
              <button
                onClick={() => statusMut.mutate('active')}
                disabled={statusMut.isPending}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-2xl transition-colors disabled:opacity-50"
              >
                {statusMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <ArchiveRestore size={15} />}
                Опубликовать
              </button>
            )}
          </div>
        )}

        {/* ── CUSTOMER ACTIONS ── */}
        {!isOwner && us.user && (
          <div className="space-y-2">
            <button
              onClick={() => ensureAuth(() => { setCustomText(''); setShowTemplates(true); })}
              disabled={writingMessage}
              className="w-full py-3.5 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 active:bg-primary-700 disabled:opacity-60 text-white rounded-2xl transition-colors"
            >
              {writingMessage ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
              Написать
            </button>
            {DEALS_ENABLED && (
              <button
                onClick={() => ensureAuth(() => setShowDeal(true))}
                className="w-full py-3.5 flex items-center justify-center gap-2 text-sm font-medium border border-primary-500/40 text-primary-300 hover:bg-primary-600/10 rounded-2xl transition-colors"
              >
                <HandshakeIcon size={16} />
                Оформить сделку
              </button>
            )}
          </div>
        )}
      </div>

      {showDeal && !isOwner && us.user && (
        <DealCreateModal
          executorId={us.user.id}
          executorName={authorName ?? ''}
          serviceId={us.service?.id}
          userServiceId={us.id}
          serviceName={us.service?.name}
          onClose={() => setShowDeal(false)}
        />
      )}

      {authGateModal}

      {/* First-message template chooser (bottom sheet) */}
      {showTemplates && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !writingMessage && setShowTemplates(false)} />
          <div className="relative w-full sm:max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
              <h3 className="text-base font-semibold text-white">Сообщение исполнителю</h3>
              <button onClick={() => setShowTemplates(false)} disabled={writingMessage} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-2">
              {[
                `Добрый день! Хочу уточнить по услуге «${us.service?.name ?? ''}»`,
                'Хочу узнать сроки',
                'Хочу обсудить детали',
                'Хочу заказать прямо сейчас',
              ].map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => openChatWith(tpl)}
                  disabled={writingMessage}
                  className="w-full text-left px-4 py-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-xl text-sm text-slate-200 transition-colors disabled:opacity-50"
                >
                  {tpl}
                </button>
              ))}

              <div className="pt-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Или своё сообщение</label>
                <textarea
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  placeholder="Напишите сообщение..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                />
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => openChatWith(customText.trim())}
                disabled={writingMessage}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-2xl transition-colors disabled:opacity-50"
              >
                {writingMessage ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
                {customText.trim() ? 'Отправить своё' : 'Открыть чат'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmDialog
        open={confirmDelete}
        message={`Удалить услугу «${us.service?.name ?? ''}»?`}
        confirmLabel="Удалить"
        onConfirm={() => deleteMut.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      {postDialogOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPostDialogOpen(false)} />
          <div className="relative w-full sm:max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 pt-6 pb-4 text-center border-b border-slate-800">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <Check size={28} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Услуга опубликована</h3>
              <p className="text-sm text-slate-400">Поделитесь ею в Потоке, чтобы получить заказы быстрее</p>
            </div>
            <div className="px-5 py-4 space-y-2">
              <button
                onClick={() => navigate(`/create-post?type=service&serviceId=${us.id}`)}
                className="w-full py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Send size={15} />Опубликовать в Поток
              </button>
              <button onClick={() => setPostDialogOpen(false)}
                className="w-full py-2.5 text-sm text-slate-400 hover:text-white transition-colors">
                Не сейчас
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
