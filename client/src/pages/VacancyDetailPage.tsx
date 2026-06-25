import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Megaphone, MapPin, Briefcase, DollarSign, Clock, MessageCircle,
  Archive, Loader2, Send, Link2, Users, Sparkles, HandshakeIcon, Share2,
  Pencil, Check, X, Trash2,
} from 'lucide-react';
import { vacancyAPI } from '../lib/api';
import { avatarUrl } from '../lib/avatar';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import AvatarComponent from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import VacancyForm from '../components/VacancyForm';
import {
  workFormatLabel, geographyLabel, employmentLabel, paymentLabel,
  PAYMENT_WITH_COMPENSATION, occupancyLabel, occupancyBadgeClass,
} from '../lib/vacancyOptions';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

// Payment summary «Тип оплаты · N» (compensation only for percent|rate).
function formatPayment(paymentType?: string | null, compensation?: number | null): string {
  const label = paymentLabel(paymentType);
  if (compensation != null && PAYMENT_WITH_COMPENSATION.has(paymentType || '')) {
    return `${label} · ${compensation.toLocaleString('ru')}`;
  }
  return label;
}

export default function VacancyDetailPage() {
  const { vacancyId } = useParams<{ vacancyId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);

  // Applicant response form state
  const [showRespond, setShowRespond] = useState(false);
  const [respondComment, setRespondComment] = useState('');
  const [respondFiles, setRespondFiles] = useState<File[]>([]);
  const [respondLinks, setRespondLinks] = useState<{ url: string; title: string; source: string }[]>([]);

  // Cooperation offer modal (owner → response)
  const [coopResponseId, setCoopResponseId] = useState<string | null>(null);
  const [coopStartDate, setCoopStartDate] = useState('');
  const [coopConditions, setCoopConditions] = useState('');
  const [coopCompensation, setCoopCompensation] = useState('');
  const [coopExtra, setCoopExtra] = useState('');

  // Archive prompt dismissal (client-side)
  const [archiveDismissed, setArchiveDismissed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: vacancy, isLoading } = useQuery({
    queryKey: ['vacancy', vacancyId],
    queryFn: async () => { const { data } = await vacancyAPI.getOne(vacancyId!); return data as any; },
    enabled: !!vacancyId,
  });

  const isOwner = !!vacancy?.isOwner;

  // «Подходящие кандидаты» (owner only) — page of 5, «Показать больше» loads next.
  const {
    data: matchesData,
    fetchNextPage: fetchMoreMatches,
    hasNextPage: hasMoreMatches,
    isFetchingNextPage: loadingMoreMatches,
  } = useInfiniteQuery({
    queryKey: ['vacancy-matches', vacancyId],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await vacancyAPI.getMatches(vacancyId!, { page: pageParam, limit: 5 });
      return data as any;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: any) => {
      const p = lastPage?.pagination;
      return p && p.page < p.totalPages ? p.page + 1 : undefined;
    },
    enabled: !!vacancyId && isOwner,
    // ТЗ 14 — живой список кандидатов автообновляется по мере появления резидентов.
    refetchInterval: 45000,
    refetchOnWindowFocus: true,
  });

  // «Отклики» (owner only) — auto-refresh so accepted offers surface the archive prompt.
  const { data: responses = [] } = useQuery<any[]>({
    queryKey: ['vacancy-responses', vacancyId],
    refetchInterval: 45000,
    refetchOnWindowFocus: true,
    queryFn: async () => { const { data } = await vacancyAPI.getResponses(vacancyId!); return data as any[]; },
    enabled: !!vacancyId && isOwner,
  });

  const statusMut = useMutation({
    mutationFn: (status: string) => vacancyAPI.setStatus(vacancyId!, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacancy', vacancyId] });
      qc.invalidateQueries({ queryKey: ['vacancies', 'mine'] });
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось изменить статус вакансии')),
  });

  const removeMut = useMutation({
    mutationFn: () => vacancyAPI.remove(vacancyId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacancies', 'mine'] });
      toast.success('Черновик удалён');
      navigate(-1);
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось удалить черновик')),
  });

  const offerMut = useMutation({
    mutationFn: (candidateId: string) => vacancyAPI.offerCandidate(vacancyId!, candidateId),
    onSuccess: () => toast.success('Вакансия предложена кандидату'),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось предложить вакансию')),
  });

  const respondMut = useMutation({
    mutationFn: async () => {
      const links = respondLinks
        .filter(l => l.url.trim().length > 0)
        .map(l => ({ url: l.url.trim(), title: l.title.trim(), source: l.source }));
      const { data } = await vacancyAPI.respond(vacancyId!, {
        comment: respondComment.trim() || undefined,
        portfolioLinks: links,
        hasPortfolioFiles: respondFiles.length > 0,
      });
      const responseId = (data as any)?.id ?? (data as any)?.response?.id;
      if (responseId && respondFiles.length > 0) {
        const fd = new FormData();
        respondFiles.forEach(f => fd.append('files', f));
        await vacancyAPI.uploadPortfolio(vacancyId!, responseId, fd);
      }
    },
    onSuccess: () => {
      setShowRespond(false);
      setRespondComment('');
      setRespondFiles([]);
      setRespondLinks([]);
      qc.invalidateQueries({ queryKey: ['vacancy', vacancyId] });
      toast.success('Отклик отправлен');
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отправить отклик')),
  });

  const coopMut = useMutation({
    mutationFn: (responseId: string) => vacancyAPI.makeCooperation(vacancyId!, responseId, {
      startDate: coopStartDate,
      conditions: coopConditions.trim(),
      compensation: coopCompensation.trim(),
      extraDetails: coopExtra.trim() || undefined,
    }),
    onSuccess: () => {
      setCoopResponseId(null);
      setCoopStartDate('');
      setCoopConditions('');
      setCoopCompensation('');
      setCoopExtra('');
      qc.invalidateQueries({ queryKey: ['vacancy-responses', vacancyId] });
      toast.success('Предложение о сотрудничестве отправлено');
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отправить предложение')),
  });

  const offerActionMut = useMutation({
    mutationFn: ({ offerId, action }: { offerId: string; action: 'accept' | 'reject' }) =>
      action === 'accept' ? vacancyAPI.acceptOffer(offerId) : vacancyAPI.rejectOffer(offerId),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['vacancy', vacancyId] });
      toast.success(vars.action === 'accept' ? 'Предложение принято' : 'Предложение отклонено');
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось обработать предложение')),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!vacancy) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Вакансия не найдена</p>
      </div>
    );
  }

  const professionName = vacancy.profession?.name ?? null;
  const matchResults: any[] = matchesData?.pages.flatMap((pg: any) => pg.results ?? []) ?? [];
  const matchesEmpty = (matchesData?.pages?.[0] as any)?.fallbackLevel === 'empty';

  // Grouped custom filters (mirror OrderDetailPage)
  const customFilterValues: { filterName: string; values: string[] }[] = [];
  if (vacancy.selectedCustomFilterValues?.length) {
    const grouped: Record<string, { filterName: string; values: string[] }> = {};
    for (const v of vacancy.selectedCustomFilterValues) {
      const fId = v.filter?.id ?? v.filterId ?? 'unknown';
      if (!grouped[fId]) grouped[fId] = { filterName: v.filter?.name ?? '', values: [] };
      grouped[fId].values.push(v.value ?? v.name ?? '');
    }
    customFilterValues.push(...Object.values(grouped));
  }

  // Archive prompt: accepted cooperation offer + still active.
  const myResponse = vacancy.myResponse ?? null;
  const hasAcceptedOffer = Array.isArray(responses)
    && responses.some((r: any) => (r.offers || []).some((o: any) => o.status === 'accepted'));
  const showArchivePrompt = isOwner && hasAcceptedOffer && vacancy.status === 'active' && !archiveDismissed;

  // Applicant's pending cooperation offer (if any)
  const myPendingOffers: any[] = (myResponse?.offers || []).filter((o: any) => o.status === 'pending');

  const renderPortfolio = (files: any[] = [], links: any[] = []) => (
    <>
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file: any) => {
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
                    className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors">
                    <Link2 size={14} />{file.originalName}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
      {links.length > 0 && (
        <div className="space-y-1.5">
          {links.map((link: any) => (
            <a key={link.id} href={link.url} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors break-all">
              <Link2 size={14} className="flex-shrink-0" />{link.title || link.url}
            </a>
          ))}
        </div>
      )}
    </>
  );

  const renderOfferCard = (offer: any) => (
    <div key={offer.id} className="border border-primary-500/20 bg-primary-500/5 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-white">Предложение о сотрудничестве</p>
      <div className="space-y-1.5 text-sm text-slate-300">
        <p><span className="text-slate-500">Дата начала:</span> {offer.startDate ? new Date(offer.startDate).toLocaleDateString('ru-RU') : '—'}</p>
        {offer.conditions && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><span className="text-slate-500">Условия:</span> {offer.conditions}</p>}
        {offer.compensation && <p><span className="text-slate-500">Вознаграждение:</span> {offer.compensation}</p>}
        {offer.extraDetails && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><span className="text-slate-500">Детали:</span> {offer.extraDetails}</p>}
      </div>
      {offer.status === 'pending' ? (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => offerActionMut.mutate({ offerId: offer.id, action: 'reject' })}
            disabled={offerActionMut.isPending}
            className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <X size={14} />Отклонить
          </button>
          <button
            onClick={() => offerActionMut.mutate({ offerId: offer.id, action: 'accept' })}
            disabled={offerActionMut.isPending}
            className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {offerActionMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Принять
          </button>
        </div>
      ) : (
        <p className={`text-xs font-semibold ${offer.status === 'accepted' ? 'text-emerald-400' : 'text-slate-500'}`}>
          {offer.status === 'accepted' ? 'Принято' : 'Отклонено'}
        </p>
      )}
    </div>
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
            <Megaphone size={16} className="text-amber-400 flex-shrink-0" />
            <h1 className="text-base font-bold text-white truncate">{vacancy.title}</h1>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 space-y-4">
          {vacancy.status === 'archived' && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg border border-slate-700/60 bg-slate-800/40 text-slate-400 font-medium">
              <Archive size={12} />В архиве
            </span>
          )}

          {professionName && (
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">{professionName}</p>
          )}

          <h2 className="text-xl font-bold text-white leading-tight break-words [overflow-wrap:anywhere]">{vacancy.title}</h2>

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

          {/* Work format */}
          <div className="flex items-center gap-2">
            <Briefcase size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-sm text-slate-300">{workFormatLabel(vacancy.workFormat)}</span>
          </div>

          {/* Geography */}
          <div className="flex items-center gap-2">
            <MapPin size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-sm text-slate-300">{geographyLabel(vacancy.geography)}</span>
          </div>

          {/* Employment type */}
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-sm text-slate-300">{employmentLabel(vacancy.employmentType)}</span>
          </div>

          {/* Payment */}
          <div className="flex items-center gap-2">
            <DollarSign size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-base font-bold text-amber-400">{formatPayment(vacancy.paymentType, vacancy.compensation)}</span>
          </div>

          {/* Description */}
          {vacancy.description && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Описание</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{vacancy.description}</p>
            </div>
          )}

          {/* References — files */}
          {vacancy.referenceFiles?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Материалы</p>
              <div className="space-y-2">
                {vacancy.referenceFiles.map((file: any) => {
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
                          className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors">
                          <Link2 size={14} />{file.originalName}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* References — links */}
          {vacancy.referenceLinks?.length > 0 && (
            <div>
              {!vacancy.referenceFiles?.length && (
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Материалы</p>
              )}
              <div className="space-y-1.5">
                {vacancy.referenceLinks.map((link: any) => (
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
            {/* Status actions (ТЗ 13 — «Редактировать» на всех вкладках) */}
            {vacancy.status === 'active' && (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-2xl transition-colors disabled:opacity-50"
                >
                  <Pencil size={15} />
                  Редактировать
                </button>
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

            {vacancy.status === 'draft' && (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-2xl transition-colors disabled:opacity-50"
                >
                  <Pencil size={15} />
                  Редактировать
                </button>
                <button
                  onClick={() => statusMut.mutate('active')}
                  disabled={statusMut.isPending}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-2xl transition-colors disabled:opacity-50"
                >
                  {statusMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Опубликовать
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={removeMut.isPending}
                  className="flex-shrink-0 px-3 py-3 flex items-center justify-center text-slate-500 hover:text-red-400 border border-slate-700 hover:border-red-500/40 rounded-2xl transition-colors disabled:opacity-50"
                  title="Удалить черновик"
                >
                  {removeMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              </div>
            )}

            {vacancy.status === 'archived' && (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-2xl transition-colors disabled:opacity-50"
                >
                  <Pencil size={15} />
                  Редактировать
                </button>
                <button
                  onClick={() => statusMut.mutate('active')}
                  disabled={statusMut.isPending}
                  className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-2xl transition-colors disabled:opacity-50"
                >
                  {statusMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Опубликовать
                </button>
              </div>
            )}

            {/* Matches */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-primary-400" />
                <h3 className="text-sm font-bold text-white">Подходящие кандидаты</h3>
              </div>

              {matchesEmpty ? (
                <div className="text-center py-4 space-y-3">
                  <Sparkles size={28} className="text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">Вакансия уже видна всей платформе</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Пока нет точных совпадений по профессии и фильтрам, но ваша вакансия опубликована в Потоке — её увидят подходящие специалисты и смогут откликнуться.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => navigate('/')}
                      className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
                      Посмотреть вакансию в Потоке
                    </button>
                    <button onClick={() => navigate('/invite')}
                      className="inline-flex items-center justify-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                      <Share2 size={12} />Пригласить специалиста по ссылке
                    </button>
                  </div>
                </div>
              ) : matchResults.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Загрузка подходящих кандидатов...</p>
              ) : (
                <div className="space-y-2">
                  {matchResults.map((m: any) => {
                    const u = m.user ?? m;
                    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
                    const professions: string[] = m.professions
                      ? m.professions.map((p: any) => (typeof p === 'string' ? p : p?.name)).filter(Boolean)
                      : (u.userProfessions?.map((up: any) => up?.profession?.name).filter(Boolean) ?? []);
                    const status = m.occupancyStatus ?? u.occupancyStatus ?? '';
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
                            <span className={`inline-flex items-center mt-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${occupancyBadgeClass(status)}`}>
                              {occupancyLabel(status)}
                            </span>
                          </div>
                        </button>
                        <button
                          onClick={() => offerMut.mutate(u.id)}
                          disabled={offerMut.isPending}
                          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          Предложить вакансию
                        </button>
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
                    const u = r.applicant ?? {};
                    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
                    const offers: any[] = r.offers || [];
                    return (
                      <div key={r.id} className="p-3 rounded-xl bg-slate-800/40 border border-slate-800/60 space-y-2">
                        <button onClick={() => navigate(`/profile/${u.id}`)} className="flex items-center gap-2.5 w-full min-w-0 text-left">
                          <AvatarComponent src={u.avatar} name={name} size={36} />
                          <p className="text-sm font-semibold text-white truncate">{name}</p>
                        </button>
                        {r.comment && (
                          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{r.comment}</p>
                        )}
                        {(r.portfolioFiles?.length > 0 || r.portfolioLinks?.length > 0) && (
                          <div className="pt-1">
                            {renderPortfolio(r.portfolioFiles, r.portfolioLinks)}
                          </div>
                        )}
                        {offers.length > 0 && (
                          <div className="space-y-1">
                            {offers.map((o: any) => (
                              <p key={o.id} className={`text-xs font-medium ${
                                o.status === 'accepted' ? 'text-emerald-400' :
                                o.status === 'rejected' ? 'text-slate-500' : 'text-amber-400'
                              }`}>
                                Предложение: {o.status === 'accepted' ? 'принято' : o.status === 'rejected' ? 'отклонено' : 'ожидает ответа'}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/messages/${u.id}`)}
                            className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                          >
                            <MessageCircle size={13} />Написать
                          </button>
                          <button
                            onClick={() => { setCoopResponseId(r.id); setCoopStartDate(''); setCoopConditions(''); setCoopCompensation(''); setCoopExtra(''); }}
                            className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors"
                          >
                            <HandshakeIcon size={13} />Выбрать кандидата
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── APPLICANT (non-owner) ── */
          <div className="space-y-2">
            {/* Write before responding (ТЗ 11) */}
            {vacancy.authorId && (
              <button
                onClick={() => navigate(`/messages/${vacancy.authorId}`)}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-2xl transition-colors"
              >
                <MessageCircle size={16} />Написать
              </button>
            )}

            {/* Pending cooperation offers on my response */}
            {myPendingOffers.length > 0 && (
              <div className="space-y-2">
                {myPendingOffers.map((o: any) => renderOfferCard(o))}
              </div>
            )}

            {myResponse ? (
              /* Already responded — show my response */
              <div className="border border-slate-800/60 bg-slate-900/60 rounded-2xl p-4 space-y-2">
                <p className="text-sm font-semibold text-white">Ваш отклик отправлен</p>
                {myResponse.comment && (
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{myResponse.comment}</p>
                )}
                {(myResponse.portfolioFiles?.length > 0 || myResponse.portfolioLinks?.length > 0) && (
                  <div className="pt-1">{renderPortfolio(myResponse.portfolioFiles, myResponse.portfolioLinks)}</div>
                )}
              </div>
            ) : showRespond ? (
              <div className="space-y-3 border border-primary-500/20 bg-primary-500/5 rounded-2xl p-4">
                <p className="text-sm font-semibold text-white">Откликнуться на вакансию</p>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">
                    Комментарий {vacancy.requireComment ? <span className="text-rose-400">*</span> : '(необязательно)'}
                  </label>
                  <textarea
                    value={respondComment}
                    onChange={e => setRespondComment(e.target.value)}
                    placeholder="Расскажите о себе и почему вы подходите..."
                    rows={3}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  />
                </div>

                {/* Portfolio files */}
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">
                    Портфолио {vacancy.requirePortfolio ? <span className="text-rose-400">*</span> : '(необязательно)'}
                  </label>
                  <input
                    type="file"
                    multiple
                    onChange={e => setRespondFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
                    className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
                  />
                  {respondFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {respondFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs text-slate-400">
                          <span className="truncate">{f.name}</span>
                          <button type="button" onClick={() => setRespondFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-400 flex-shrink-0">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Portfolio links */}
                <div className="space-y-2">
                  {respondLinks.map((link, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="url"
                        value={link.url}
                        onChange={e => setRespondLinks(prev => prev.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                        placeholder="Ссылка на работу"
                        className="flex-1 min-w-0 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <button type="button" onClick={() => setRespondLinks(prev => prev.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-400 flex-shrink-0">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRespondLinks(prev => [...prev, { url: '', title: '', source: 'other' }])}
                    className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    + Добавить ссылку
                  </button>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setShowRespond(false)} className="flex-1 py-2 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
                  <button
                    onClick={() => {
                      if (vacancy.requireComment && !respondComment.trim()) { toast.error('Комментарий обязателен для отклика'); return; }
                      const hasPortfolio = respondFiles.length > 0 || respondLinks.some(l => l.url.trim().length > 0);
                      if (vacancy.requirePortfolio && !hasPortfolio) { toast.error('Портфолио обязательно для отклика'); return; }
                      respondMut.mutate();
                    }}
                    disabled={respondMut.isPending}
                    className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {respondMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    Отправить отклик
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowRespond(true)}
                className="w-full py-3.5 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white rounded-2xl transition-colors"
              >
                <Send size={16} />Откликнуться
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cooperation offer modal (owner) */}
      {coopResponseId && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={() => setCoopResponseId(null)} />
          <div className="fixed inset-x-4 bottom-8 z-[81] max-w-sm mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-3 max-h-[80vh] overflow-y-auto">
            <p className="text-sm font-bold text-white">Предложение о сотрудничестве</p>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Дата начала <span className="text-rose-400">*</span></label>
              <input
                type="date"
                value={coopStartDate}
                onChange={e => setCoopStartDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Описание условий <span className="text-rose-400">*</span></label>
              <textarea
                value={coopConditions}
                onChange={e => setCoopConditions(e.target.value)}
                rows={3}
                placeholder="Опишите условия сотрудничества..."
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Вознаграждение <span className="text-rose-400">*</span></label>
              <input
                type="text"
                value={coopCompensation}
                onChange={e => setCoopCompensation(e.target.value)}
                placeholder="Например: 50 000 ₽ / месяц"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Дополнительные детали</label>
              <textarea
                value={coopExtra}
                onChange={e => setCoopExtra(e.target.value)}
                rows={2}
                placeholder="Необязательно"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setCoopResponseId(null)} className="flex-1 py-2.5 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
              <button
                onClick={() => {
                  if (!coopStartDate) { toast.error('Укажите дату начала'); return; }
                  if (!coopConditions.trim()) { toast.error('Опишите условия'); return; }
                  if (!coopCompensation.trim()) { toast.error('Укажите вознаграждение'); return; }
                  coopMut.mutate(coopResponseId);
                }}
                disabled={coopMut.isPending}
                className="flex-1 py-2.5 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                {coopMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <HandshakeIcon size={14} />}
                Отправить
              </button>
            </div>
          </div>
        </>
      )}

      {/* Archive prompt after accepted offer */}
      <ConfirmDialog
        open={showArchivePrompt}
        message="По вакансии принято предложение о сотрудничестве. Архивировать вакансию?"
        confirmLabel="Архивировать"
        onConfirm={() => statusMut.mutate('archived')}
        onCancel={() => setArchiveDismissed(true)}
      />

      <ConfirmDialog
        open={confirmDelete}
        message="Удалить черновик вакансии безвозвратно?"
        confirmLabel="Удалить"
        onConfirm={() => removeMut.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      {isOwner && editing && (
        <VacancyForm
          vacancy={vacancy}
          artistId={vacancy.artistId}
          onClose={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: ['vacancy', vacancyId] });
          }}
        />
      )}
    </div>
  );
}
