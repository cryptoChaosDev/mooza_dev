/**
 * PublicProfilePage — accessible without login.
 * Route: /@:handle  (e.g. /@john or /@some-uuid)
 * Resolves handle → user data via /users/handle/:handle (no auth required).
 * If user IS logged in, shows full interactive features (subscribe, message).
 */
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, Briefcase, Music, MessageCircle, Loader2,
  Globe, Building2, User, FileText, Radio, LogIn,
} from 'lucide-react';
import { userAPI, channelAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { SocialIconRow } from '../components/SocialLinks';
import ShareButton from '../components/ShareButton';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type Tab = 'basic' | 'profession' | 'channel';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'basic',      label: 'Основное',  icon: <User size={14} /> },
  { id: 'profession', label: 'Услуги',    icon: <Briefcase size={14} /> },
  { id: 'channel',    label: 'Канал',     icon: <Radio size={14} /> },
];

const EmptyState = ({ text }: { text: string }) => (
  <div className="py-8 text-center">
    <p className="text-slate-500 text-sm">{text}</p>
  </div>
);

export default function PublicProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('basic');

  const { data: user, isLoading } = useQuery({
    queryKey: ['user-handle', handle],
    queryFn: async () => {
      const { data } = await userAPI.getUserByHandle(handle!);
      return data;
    },
    enabled: !!handle,
  });

  const channelId = user?.channel?.id;
  const { data: channelInfo, refetch: refetchChannel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: async () => {
      const { data } = await channelAPI.getChannel(channelId!);
      return data as { id: string; name: string; description: string | null; avatar: string | null; isSubscribed: boolean; _count: { subscriptions: number; posts: number } };
    },
    enabled: !!channelId && !!currentUser,
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

  const shareUrl = `/@${user.nickname || user.id}`;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24">

        {/* Back */}
        <button onClick={() => navigate(-1)}
          className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700/80 rounded-lg border border-slate-700/50 hover:border-primary-500/50 transition-all mb-3"
        >
          <ArrowLeft size={15} className="text-slate-300 group-hover:text-white transition-colors" />
          <span className="text-slate-300 group-hover:text-white transition-colors text-xs">Назад</span>
        </button>

        {/* ── HERO CARD ── */}
        <div className="rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden mb-4 bg-slate-900 relative">
          {user.bannerImage && <img src={`${API_URL}${user.bannerImage}`} alt="" className="absolute inset-0 w-full h-full object-cover z-0" />}
          {user.bannerImage && <div className="absolute inset-0 bg-black/50 z-0" />}
          <div className="relative h-28 z-10">
            {!user.bannerImage && <div className="absolute inset-0 bg-gradient-to-br from-primary-900/70 via-purple-900/50 to-slate-900" />}
            {!user.bannerImage && <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 15% 60%, rgba(99,102,241,0.5) 0%, transparent 55%), radial-gradient(circle at 85% 20%, rgba(168,85,247,0.5) 0%, transparent 55%)' }} />}

            {/* Action buttons top-right */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
              {currentUser && currentUser.id !== user.id && (
                <button onClick={() => navigate(`/messages/${user.id}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 rounded-lg transition-all shadow-lg shadow-primary-500/30 text-white text-xs font-medium"
                >
                  <MessageCircle size={13} />Написать
                </button>
              )}
              {!currentUser && (
                <Link to="/login"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 rounded-lg transition-all text-white text-xs font-medium"
                >
                  <LogIn size={13} />Войти
                </Link>
              )}
            </div>

            {/* Avatar */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
              <div className="w-20 h-20 rounded-2xl overflow-hidden ring-2 ring-primary-500/40 ring-offset-2 ring-offset-slate-900 shadow-xl shadow-primary-500/20">
                {user.avatar
                  ? <img src={`${API_URL}${user.avatar}`} alt={`${user.firstName} ${user.lastName}`} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">{user.firstName[0]}{user.lastName[0]}</span>
                    </div>
                }
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="pt-12 pb-4 px-4 text-center relative z-10">
            <h1 className="text-lg font-bold text-white leading-tight">{user.firstName} {user.lastName}</h1>
            {user.nickname && <p className="text-slate-400 text-sm mt-0.5">@{user.nickname}</p>}
            {user.role && (
              <span className="block mt-1.5 px-2.5 py-0.5 bg-primary-500/15 text-primary-300 text-xs font-medium rounded-full border border-primary-500/30 text-center">
                {user.role}
              </span>
            )}

            {/* Location */}
            {(user.city || user.country) && (
              <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                {user.city && (
                  <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700/50">
                    <MapPin size={10} className="text-primary-400" />{user.city}
                  </span>
                )}
                {user.country && (
                  <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700/50">
                    <Globe size={10} className="text-slate-500" />{user.country}
                  </span>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center justify-center mt-3 bg-slate-800/50 rounded-xl border border-slate-700/50 divide-x divide-slate-700/50">
              <div className="flex-1 py-2.5 text-center">
                <div className="text-base font-bold text-white">{friendCount}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Друзья</div>
              </div>
            </div>

            {/* Social links */}
            <SocialIconRow links={(user.socialLinks as Record<string, string>) || {}} />

            {/* Share */}
            <div className="mt-3 flex justify-center">
              <ShareButton
                url={shareUrl}
                title={`${user.firstName} ${user.lastName} — Moooza`}
                text={user.bio?.slice(0, 100)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-400 hover:text-white text-xs rounded-full transition-all"
                iconSize={12}
                label="Поделиться профилем"
              />
            </div>

            {/* Handle pill */}
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-500 font-mono select-all">
                moooza.ru{shareUrl}
              </span>
            </div>
          </div>
        </div>

        {/* ── TAB BAR ── */}
        <div className="flex gap-1 p-1 bg-slate-800/80 rounded-xl border border-slate-700/50 mb-3">
          {TABS.filter(t => t.id !== 'channel' || !!user.channel).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-primary-500 text-white shadow-md shadow-primary-500/30'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50">

          {/* ОСНОВНОЕ */}
          {activeTab === 'basic' && (
            <div className="p-4 space-y-4">
              {user.bio
                ? <p className="text-slate-300 text-sm leading-relaxed">{user.bio}</p>
                : <EmptyState text="Биография не заполнена" />
              }
              {(user.country || user.city) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
                  {user.country && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl text-slate-300 text-xs border border-slate-600/30">
                      <Globe size={12} className="text-slate-400" />{user.country}
                    </span>
                  )}
                  {user.city && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl text-slate-300 text-xs border border-slate-600/30">
                      <MapPin size={12} className="text-slate-400" />{user.city}
                    </span>
                  )}
                </div>
              )}
              {user.userArtists?.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
                  <span className="w-full text-xs text-slate-500 font-semibold">Группы / Артисты</span>
                  {user.userArtists.map((ua: any) => (
                    <span key={ua.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 rounded-xl text-purple-300 text-xs border border-purple-500/20">
                      <Music size={11} />{ua.artist?.name}
                    </span>
                  ))}
                </div>
              )}
              {user.employer && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
                  <span className="w-full text-xs text-slate-500 font-semibold">Работодатель</span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 rounded-xl text-green-300 text-xs border border-green-500/20">
                    <Building2 size={11} />{user.employer.name}
                  </span>
                </div>
              )}
              {user.portfolioFiles?.length > 0 && (
                <div className="pt-2 border-t border-slate-700/50">
                  <p className="text-xs text-slate-500 font-semibold mb-2">Портфолио</p>
                  <div className="space-y-1.5">
                    {user.portfolioFiles.map((f: any) => (
                      <a key={f.id} href={`${API_URL}${f.url}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700/20 rounded-xl border border-slate-600/30 hover:border-primary-500/30 transition-colors">
                        <FileText size={13} className="text-slate-400 flex-shrink-0" />
                        <span className="flex-1 text-xs text-slate-300 truncate">{f.originalName}</span>
                        <span className="text-xs text-slate-500">{formatFileSize(f.size)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* УСЛУГИ */}
          {activeTab === 'profession' && (
            <div className="p-4">
              {(user.fieldOfActivity || user.employer) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {user.fieldOfActivity && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl border border-slate-600/30 text-slate-300 text-xs font-medium">
                      <Briefcase size={12} className="text-primary-400" />{user.fieldOfActivity.name}
                    </div>
                  )}
                  {user.employer && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl border border-slate-600/30 text-slate-300 text-xs font-medium">
                      <Building2 size={12} className="text-green-400" />{user.employer.name}
                    </div>
                  )}
                </div>
              )}
              {Object.keys(servicesByField).length > 0 ? (
                <div className="space-y-4">
                  {(Object.entries(servicesByField) as any[]).map(([fieldId, { fieldName, byProfession }]: any) => (
                    <div key={fieldId}>
                      <p className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-2">{fieldName}</p>
                      <div className="space-y-3 pl-2 border-l border-primary-500/20">
                        {(Object.entries(byProfession) as any[]).map(([professionId, { profName, services }]: any) => (
                          <div key={professionId}>
                            <p className="text-xs text-slate-500 font-semibold mb-1.5">{profName}</p>
                            <div className="space-y-2">
                              {services.map((us: any) => {
                                const tags = [
                                  ...(us.genres?.map((g: any) => g.name) ?? []),
                                  ...(us.workFormats?.map((w: any) => w.name) ?? []),
                                  ...(us.employmentTypes?.map((e: any) => e.name) ?? []),
                                  ...(us.skillLevels?.map((s: any) => s.name) ?? []),
                                  ...(us.availabilities?.map((a: any) => a.name) ?? []),
                                  ...(us.geographies?.map((g: any) => g.name) ?? []),
                                ];
                                return (
                                  <div key={us.id} className="bg-slate-700/20 rounded-xl border border-slate-600/30 p-3">
                                    <p className="text-sm font-semibold text-white mb-1.5">{us.service?.name}</p>
                                    {tags.length > 0 ? (
                                      <div className="flex flex-wrap gap-1.5">
                                        {tags.map((t: string, i: number) => (
                                          <span key={i} className="px-2 py-0.5 bg-slate-600/40 text-slate-300 rounded-md text-xs border border-slate-600/30">{t}</span>
                                        ))}
                                      </div>
                                    ) : <p className="text-slate-500 text-xs">Фильтры не настроены</p>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="Профессиональная информация не заполнена" />
              )}
            </div>
          )}

          {/* КАНАЛ */}
          {activeTab === 'channel' && user.channel && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-700 border border-slate-600 flex items-center justify-center flex-shrink-0">
                  {user.channel.avatar
                    ? <img src={`${API_URL}${user.channel.avatar}`} alt="" className="w-full h-full object-cover" />
                    : <Radio size={22} className="text-slate-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">{user.channel.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                    <span>{channelInfo?._count?.subscriptions ?? user.channel._count.subscriptions} подписчиков</span>
                    <span>{channelInfo?._count?.posts ?? user.channel._count.posts} постов</span>
                  </div>
                </div>
              </div>
              {user.channel.description && (
                <p className="text-sm text-slate-400 leading-relaxed">{user.channel.description}</p>
              )}
              {currentUser ? (
                <button
                  onClick={() => channelInfo?.isSubscribed ? unsubscribeMut.mutate() : subscribeMut.mutate()}
                  disabled={subscribeMut.isPending || unsubscribeMut.isPending}
                  className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    channelInfo?.isSubscribed
                      ? 'bg-slate-700 hover:bg-red-500/20 border border-slate-600 hover:border-red-500/50 text-slate-300 hover:text-red-400'
                      : 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-500/20'
                  }`}
                >
                  {(subscribeMut.isPending || unsubscribeMut.isPending)
                    ? <Loader2 size={15} className="animate-spin" />
                    : channelInfo?.isSubscribed ? 'Отписаться' : 'Подписаться'
                  }
                </button>
              ) : (
                <Link to="/login"
                  className="w-full py-2.5 text-sm font-semibold rounded-xl bg-primary-600 hover:bg-primary-500 text-white flex items-center justify-center gap-2 transition-all"
                >
                  <LogIn size={15} />Войдите, чтобы подписаться
                </Link>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
