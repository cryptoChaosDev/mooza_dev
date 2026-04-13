import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, Briefcase, Music, MessageCircle, Loader2,
  Radio, Crown, BadgeCheck, Ban, X,
  Headphones, Film, Image, FileText,
} from 'lucide-react';
import { userAPI, channelAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { SocialIconRow } from '../components/SocialLinks';
import ShareButton from '../components/ShareButton';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lightboxFile, setLightboxFile] = useState<any>(null);

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const { data } = await userAPI.getUser(userId!);
      return data;
    },
    enabled: !!userId,
  });

  const channelId = user?.channel?.id;
  const { data: channelInfo, refetch: refetchChannel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: async () => {
      const { data } = await channelAPI.getChannel(channelId!);
      return data as { id: string; name: string; description: string | null; avatar: string | null; isSubscribed: boolean; _count: { subscriptions: number; posts: number } };
    },
    enabled: !!channelId,
  });

  const subscribeMut = useMutation({
    mutationFn: () => channelAPI.subscribe(channelId!),
    onSuccess: () => { refetchChannel(); queryClient.invalidateQueries({ queryKey: ['channel-feed-subscribed'] }); },
  });
  const unsubscribeMut = useMutation({
    mutationFn: () => channelAPI.unsubscribe(channelId!),
    onSuccess: () => { refetchChannel(); queryClient.invalidateQueries({ queryKey: ['channel-feed-subscribed'] }); },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent mx-auto shadow-lg shadow-primary-500/30" />
          <p className="text-slate-400 mt-3 text-sm">Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 gap-3">
        <Loader2 size={32} className="text-slate-600" />
        <p className="text-slate-400 text-sm">Пользователь не найден</p>
        <button onClick={() => navigate(-1)} className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-xl transition-all text-sm">Назад</button>
      </div>
    );
  }

  // Derived data
  const servicesByField = (user.userServices ?? []).reduce((acc: any, us: any) => {
    const fId = us.profession?.direction?.fieldOfActivity?.id || 'unknown';
    const fName = us.profession?.direction?.fieldOfActivity?.name || '';
    const pId = us.professionId;
    const pName = us.profession?.name || '';
    if (!acc[fId]) acc[fId] = { fieldName: fName, byProfession: {} };
    if (!acc[fId].byProfession[pId]) acc[fId].byProfession[pId] = { profName: pName, services: [] };
    acc[fId].byProfession[pId].services.push(us);
    return acc;
  }, {});

  const servicesFlat = (Object.values(servicesByField) as any[]).flatMap(({ fieldName, byProfession }) =>
    (Object.values(byProfession) as any[]).flatMap(({ profName, services }) =>
      services.map((us: any) => ({ ...us, _profName: profName, _fieldName: fieldName }))
    )
  );

  const professionNames = (() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const us of user.userServices ?? []) {
      const name = us.profession?.name;
      if (name && !seen.has(name)) { seen.add(name); names.push(name); }
    }
    return names;
  })();

  const portfolioFiles: any[] = user.portfolioFiles ?? [];
  const photoFiles = portfolioFiles.filter((f: any) => f.mimeType?.startsWith('image/'));
  const audioFiles = portfolioFiles.filter((f: any) => f.mimeType?.startsWith('audio/'));
  const videoFiles = portfolioFiles.filter((f: any) => f.mimeType?.startsWith('video/'));
  const otherFiles = portfolioFiles.filter((f: any) =>
    !f.mimeType?.startsWith('image/') && !f.mimeType?.startsWith('audio/') && !f.mimeType?.startsWith('video/')
  );

  const friendCount = (user._count?.sentRequests ?? 0) + (user._count?.receivedRequests ?? 0);
  const hasSocialLinks = Object.values((user.socialLinks as Record<string, string>) || {}).some(Boolean);
  const bUrl = user.bannerImage ? getAvatarUrl(user.bannerImage) : null;

  return (
    <div className="min-h-screen bg-slate-950">

      {/* Lightbox */}
      {lightboxFile && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center"
          onClick={() => setLightboxFile(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full transition-colors"
            onClick={() => setLightboxFile(null)}
          >
            <X size={20} />
          </button>
          <img
            src={`${API_URL}${lightboxFile.url}`}
            alt={lightboxFile.originalName}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          <p className="mt-3 text-xs text-slate-500">{lightboxFile.originalName}</p>
        </div>
      )}

      <div className="max-w-2xl mx-auto pb-28">

        {/* Banner */}
        <div className="relative">
          <div className="h-48 overflow-hidden bg-gradient-to-br from-primary-900 via-purple-900/70 to-slate-900">
            {bUrl
              ? <img src={bUrl} alt="" className="w-full h-full object-cover" />
              : <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.8) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(168,85,247,0.7) 0%, transparent 60%)' }} />
            }
          </div>
          <button onClick={() => navigate(-1)} className="absolute top-3 left-3 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-xl transition-all">
            <ArrowLeft size={18} />
          </button>
        </div>

        <div className="px-4">
          {/* Avatar + action buttons */}
          <div className="flex items-end justify-between -mt-14 mb-5">
            <div className="relative z-10 flex-shrink-0">
              <div className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-slate-950 shadow-2xl bg-gradient-to-br from-primary-500 to-purple-600">
                {user.avatar
                  ? <img src={getAvatarUrl(user.avatar)!} alt={`${user.firstName} ${user.lastName}`} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl font-bold text-white">{user.firstName?.[0]}{user.lastName?.[0]}</span>
                    </div>
                }
              </div>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <ShareButton
                url={`/profile/${user.id}`}
                title={`${user.firstName} ${user.lastName} — Moooza`}
                text={user.bio?.slice(0, 100)}
                className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
                iconSize={16}
              />
              <button
                onClick={() => navigate(`/messages/${user.id}`)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-primary-500/20"
              >
                <MessageCircle size={15} />Написать
              </button>
            </div>
          </div>

          {/* 1. ФИО */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl font-bold text-white leading-tight">{user.firstName} {user.lastName}</h1>
            {user.isPremium && <span title="Premium"><Crown size={18} className="text-amber-400" /></span>}
            {user.isVerified && <span title="Верифицирован"><BadgeCheck size={18} className="text-sky-400" /></span>}
            {user.isBlocked && <span title="Заблокирован"><Ban size={18} className="text-red-500" /></span>}
          </div>

          {/* 2. Ник + Гео */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-400 mb-3">
            {user.nickname && <span>@{user.nickname}</span>}
            {(user.city || user.country) && (
              <span className="flex items-center gap-1">
                <MapPin size={12} className="flex-shrink-0" />
                {[user.city, user.country].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          {/* Bio */}
          {user.bio && (
            <p className="text-slate-300 text-sm leading-relaxed mb-4 border-l-2 border-primary-500/40 pl-3">{user.bio}</p>
          )}

          {/* 3. Профессии */}
          {professionNames.length > 0 && (
            <div className="flex items-start gap-2 mb-2.5">
              <Briefcase size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
              <p className="text-slate-300 text-sm leading-snug">{professionNames.join(', ')}</p>
            </div>
          )}

          {/* 4. Муз. коллективы */}
          {(user.userArtists?.length ?? 0) > 0 && (
            <div className="flex items-start gap-2 mb-3">
              <Music size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
              <p className="text-slate-300 text-sm flex flex-wrap gap-x-1.5 gap-y-0.5">
                {user.userArtists.filter((ua: any) => ua.artist?.name).map((ua: any, idx: number, arr: any[]) => (
                  <span key={ua.artistId ?? ua.artist?.id}>
                    <button
                      onClick={() => navigate('/artist/' + (ua.artist?.id ?? ua.artistId))}
                      className="hover:text-primary-400 transition-colors"
                    >
                      {ua.artist?.name}
                    </button>
                    {idx < arr.length - 1 && <span className="text-slate-500">,</span>}
                  </span>
                ))}
              </p>
            </div>
          )}

          {/* Stats */}
          <div className="flex mt-4 mb-5 rounded-2xl border border-slate-800/60 bg-slate-900/50 overflow-hidden divide-x divide-slate-800/60">
            <div className="flex-1 py-3 text-center">
              <div className="text-lg font-bold text-white">{friendCount}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Друзья</div>
            </div>
            {servicesFlat.length > 0 && (
              <div className="flex-1 py-3 text-center">
                <div className="text-lg font-bold text-white">{servicesFlat.length}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Услуги</div>
              </div>
            )}
            {user.channel && (
              <div className="flex-1 py-3 text-center">
                <div className="text-lg font-bold text-white">{channelInfo?._count?.subscriptions ?? user.channel._count?.subscriptions ?? 0}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Подписчики</div>
              </div>
            )}
          </div>

          {/* 5. Ссылки */}
          {hasSocialLinks && (
            <div className="mb-5">
              <SocialIconRow links={(user.socialLinks as Record<string, string>) || {}} labeled />
            </div>
          )}

          {/* 6. Портфолио */}
          {portfolioFiles.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Портфолио</p>
              <div className="space-y-5">

                {/* Фото — карусель */}
                {photoFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Image size={13} className="text-slate-500" />
                      <span className="text-xs text-slate-500 font-medium">Фото</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                      {photoFiles.map((f: any) => (
                        <button key={f.id} onClick={() => setLightboxFile(f)}
                          className="flex-shrink-0 w-48 h-48 rounded-xl overflow-hidden bg-slate-800 hover:opacity-90 transition-opacity">
                          <img src={`${API_URL}${f.url}`} alt={f.originalName} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Аудио — плеер */}
                {audioFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Headphones size={13} className="text-slate-500" />
                      <span className="text-xs text-slate-500 font-medium">Аудио</span>
                    </div>
                    <div className="space-y-2">
                      {audioFiles.map((f: any) => (
                        <div key={f.id} className="rounded-xl bg-slate-900/60 border border-slate-800/60 px-3 pt-3 pb-2">
                          <p className="text-xs text-slate-400 truncate mb-2">{f.originalName}</p>
                          <audio controls src={`${API_URL}${f.url}`} className="w-full h-9" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Видео — плеер */}
                {videoFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Film size={13} className="text-slate-500" />
                      <span className="text-xs text-slate-500 font-medium">Видео</span>
                    </div>
                    <div className="space-y-2">
                      {videoFiles.map((f: any) => (
                        <div key={f.id} className="rounded-xl overflow-hidden bg-slate-900/60 border border-slate-800/60">
                          <video controls src={`${API_URL}${f.url}`} className="w-full max-h-64 object-contain bg-black" />
                          <p className="text-xs text-slate-500 truncate px-3 py-1.5">{f.originalName}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Другое */}
                {otherFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <FileText size={13} className="text-slate-500" />
                      <span className="text-xs text-slate-500 font-medium">Другое</span>
                    </div>
                    <div className="space-y-1">
                      {otherFiles.map((f: any) => (
                        <a key={f.id} href={`${API_URL}${f.url}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800/60 transition-colors group">
                          <FileText size={14} className="text-slate-500 flex-shrink-0 group-hover:text-primary-400 transition-colors" />
                          <span className="flex-1 text-sm text-slate-300 truncate group-hover:text-white transition-colors">{f.originalName}</span>
                          <span className="text-xs text-slate-600 flex-shrink-0">{formatFileSize(f.size)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>

        {/* 7. Услуги — горизонтальная карусель */}
        {servicesFlat.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-4">Услуги</p>
            <div className="flex gap-3 overflow-x-auto pb-3 px-4" style={{ scrollbarWidth: 'none' }}>
              {servicesFlat.map((us: any) => {
                const tags = [
                  ...(us.genres?.map((g: any) => g.name) ?? []),
                  ...(us.workFormats?.map((w: any) => w.name) ?? []),
                  ...(us.employmentTypes?.map((e: any) => e.name) ?? []),
                  ...(us.skillLevels?.map((s: any) => s.name) ?? []),
                  ...(us.availabilities?.map((a: any) => a.name) ?? []),
                  ...(us.geographies?.map((g: any) => g.name) ?? []),
                ];
                const price = us.priceFrom != null || us.priceTo != null
                  ? [us.priceFrom != null ? `от ${us.priceFrom} ₽` : null, us.priceTo != null ? `до ${us.priceTo} ₽` : null].filter(Boolean).join(' ')
                  : null;
                return (
                  <div key={us.id} className="flex-shrink-0 w-52 rounded-2xl border border-slate-800/60 bg-slate-900/70 p-4 flex flex-col gap-2">
                    <div>
                      <p className="text-sm font-bold text-white leading-snug">{us.service?.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{us._profName} · {us._fieldName}</p>
                    </div>
                    {price && <span className="text-sm font-semibold text-primary-400">{price}</span>}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-auto pt-1">
                        {tags.slice(0, 4).map((t: string, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]">{t}</span>
                        ))}
                        {tags.length > 4 && <span className="px-1.5 py-0.5 text-slate-600 text-[10px]">+{tags.length - 4}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 8. Канал */}
        {user.channel && (
          <div className="px-4 mb-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Канал</p>
            <div className="p-3.5 rounded-2xl border border-slate-800/60 bg-slate-900/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0">
                  {user.channel.avatar
                    ? <img src={getAvatarUrl(user.channel.avatar)!} alt="" className="w-full h-full object-cover" />
                    : <Radio size={20} className="text-slate-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{user.channel.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {channelInfo?._count?.subscriptions ?? user.channel._count?.subscriptions ?? 0} подписчиков · {channelInfo?._count?.posts ?? user.channel._count?.posts ?? 0} постов
                  </p>
                </div>
              </div>
              {user.channel.description && (
                <p className="text-sm text-slate-400 leading-relaxed mb-3">{user.channel.description}</p>
              )}
              <button
                onClick={() => channelInfo?.isSubscribed ? unsubscribeMut.mutate() : subscribeMut.mutate()}
                disabled={subscribeMut.isPending || unsubscribeMut.isPending}
                className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  channelInfo?.isSubscribed
                    ? 'bg-slate-800 hover:bg-red-500/15 border border-slate-700 hover:border-red-500/40 text-slate-300 hover:text-red-400'
                    : 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-500/20'
                }`}
              >
                {(subscribeMut.isPending || unsubscribeMut.isPending)
                  ? <Loader2 size={15} className="animate-spin" />
                  : channelInfo?.isSubscribed ? 'Отписаться' : 'Подписаться'
                }
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
