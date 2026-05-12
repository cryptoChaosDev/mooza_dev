import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Briefcase, DollarSign, MapPin, MessageCircle,
  Archive, ArchiveRestore, Trash2, Loader2, HandshakeIcon, Send,
} from 'lucide-react';
import { userAPI, messageAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { useAuthStore } from '../stores/authStore';
import ConfirmDialog from '../components/ConfirmDialog';

const STATUS_LABEL: Record<string, string> = {
  active: 'Действующая',
  draft: 'Черновик',
  archived: 'Архив',
};
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  draft: 'bg-slate-700/60 text-slate-400',
  archived: 'bg-amber-500/15 text-amber-400',
};

export default function ServicePage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const queryClient = useQueryClient();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [writingMessage, setWritingMessage] = useState(false);

  const { data: us, isLoading } = useQuery({
    queryKey: ['user-service', serviceId],
    queryFn: async () => { const { data } = await userAPI.getUserService(serviceId!); return data as any; },
    enabled: !!serviceId,
  });

  const statusMut = useMutation({
    mutationFn: (status: 'active' | 'draft' | 'archived') => userAPI.setServiceStatus(serviceId!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-service', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['user-services'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => userAPI.deleteService(serviceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      navigate(-1);
    },
  });

  const inquireMut = useMutation({
    mutationFn: () => userAPI.inquireService(serviceId!),
  });

  const handleWrite = async () => {
    if (!us?.user?.id || writingMessage) return;
    setWritingMessage(true);
    try {
      const { data } = await messageAPI.resolve(us.user.id);
      const convId = data.conversationId;
      const prefill = `Добрый день! Хочу уточнить по услуге «${us.service?.name ?? ''}»`;
      inquireMut.mutate();
      navigate(`/messages/${convId}`, { state: { prefillMessage: prefill } });
    } catch {
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
  const status: 'active' | 'draft' | 'archived' = us.status ?? 'active';

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
            <span className={`ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-lg ${STATUS_COLOR[status]}`}>
              {STATUS_LABEL[status]}
            </span>
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
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{us.description}</p>
            </div>
          )}
        </div>

        {/* ── OWNER ACTIONS ── */}
        {isOwner && (
          <div className="space-y-2">
            {status === 'active' && (
              <>
                <button
                  onClick={() => statusMut.mutate('archived')}
                  disabled={statusMut.isPending}
                  className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-2xl transition-colors disabled:opacity-50"
                >
                  {statusMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />}
                  Убрать в архив
                </button>
                <button
                  className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium bg-primary-600/20 border border-primary-500/40 text-primary-300 rounded-2xl transition-colors opacity-50 cursor-not-allowed"
                  disabled
                  title="Скоро"
                >
                  <HandshakeIcon size={15} />
                  Оформить сделку <span className="text-xs opacity-60">(скоро)</span>
                </button>
              </>
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
              onClick={handleWrite}
              disabled={writingMessage}
              className="w-full py-3.5 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 active:bg-primary-700 disabled:opacity-60 text-white rounded-2xl transition-colors"
            >
              {writingMessage ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
              Написать
            </button>
            <button
              className="w-full py-3.5 flex items-center justify-center gap-2 text-sm font-medium border border-primary-500/40 text-primary-300 rounded-2xl opacity-50 cursor-not-allowed"
              disabled
              title="Скоро"
            >
              <HandshakeIcon size={16} />
              Оформить сделку <span className="text-xs opacity-60">(скоро)</span>
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        message={`Удалить услугу «${us.service?.name ?? ''}»?`}
        confirmLabel="Удалить"
        onConfirm={() => deleteMut.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
