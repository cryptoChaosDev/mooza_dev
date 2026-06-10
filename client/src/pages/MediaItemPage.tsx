import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Edit3, Trash2, Loader2, Calendar, Check, X } from 'lucide-react';
import { releaseAPI, clipAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import AvatarComponent from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import MediaItemForm, { MediaItemInitial } from '../components/MediaItemForm';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';

const RELEASE_PLATFORM_LABELS: Record<string, string> = {
  VK: 'ВКонтакте',
  SPOTIFY: 'Spotify',
  YANDEX_MUSIC: 'Яндекс Музыка',
  APPLE_MUSIC: 'Apple Music',
};
const CLIP_PLATFORM_LABELS: Record<string, string> = {
  VK_VIDEO: 'ВКонтакте Видео',
  RUTUBE: 'Rutube',
  YOUTUBE: 'YouTube',
};

interface ItemDetail extends MediaItemInitial {
  artistId: string;
  createdAt?: string;
  viewerIsAdmin?: boolean;
  participants?: {
    id: string;
    userId: string;
    confirmStatus: string;
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
  const platformLabels = isRelease ? RELEASE_PLATFORM_LABELS : CLIP_PLATFORM_LABELS;

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: item, isLoading, isError } = useQuery({
    queryKey: [kind, id],
    queryFn: async () => {
      const { data } = await api.get(id!);
      return data as ItemDetail;
    },
    enabled: !!id,
  });

  const removeMut = useMutation({
    mutationFn: () => api.remove(id!),
    onSuccess: () => {
      if (item?.artistId) {
        queryClient.invalidateQueries({ queryKey: [`${kind}s`, 'artist', item.artistId] });
        navigate(`/artist/${item.artistId}`);
      } else {
        navigate(-1);
      }
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось удалить')),
  });

  const confirmMut = useMutation({
    mutationFn: (participantId: string) => api.confirmParticipant(participantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [kind, id] }),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось подтвердить участие')),
  });
  const declineMut = useMutation({
    mutationFn: (participantId: string) => api.declineParticipant(participantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [kind, id] }),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отклонить участие')),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-slate-400">{isRelease ? 'Релиз не найден' : 'Клип не найден'}</p>
        <button onClick={() => navigate(-1)} className="text-primary-400 text-sm">Назад</button>
      </div>
    );
  }

  const viewerIsAdmin = !!item.viewerIsAdmin;
  const platformLabel = platformLabels[item.platform] ?? item.platform;
  const participants = item.participants ?? [];
  const myPending = currentUser
    ? participants.find((p) => p.userId === currentUser.id && p.confirmStatus === 'PENDING')
    : null;

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 sticky top-0 z-20 bg-slate-950/90 backdrop-blur">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <span className="text-base font-semibold text-white flex-1 truncate">
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

      <div className="px-4 pt-5">
        {/* Cover */}
        <div className="w-full max-w-xs mx-auto aspect-square rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
          {item.coverUrl ? (
            <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-slate-600 text-5xl font-bold">{item.title?.[0]?.toUpperCase()}</span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white text-center mb-1">{item.title}</h1>

        {/* Release date */}
        {isRelease && item.releaseDate && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-slate-400 mb-1">
            <Calendar size={13} />
            {new Date(item.releaseDate).toLocaleDateString('ru-RU')}
          </p>
        )}

        {/* Platform */}
        <p className="text-center text-xs text-slate-500 mb-4">{platformLabel}</p>

        {/* Open on platform */}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full max-w-xs mx-auto py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors mb-6"
          >
            <ExternalLink size={15} />
            Открыть на {platformLabel}
          </a>
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
        {participants.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Участники</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <div className="space-y-2">
              {participants.map((p) => {
                const name = `${p.user.lastName ?? ''} ${p.user.firstName ?? ''}`.trim();
                const roleList = p.roles ?? [];
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors"
                    onClick={() => navigate(`/profile/${p.user.id}`)}
                  >
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
                  </div>
                );
              })}
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
