import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Edit3, Trash2, Loader2, Calendar, Check, X, Heart, ListMusic, Lock } from 'lucide-react';
import { releaseAPI, clipAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import AvatarComponent from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import MediaItemForm, { MediaItemInitial } from '../components/MediaItemForm';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import { MEDIA_PLATFORM_LABELS } from '../lib/mediaPlatforms';
import { ymGenreLabel, RELEASE_TYPE_LABELS } from '../lib/ymGenres';
import { safeHref, formatReleaseDate } from '../lib/artistUtils';
import { personName, personHref } from '../lib/publicPerson';
import { openAuthGate } from '../components/AuthGateModal';
import { useSeo, seoTitle, seoDescription, robotsFor } from '../lib/seo';
import { trackGuestView } from '../lib/metrika';

interface ItemDetail extends MediaItemInitial {
  artistId: string;
  artist?: { id: string; name: string; avatar?: string | null; status?: string } | null;
  indexable?: boolean;
  createdAt?: string;
  viewerIsAdmin?: boolean;
  // Гостю — только участники с согласием на публичность + число остальных.
  hiddenParticipantsCount?: number;
  // Метаданные с Яндекс.Музыки (есть только у импортированных релизов):
  releaseType?: string | null;
  label?: string | null;
  genre?: string | null;
  trackCount?: number | null;
  likesCount?: number | null;
  tracklist?: { id: string; title: string; durationMs: number | null; artists: string[] }[] | null;
  participants?: {
    id: string;
    userId: string;
    confirmStatus: string;
    // Гостю обезличенный участник приходит без id/имени (toPublicPerson) —
    // рендер идёт через personName/personHref, которые это учитывают.
    user: { id: string; firstName: string; lastName: string; avatar?: string | null };
    roles: { id: string; name: string }[];
  }[];
}

export default function MediaItemPage({ kind }: { kind: 'release' | 'clip' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const isRelease = kind === 'release';
  const api = isRelease ? releaseAPI : clipAPI;

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: item, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [kind, id],
    queryFn: async () => {
      const { data } = await api.get(id!);
      return data as ItemDetail;
    },
    enabled: !!id,
    // 404 — ответ окончательный, повторять незачем.
    retry: (count, e: any) => e?.response?.status !== 404 && count < 1,
  });

  useEffect(() => { if (id) trackGuestView(kind, id); }, [kind, id]);
  const artistName = item?.artist?.name ?? null;
  const typeLabel = isRelease
    ? (item?.releaseType ? (RELEASE_TYPE_LABELS[item.releaseType] ?? 'релиз') : 'релиз').toLowerCase()
    : 'клип';
  useSeo({
    title: item ? seoTitle(item.title, artistName, typeLabel) : seoTitle(isRelease ? 'Релиз' : 'Клип'),
    description: item
      ? seoDescription(`${item.title}${artistName ? ` — ${artistName}` : ''}: ${typeLabel}${isRelease && item.releaseDate ? `, ${formatReleaseDate(item.releaseDate)}` : ''}. Участники и ссылки на площадки на Moooza.`)
      : null,
    canonical: `/${isRelease ? 'releases' : 'clips'}/${id}`,
    robots: robotsFor(item),
  });

  const removeMut = useMutation({
    mutationFn: () => api.remove(id!),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: [kind, id] });
      if (item?.artistId) {
        const listKey = [`${kind}s`, 'artist', item.artistId];
        // Сразу убрать плитку из кэша + обновить и неактивные запросы.
        queryClient.setQueryData(listKey, (old: any) =>
          Array.isArray(old) ? old.filter((it: any) => it.id !== id) : old);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: listKey, refetchType: 'all' }),
          queryClient.invalidateQueries({ queryKey: ['artist', item.artistId], refetchType: 'all' }),
        ]).catch(() => {});
        navigate(`/artist/${item.artistId}`);
      } else {
        navigate(-1);
      }
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось удалить')),
  });

  // Своё участие (кредиты): подтверждение/отказ. Обновляем карточку и входящие
  // «Запросы» (там тоже висят ожидающие участия).
  const invalidateParticipation = () => {
    queryClient.invalidateQueries({ queryKey: [kind, id] });
    queryClient.invalidateQueries({ queryKey: ['req-media'] }); // RequestsSection
  };
  const confirmMut = useMutation({
    mutationFn: (participantId: string) => api.confirmParticipant(participantId),
    onSuccess: invalidateParticipation,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось подтвердить участие')),
  });
  const declineMut = useMutation({
    mutationFn: (participantId: string) => api.declineParticipant(participantId),
    onSuccess: invalidateParticipation,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отклонить участие')),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (isError || !item) {
    // «Не найден» — только на настоящий 404; сеть/500 — «не удалось загрузить» + повтор.
    const notFound = !isError || (error as any)?.response?.status === 404;
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-slate-400 text-center">
          {notFound
            ? (isRelease ? 'Релиз не найден' : 'Клип не найден')
            : getApiError(error, isRelease ? 'Не удалось загрузить релиз' : 'Не удалось загрузить клип')}
        </p>
        <div className="flex items-center gap-4">
          {!notFound && (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-primary-400 text-sm disabled:opacity-50"
            >
              {isFetching ? 'Загрузка…' : 'Повторить'}
            </button>
          )}
          <button onClick={() => navigate(-1)} className="text-slate-400 text-sm">Назад</button>
        </div>
      </div>
    );
  }

  const viewerIsAdmin = !!item.viewerIsAdmin;
  const platformLabel = MEDIA_PLATFORM_LABELS[item.platform] ?? item.platform;
  // Сервер отдаёт приглашённому его собственное PENDING-участие (остальным
  // посетителям — только подтверждённые), поэтому блок «Подтвердите участие» живой.
  const participants = item.participants ?? [];
  const myPending = currentUser
    ? participants.find((p) => p.userId === currentUser.id && p.confirmStatus === 'PENDING')
    : null;
  const hiddenParticipants = item.hiddenParticipantsCount ?? 0;
  const openHref = safeHref(item.url);

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      {/* Top bar */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 sticky top-0 z-20 bg-slate-950/90 backdrop-blur"
        style={{ paddingTop: 'max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.75rem))' }}
      >
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-white" aria-label="Назад">
          <ArrowLeft size={20} />
        </button>
        <span className="text-base font-semibold text-white flex-1 min-w-0 truncate">
          {isRelease ? 'Релиз' : 'Клип'}
        </span>
        {viewerIsAdmin && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="p-2 text-slate-400 hover:text-primary-400 transition-colors"
              title="Редактировать"
            >
              <Edit3 size={18} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2 text-slate-400 hover:text-red-400 transition-colors"
              title="Удалить"
            >
              <Trash2 size={18} />
            </button>
          </>
        )}
      </div>

      <div className="px-4 pt-5 lg:max-w-2xl lg:mx-auto">
        {/* Cover */}
        <div className="w-full max-w-xs mx-auto aspect-square rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
          {item.coverUrl ? (
            <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-slate-600 text-5xl font-bold">{item.title?.[0]?.toUpperCase()}</span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white text-center mb-1 break-words [overflow-wrap:anywhere]">{item.title}</h1>
        {item.artist?.name && (
          <p className="text-center text-sm mb-1">
            <Link to={`/artist/${item.artist.id ?? item.artistId}`} className="text-primary-300 hover:text-primary-200 transition-colors">{item.artist.name}</Link>
          </p>
        )}

        {/* Release date */}
        {isRelease && item.releaseDate && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-slate-400 mb-1">
            <Calendar size={13} />
            {formatReleaseDate(item.releaseDate)}
          </p>
        )}

        {/* Platform */}
        <p className="text-center text-xs text-slate-500 mb-2">{platformLabel}</p>

        {/* Бейджи метаданных ЯМ: тип, жанр, лейбл, лайки */}
        {(item.releaseType || item.genre || item.label || (item.likesCount ?? 0) > 0) && (
          <div className="flex items-center justify-center gap-1.5 flex-wrap mb-4">
            {item.releaseType && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-500/15 text-primary-300 border border-primary-500/25">
                {RELEASE_TYPE_LABELS[item.releaseType] ?? item.releaseType}
              </span>
            )}
            {item.genre && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                {ymGenreLabel(item.genre)}
              </span>
            )}
            {item.label && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                {item.label}
              </span>
            )}
            {(item.likesCount ?? 0) > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20">
                <Heart size={10} className="fill-current" /> {item.likesCount}
              </span>
            )}
          </div>
        )}

        {/* Встроенный плеер Яндекс.Музыки — официальный embed-виджет, треки
            играют с серверов Яндекса, у нас ничего не хранится. */}
        {isRelease && item.platform === 'YANDEX_MUSIC' && (() => {
          const albumId = /\/album\/(\d+)/.exec(item.url ?? '')?.[1];
          if (!albumId) return null;
          return (
            <div className="w-full max-w-md mx-auto mb-4 rounded-2xl overflow-hidden border border-slate-800">
              {/* theme=rzt — недокументированная тёмная тема виджета (единственная
                  кроме дефолтной light); без неё трек-лист — белая простыня. */}
              <iframe
                src={`https://music.yandex.ru/iframe/album/${albumId}?theme=rzt`}
                className="w-full block h-[min(400px,60vh)]"
                frameBorder="0"
                allow="clipboard-write"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                title="Плеер Яндекс.Музыки"
              />
            </div>
          );
        })()}

        {/* Клипы Яндекс.Музыки НЕ встраиваем: frontend.vh.yandex.ru отдаёт
            CSP frame-ancestors только для яндексовских доменов — iframe на
            стороннем сайте блокируется браузером. Открываем по кнопке ниже. */}

        {/* Open on platform */}
        {openHref && (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full max-w-xs mx-auto py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors mb-6"
          >
            <ExternalLink size={15} />
            Открыть на {platformLabel}
          </a>
        )}

        {/* Треклист (метаданные ЯМ; сами треки играют на платформе) */}
        {isRelease && (item.tracklist?.length ?? 0) > 0 && (
          <div className="w-full max-w-md mx-auto mb-6 bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
              <ListMusic size={14} className="text-primary-400" />
              <span className="text-sm font-semibold text-white">Треки</span>
              <span className="text-xs text-slate-500">{item.tracklist!.length}</span>
            </div>
            <div className="px-2 py-1.5">
              {item.tracklist!.map((t, i) => (
                <div key={t.id || i} className="flex items-center gap-3 px-2 py-1.5">
                  <span className="w-5 text-right text-xs text-slate-500 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{t.title}</p>
                    {t.artists.length > 1 && (
                      <p className="text-[11px] text-slate-500 truncate">{t.artists.join(', ')}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    {t.durationMs
                      ? (() => {
                          const s = Math.round(t.durationMs / 1000);
                          return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
                        })()
                      : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending participant actions (for me) */}
        {myPending && (
          <div className="mb-6 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <p className="text-xs text-amber-300 mb-2">
              Вас отметили участником. Подтвердите своё участие.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => confirmMut.mutate(myPending.id)}
                disabled={confirmMut.isPending || declineMut.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
              >
                {confirmMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
                Подтвердить
              </button>
              <button
                onClick={() => declineMut.mutate(myPending.id)}
                disabled={confirmMut.isPending || declineMut.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold disabled:opacity-50"
              >
                {declineMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <X size={14} />}
                Отклонить
              </button>
            </div>
          </div>
        )}

        {/* Participants */}
        {(participants.length > 0 || hiddenParticipants > 0) && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Участники</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <div className="space-y-2">
              {participants.map((p) => {
                const name = personName(p.user, { surnameFirst: true });
                const href = personHref(p.user);
                const roleList = p.roles ?? [];
                const rowCls = 'flex items-center gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800';
                const body = (
                  <>
                    <AvatarComponent src={p.user.avatar} name={name} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{name}</p>
                      {roleList.length ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {roleList.map((r, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] leading-tight">
                              {r.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">—</p>
                      )}
                    </div>
                    {p.confirmStatus === 'PENDING' && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded-md flex-shrink-0">
                        ожидает
                      </span>
                    )}
                  </>
                );
                // <Link> вместо onClick-navigate: ссылка видна краулеру; обезличенному — без ссылки.
                return href
                  ? <Link key={p.id} to={href} className={`${rowCls} hover:border-slate-700 transition-colors`}>{body}</Link>
                  : <div key={p.id} className={rowCls}>{body}</div>;
              })}
              {hiddenParticipants > 0 && (
                <button
                  onClick={() => openAuthGate('page', { type: `${kind}_participants` }, 'Все участники видны после входа')}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  <Lock size={12} />
                  {participants.length > 0 ? 'и ещё' : 'Участников:'} {hiddenParticipants} — после входа
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <MediaItemForm
          kind={kind}
          artistId={item.artistId}
          initial={item}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={confirmDelete}
        message={isRelease ? `Удалить релиз «${item.title}»?` : `Удалить клип «${item.title}»?`}
        confirmLabel="Удалить"
        onConfirm={() => removeMut.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
