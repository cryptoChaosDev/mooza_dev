import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, Briefcase, Music, MessageCircle, Loader2,
  Building2, FileText, Radio, Crown, BadgeCheck, Ban,
} from 'lucide-react';
import { userAPI, channelAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { SocialIconRow } from '../components/SocialLinks';
import ShareButton from '../components/ShareButton';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
        <button onClick={() => navigate(-1)} className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-xl transition-all text-sm">
          Назад
        </button>
      </div>
    );
  }

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

  const friendCount = (user._count?.sentRequests ?? 0) + (user._count?.receivedRequests ?? 0);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const shareUrl = `/profile/${user.id}`;
  const bUrl = user.bannerImage ? getAvatarUrl(user.bannerImage) : null;
  const hasSocialLinks = Object.values((user.socialLinks as Record<string, string>) || {}).some(Boolean);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto pb-28">

        {/* Banner */}
        <div className="relative">
          <div className="h-48 overflow-hidden bg-gradient-to-br from-primary-900 via-purple-900/70 to-slate-900">
            {bUrl
              ? <img src={bUrl} alt="" className="w-full h-full object-cover" />
              : <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.8) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(168,85,247,0.7) 0%, transparent 60%)' }} />
            }
          </div>
          {/* Back button */}
          <button onClick={() => navigate(-1)} className="absolute top-3 left-3 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-xl transition-all">
            <ArrowLeft size={18} />
          </button>
        </div>

        {/* Avatar + actions row */}
        <div className="px-4">
          <div className="flex items-end justify-between -mt-14 mb-4">
            {/* Avatar */}
            <div className="relative z-10 flex-shrink-0">
              <div className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-slate-950 shadow-2xl bg-gradient-to-br from-primary-500 to-purple-600">
                {user.avatar
                  ? <img src={getAvatarUrl(user.avatar)!} alt={`${user.firstName} ${user.lastName}`} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl font-bold text-white">{user.firstName[0]}{user.lastName[0]}</span>
                    </div>
                }
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mb-1">
              <ShareButton
                url={shareUrl}
                title={`${user.firstName} ${user.lastName} — Moooza`}
                text={user.bio?.slice(0, 100)}
                className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
                iconSize={16}
              />
              <button onClick={() => navigate(`/messages/${user.id}`)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-primary-500/20"
              >
                <MessageCircle size={15} />Написать
              </button>
            </div>
          </div>

          {/* Name + badges */}
          <div className="mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-white leading-tight">{user.firstName} {user.lastName}</h1>
              {(user as any).isPremium && <span title="Premium"><Crown size={18} className="text-amber-400" /></span>}
              {(user as any).isVerified && <span title="Верифицирован"><BadgeCheck size={18} className="text-sky-400" /></span>}
              {(user as any).isBlocked && <span title="Заблокирован"><Ban size={18} className="text-red-500" /></span>}
            </div>
            {user.nickname && <p className="text-slate-400 text-sm mt-0.5">@{user.nickname}</p>}
            {user.role && (
              <span className="inline-flex items-center mt-2 px-3 py-1 text-sm font-medium text-primary-300 bg-primary-500/10 border border-primary-500/20 rounded-full">
                {user.role}
              </span>
            )}
          </div>

          {/* Stats — 3 columns */}
          <div className="flex mt-4 mb-2 rounded-2xl border border-slate-800/60 bg-slate-900/50 overflow-hidden divide-x divide-slate-800/60">
            <div className="flex-1 py-3 text-center">
              <div className="text-lg font-bold text-white">{friendCount}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Друзья</div>
            </div>
            {(user.userServices?.length ?? 0) > 0 && (
              <div className="flex-1 py-3 text-center">
                <div className="text-lg font-bold text-white">{user.userServices.length}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Услуги</div>
              </div>
            )}
            {user.channel && (
              <div className="flex-1 py-3 text-center">
                <div className="text-lg font-bold text-white">{channelInfo?._count?.subscriptions ?? user.channel._count.subscriptions}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Подписчики</div>
              </div>
            )}
          </div>
        </div>

        {/* Sections */}
        <div className="mt-2 divide-y divide-slate-800/70">

          {/* Bio */}
          {user.bio && (
            <div className="px-4 py-4">
              <p className="text-slate-200 text-sm leading-relaxed border-l-2 border-primary-500/50 pl-3">{user.bio}</p>
            </div>
          )}

          {/* Info rows */}
          {(user.city || user.country || user.fieldOfActivity || user.employer || user.userArtists?.length > 0) && (
            <div className="px-4 py-3 space-y-3.5">
              {(user.city || user.country) && (
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-slate-500 flex-shrink-0" />
                  <span className="text-slate-300 text-sm">{[user.city, user.country].filter(Boolean).join(', ')}</span>
                </div>
              )}
              {user.fieldOfActivity && (
                <div className="flex items-center gap-3">
                  <Briefcase size={16} className="text-slate-500 flex-shrink-0" />
                  <span className="text-slate-300 text-sm">{user.fieldOfActivity.name}</span>
                </div>
              )}
              {user.employer && (
                <div className="flex items-center gap-3">
                  <Building2 size={16} className="text-slate-500 flex-shrink-0" />
                  <span className="text-slate-300 text-sm">{user.employer.name}</span>
                </div>
              )}
              {user.userArtists?.length > 0 && (
                <div className="flex items-start gap-3">
                  <Music size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300 text-sm">{user.userArtists.map((ua: any) => ua.artist?.name).filter(Boolean).join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* Social links */}
          {hasSocialLinks && (
            <div className="px-4 py-3">
              <SocialIconRow links={(user.socialLinks as Record<string, string>) || {}} labeled />
            </div>
          )}

          {/* Services — flat cards */}
          {Object.keys(servicesByField).length > 0 && (
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Услуги</p>
              <div className="space-y-2">
                {(Object.entries(servicesByField) as any[]).flatMap(([, { fieldName, byProfession }]: any) =>
                  (Object.entries(byProfession) as any[]).flatMap(([, { profName, services }]: any) =>
                    services.map((us: any) => {
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
                        <div key={us.id} className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-3.5">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <div>
                              <p className="text-sm font-bold text-white">{us.service?.name}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">{profName} · {fieldName}</p>
                            </div>
                            {price && <span className="text-sm font-bold text-primary-400 whitespace-nowrap flex-shrink-0">{price}</span>}
                          </div>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {tags.map((t: string, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[11px]">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )
                )}
              </div>
            </div>
          )}

          {/* Portfolio */}
          {user.portfolioFiles?.length > 0 && (
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Портфолио</p>
              <div className="space-y-1.5">
                {user.portfolioFiles.map((f: any) => (
                  <a key={f.id} href={`${API_URL}${f.url}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800/60 transition-colors group">
                    <FileText size={16} className="text-slate-500 flex-shrink-0 group-hover:text-primary-400 transition-colors" />
                    <span className="flex-1 text-sm text-slate-300 truncate group-hover:text-white transition-colors">{f.originalName}</span>
                    <span className="text-xs text-slate-600">{formatFileSize(f.size)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Channel */}
          {user.channel && (
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Канал</p>
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
                    {channelInfo?._count?.subscriptions ?? user.channel._count.subscriptions} подписчиков · {channelInfo?._count?.posts ?? user.channel._count.posts} постов
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
                {(subscribeMut.isPending || unsubscribeMut.isPending) ? <Loader2 size={15} className="animate-spin" /> : channelInfo?.isSubscribed ? 'Отписаться' : 'Подписаться'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
