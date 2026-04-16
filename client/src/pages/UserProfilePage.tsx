import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, MessageCircle, Loader2,
  Crown, BadgeCheck, Ban, X,
  Headphones, Film, Image, FileText,
  Link2, Clock,
} from 'lucide-react';
import { userAPI, channelAPI, connectionAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { SocialIconRow } from '../components/SocialLinks';
import AvatarComponent from '../components/Avatar';
import ShareButton from '../components/ShareButton';
import ConnectionRequestModal from '../components/ConnectionRequestModal';
import ConnectionViewModal from '../components/ConnectionViewModal';
import { useAuthStore } from '../stores/authStore';

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
  const me = useAuthStore(s => s.user);
  const [lightboxFile, setLightboxFile] = useState<any>(null);
  const [showConnModal, setShowConnModal] = useState(false);

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

  const { data: userConnections = [] } = useQuery({
    queryKey: ['user-connections', userId],
    queryFn: async () => { const { data } = await connectionAPI.getUserConnections(userId!); return data; },
    enabled: !!userId,
  });

  const [viewConn, setViewConn] = useState<any>(null);
  const [connExpanded, setConnExpanded] = useState(false);

  const { data: conn } = useQuery({
    queryKey: ['connection-with', userId],
    queryFn: async () => {
      const { data } = await connectionAPI.getWith(userId!);
      return data as {
        id: string;
        status: string;
        iAmRequester: boolean;
        breakRequestedBy: string | null;
        services: { id: string; name: string }[];
      } | null;
    },
    enabled: !!userId && !!me && me.id !== userId,
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

      {viewConn && (
        <ConnectionViewModal connection={viewConn} onClose={() => setViewConn(null)} />
      )}

      {showConnModal && (
        <ConnectionRequestModal
          targetUser={{ id: user.id, firstName: user.firstName, lastName: user.lastName, avatar: user.avatar }}
          onClose={() => setShowConnModal(false)}
        />
      )}

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
          <div className="h-32 overflow-hidden bg-gradient-to-br from-primary-900 via-purple-900/70 to-slate-900">
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
              <div className="rounded-full ring-4 ring-slate-950 shadow-2xl">
                <AvatarComponent src={user.avatar} name={`${user.firstName} ${user.lastName}`} size={112} />
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
              {/* Connection button — only show for other users */}
              {me && me.id !== user.id && (() => {
                // conn === undefined means still loading — don't show anything yet
                if (conn === undefined) return null;
                // conn === null means no connection exists
                if (conn === null) {
                  return (
                    <button
                      onClick={() => setShowConnModal(true)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-primary-400 rounded-xl transition-all"
                      title="Установить связь"
                    >
                      <Link2 size={16} />
                    </button>
                  );
                }
                if (conn.status === 'PENDING' && conn.iAmRequester) {
                  return (
                    <button
                      onClick={() => setViewConn(conn)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 rounded-xl text-xs font-medium transition-colors"
                    >
                      <Clock size={13} /> Запрос отправлен
                    </button>
                  );
                }
                if (conn.status === 'PENDING' && !conn.iAmRequester) {
                  return (
                    <button
                      onClick={() => setViewConn(conn)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-medium transition-all"
                    >
                      <Link2 size={13} /> Входящий запрос
                    </button>
                  );
                }
                if (conn.status === 'ACCEPTED') {
                  return (
                    <button
                      onClick={() => setViewConn(conn)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/30 text-primary-400 rounded-xl text-xs font-medium transition-colors"
                    >
                      <Link2 size={13} /> Связь
                    </button>
                  );
                }
                if (conn.status === 'BREAK_REQUESTED') {
                  return (
                    <button
                      onClick={() => setViewConn(conn)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 text-red-400 rounded-xl text-xs font-medium transition-colors"
                    >
                      <Clock size={13} /> Разрыв связи
                    </button>
                  );
                }
                return null;
              })()}
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-400 mb-1">
            {user.nickname && <span>@{user.nickname}</span>}
            {(user.city || user.country) && (
              <span className="flex items-center gap-1">
                <MapPin size={12} className="flex-shrink-0" />
                {[user.city, user.country].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          {/* Stats — compact inline */}
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 flex-wrap">
            <span><span className="font-semibold text-slate-300">{friendCount}</span> друзей</span>
            {servicesFlat.length > 0 && <><span className="text-slate-700">·</span><span><span className="font-semibold text-slate-300">{servicesFlat.length}</span> услуг</span></>}
            {user.channel && <><span className="text-slate-700">·</span><span><span className="font-semibold text-slate-300">{channelInfo?._count?.subscriptions ?? user.channel._count?.subscriptions ?? 0}</span> подписчиков</span></>}
            {userConnections.length > 0 && <><span className="text-slate-700">·</span><span><span className="font-semibold text-slate-300">{userConnections.length}</span> связей</span></>}
          </div>

          {/* Bio */}
          {user.bio && (
            <p className="text-slate-300 text-sm leading-relaxed mb-4 border-l-2 border-primary-500/40 pl-3">{user.bio}</p>
          )}

          {/* 3. Специализация */}
          {professionNames.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Специализация</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {professionNames.map((name, i) => (
                  <span key={i} className="px-2.5 py-1 bg-slate-800/80 border border-slate-700/50 text-slate-300 rounded-lg text-xs font-medium">{name}</span>
                ))}
              </div>
            </div>
          )}

          {/* 4. Коллективы */}
          {(user.userArtists?.length ?? 0) > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Коллективы</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {user.userArtists.filter((ua: any) => ua.artist?.name).map((ua: any) => (
                  <button
                    key={ua.artistId ?? ua.artist?.id}
                    onClick={() => navigate('/artist/' + (ua.artist?.id ?? ua.artistId))}
                    className="px-2.5 py-1 bg-primary-600/15 border border-primary-500/30 text-primary-400 rounded-lg text-xs font-medium hover:bg-primary-600/25 transition-colors"
                  >
                    {ua.artist?.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5. Связи */}
          {userConnections.length > 0 && (() => {
            const LIMIT = 6;
            const visible = connExpanded ? userConnections : userConnections.slice(0, LIMIT);
            return (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 size={13} className="text-primary-400" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Профессиональные связи</span>
                  <span className="text-[11px] text-slate-600 font-medium">{userConnections.length}</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visible.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/profile/${c.partner.id}`)}
                      className="text-left p-3 bg-slate-800/40 border border-slate-700/40 rounded-xl hover:border-primary-500/30 hover:bg-slate-800/70 transition-all group"
                    >
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-700 flex-shrink-0 ring-1 ring-white/5">
                          {c.partner.avatar
                            ? <img src={`${API_URL}${c.partner.avatar}`} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full bg-primary-600/30 flex items-center justify-center text-xs text-primary-300 font-bold">{c.partner.firstName?.[0]}</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate leading-tight">{c.partner.firstName} {c.partner.lastName}</p>
                          {c.partner.city && <p className="text-[11px] text-slate-500 truncate">{c.partner.city}</p>}
                        </div>
                        <Link2 size={12} className="text-primary-400/50 group-hover:text-primary-400 flex-shrink-0 transition-colors" />
                      </div>
                      {c.services.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.services.slice(0, 3).map((s: any) => (
                            <span key={s.id} className="text-[11px] bg-primary-500/10 text-primary-300 border border-primary-500/20 rounded-md px-1.5 py-0.5 leading-none">
                              {s.name}
                            </span>
                          ))}
                          {c.services.length > 3 && (
                            <span className="text-[11px] bg-slate-700/60 text-slate-400 rounded-md px-1.5 py-0.5 leading-none">
                              +{c.services.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {userConnections.length > LIMIT && (
                  <button
                    onClick={() => setConnExpanded(v => !v)}
                    className="mt-2 w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors text-center"
                  >
                    {connExpanded ? 'Свернуть' : `Показать ещё ${userConnections.length - LIMIT}`}
                  </button>
                )}
              </div>
            );
          })()}

          {/* 6. Контакты */}
          {hasSocialLinks && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Контакты</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>
              <SocialIconRow links={(user.socialLinks as Record<string, string>) || {}} labeled />
            </div>
          )}

          {/* 6. Портфолио */}
          {portfolioFiles.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Портфолио</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>
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
            <div className="flex items-center gap-2 mb-3 px-4">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Услуги</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
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
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Канал</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <div className="p-3.5 rounded-2xl border border-slate-800/60 bg-slate-900/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                  <AvatarComponent src={user.channel.avatar} name={user.channel.name} size={48} />
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
