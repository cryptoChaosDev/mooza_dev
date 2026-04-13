import { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, Music, ExternalLink, Users,
  Camera, Navigation,
} from 'lucide-react';
import { artistAPI } from '../lib/api';
import { avatarUrl } from '../lib/avatar';
import { SocialIconRow } from '../components/SocialLinks';
import ShareButton from '../components/ShareButton';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const TYPE_LABELS: Record<string, string> = {
  SOLO: 'Соло артист',
  GROUP: 'Группа',
  COVER_GROUP: 'Кавер группа',
};

function resolveUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_URL}${path}`;
}

export default function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const { data: artist, isLoading, isError } = useQuery({
    queryKey: ['artist', id],
    queryFn: async () => {
      const { data } = await artistAPI.getArtist(id!);
      return data;
    },
    enabled: !!id,
  });

  const followMut = useMutation({
    mutationFn: () => artistAPI.follow(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const unfollowMut = useMutation({
    mutationFn: () => artistAPI.unfollow(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const uploadAvatarMut = useMutation({
    mutationFn: (file: File) => artistAPI.uploadAvatar(id!, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const uploadBannerMut = useMutation({
    mutationFn: (file: File) => artistAPI.uploadBanner(id!, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (isError || !artist) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-slate-400">Артист не найден</p>
        <button onClick={() => navigate(-1)} className="text-primary-400 text-sm">Назад</button>
      </div>
    );
  }

  const isMemberOfArtist = artist.members?.some((m: { id: string }) => m.id === currentUser?.id);
  const hasSocialLinks =
    artist.socialLinks && Object.values(artist.socialLinks as Record<string, string>).some(Boolean);

  const bannerSrc = resolveUrl(artist.banner);
  const avatarSrc = avatarUrl(artist.avatar);

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      {/* ── Header banner ── */}
      <div className="relative w-full h-48 bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
        {bannerSrc && (
          <img src={bannerSrc} alt="banner" className="w-full h-full object-cover" />
        )}

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-white" />
        </button>

        {/* Top-right actions */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <ShareButton url={`/artist/${id}`} title={artist?.name} />
          {currentUser && (
            <button
              onClick={() => {
                if (artist.isFollowed) {
                  unfollowMut.mutate();
                } else {
                  followMut.mutate();
                }
              }}
              disabled={followMut.isPending || unfollowMut.isPending}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                artist.isFollowed
                  ? 'bg-slate-700/80 text-slate-200 border border-slate-600'
                  : 'bg-primary-600 text-white'
              }`}
            >
              {artist.isFollowed ? 'Отписаться' : 'Подписаться'}
            </button>
          )}
        </div>

        {/* Banner camera button */}
        {isMemberOfArtist && (
          <>
            <button
              onClick={() => bannerInputRef.current?.click()}
              className="absolute bottom-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center"
            >
              <Camera size={15} className="text-white" />
            </button>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadBannerMut.mutate(file);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>

      {/* ── Avatar ── */}
      <div className="relative px-4 -mt-14 mb-4 flex items-end">
        <div className="relative flex-shrink-0">
          <div className="w-28 h-28 rounded-full border-4 border-slate-950 overflow-hidden bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shadow-xl">
            {avatarSrc ? (
              <img src={avatarSrc} alt={artist.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-3xl">
                {artist.name?.[0]?.toUpperCase()}
              </span>
            )}
          </div>
          {isMemberOfArtist && (
            <>
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center shadow"
              >
                <Camera size={13} className="text-white" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadAvatarMut.mutate(file);
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 space-y-4">

        {/* 1. Name + type badge */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-white leading-tight">{artist.name}</h1>
            {artist.type && TYPE_LABELS[artist.type] && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-300 border border-primary-500/30">
                {TYPE_LABELS[artist.type]}
              </span>
            )}
          </div>
        </div>

        {/* 2. City */}
        {artist.city && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <MapPin size={14} className="flex-shrink-0" />
            <span>{artist.city}</span>
          </div>
        )}

        {/* 3. Genres */}
        {(artist.genres?.length ?? 0) > 0 && (
          <div className="flex items-start gap-2">
            <Music size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
            <div className="flex flex-wrap gap-1.5">
              {artist.genres.map((g: { id: string; name: string }) => (
                <span
                  key={g.id}
                  className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300 border border-slate-700"
                >
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 4. Tour readiness */}
        {artist.tourReady && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Navigation size={14} className="flex-shrink-0" />
            <span>{artist.tourReady}</span>
          </div>
        )}

        {/* 5. Description */}
        {artist.description && (
          <p className="text-slate-300 text-sm leading-relaxed border-l-2 border-primary-500/40 pl-3">
            {artist.description}
          </p>
        )}

        {/* 6. Stats */}
        <div className="flex rounded-2xl border border-slate-800/60 bg-slate-900/50 overflow-hidden divide-x divide-slate-800/60">
          <div className="flex-1 py-3 text-center">
            <div className="text-lg font-bold text-white">{artist.followersCount ?? 0}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Подписчики</div>
          </div>
          <div className="flex-1 py-3 text-center">
            <div className="text-lg font-bold text-white">{artist.members?.length ?? 0}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Участники</div>
          </div>
          <div className="flex-1 py-3 text-center">
            <div className="text-lg font-bold text-white">{artist.listeners ?? 0}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Слушатели</div>
          </div>
        </div>

        {/* 7. BandLink */}
        {artist.bandLink && (
          <a
            href={artist.bandLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-primary-400 text-sm hover:underline"
          >
            <ExternalLink size={14} className="flex-shrink-0" />
            <span className="truncate">{artist.bandLink}</span>
          </a>
        )}

        {/* 8. Social links */}
        {hasSocialLinks && (
          <div>
            <SocialIconRow links={(artist.socialLinks as Record<string, string>) || {}} labeled />
          </div>
        )}

        {/* 9. Members */}
        {(artist.members?.length ?? 0) > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Участники</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {artist.members.map((m: { id: string; firstName: string; lastName: string; avatar: string | null; nickname: string | null }) => (
                <button
                  key={m.id}
                  onClick={() => navigate(`/profile/${m.id}`)}
                  className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16"
                >
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
                    {m.avatar ? (
                      <img src={avatarUrl(m.avatar)!} className="w-full h-full object-cover" alt={m.firstName} />
                    ) : (
                      <span className="text-white font-bold text-sm">
                        {m.firstName?.[0]}{m.lastName?.[0]}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 truncate w-full text-center">{m.firstName}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
