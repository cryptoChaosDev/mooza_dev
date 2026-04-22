import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, MessageCircle, Loader2,
  Crown, BadgeCheck, Ban, X,
  Headphones, FileText, Briefcase,
  Link2, Star, UserPlus, UserCheck, UserX, Clock, Music2,
  Users,
} from 'lucide-react';
import { userAPI, connectionAPI, favoriteAPI, friendshipAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { SocialIconRow } from '../components/SocialLinks';
import AvatarComponent from '../components/Avatar';
import ShareButton from '../components/ShareButton';
import ConnectionRequestModal from '../components/ConnectionRequestModal';
import { plural } from '../lib/plural';
import ConnectionViewModal from '../components/ConnectionViewModal';
import { useAuthStore } from '../stores/authStore';
import { createPortal } from 'react-dom';
import { formatLastSeen } from '../lib/lastSeen';
import { usePresenceStore } from '../stores/presenceStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function getVideoEmbedUrl(url: string): string | null {
  const rt = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rt) return `https://rutube.ru/play/embed/${rt[1]}/`;
  const vk = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vk) return `https://vk.com/video_ext.php?oid=${vk[1]}&id=${vk[2]}`;
  return null;
}

function detectAudioPlatform(url: string): 'yandex' | 'google' | 'other' {
  if (url.includes('disk.yandex') || url.includes('yadi.sk')) return 'yandex';
  if (url.includes('drive.google') || url.includes('docs.google')) return 'google';
  return 'other';
}

function PortfolioAudioItem({ link, onDelete }: { link: any; onDelete?: () => void }) {
  const [failed, setFailed] = useState(false);
  const platform = detectAudioPlatform(link.url);
  const platformLabel = platform === 'yandex' ? 'Яндекс Диск' : platform === 'google' ? 'Google Диск' : 'Облако';
  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/40 px-3 pt-3 pb-2">
      <div className="flex items-center gap-2 mb-2">
        <Headphones size={13} className="text-primary-400 flex-shrink-0" />
        <span className="flex-1 text-xs text-slate-300 truncate">{link.title || platformLabel}</span>
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-primary-400 transition-colors flex-shrink-0">↗</a>
        {onDelete && <button onClick={onDelete} className="p-0.5 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all flex-shrink-0"><X size={12} /></button>}
      </div>
      {!failed
        ? <audio controls src={link.url} className="w-full h-9" onError={() => setFailed(true)} />
        : <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
            <span>Открыть в браузере →</span>
          </a>
      }
    </div>
  );
}

function PortfolioVideoItem({ link, onDelete }: { link: any; onDelete?: () => void }) {
  const embedUrl = getVideoEmbedUrl(link.url);
  const isRutube = link.url.includes('rutube.ru');
  const isVk = link.url.includes('vk.com');
  const platformLabel = isRutube ? 'RuTube' : isVk ? 'VK Видео' : 'Видео';
  return (
    <div className="rounded-xl overflow-hidden bg-slate-800/60 border border-slate-700/40">
      {embedUrl
        ? <iframe src={embedUrl} className="w-full aspect-video" allowFullScreen frameBorder="0" allow="clipboard-write; autoplay" />
        : <div className="p-3 text-center">
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-400 hover:text-primary-300 transition-colors">Открыть {platformLabel} →</a>
          </div>
      }
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex-1 text-xs text-slate-400 truncate">{link.title || platformLabel}</span>
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-primary-400 transition-colors flex-shrink-0">↗</a>
        {onDelete && <button onClick={onDelete} className="p-0.5 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all flex-shrink-0"><X size={12} /></button>}
      </div>
    </div>
  );
}

function DocIcon({ mimeType, name }: { mimeType?: string; name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (mimeType === 'application/pdf' || ext === 'pdf')
    return <FileText size={15} className="text-red-400 flex-shrink-0" />;
  if (ext === 'xlsx' || ext === 'xls' || mimeType?.includes('spreadsheet') || mimeType?.includes('excel'))
    return <FileText size={15} className="text-green-400 flex-shrink-0" />;
  return <FileText size={15} className="text-blue-400 flex-shrink-0" />;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

function BottomPanel({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[61] bg-slate-900 rounded-t-2xl border-t border-slate-800 flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 flex-shrink-0">
          <span className="font-semibold text-white text-sm">{title}</span>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"><X size={16} className="text-slate-400" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">{children}</div>
      </div>
    </>,
    document.body
  );
}

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuthStore(s => s.user);
  const [showConnModal, setShowConnModal] = useState(false);
  const [viewConn, setViewConn] = useState<any>(null);
  const [connExpanded, setConnExpanded] = useState(false);
  const [portfolioTab, setPortfolioTab] = useState<'audio' | 'video' | 'other'>('audio');
  const [servicesOpen, setServicesOpen] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);
  const onlineUsers = usePresenceStore(s => s.onlineUsers);

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => { const { data } = await userAPI.getUser(userId!); return data; },
    enabled: !!userId,
  });

  const { data: userConnections = [] } = useQuery({
    queryKey: ['user-connections', userId],
    queryFn: async () => { const { data } = await connectionAPI.getUserConnections(userId!); return data; },
    enabled: !!userId,
  });

  const { data: conn } = useQuery({
    queryKey: ['connection-with', userId],
    queryFn: async () => {
      const { data } = await connectionAPI.getWith(userId!);
      return data as { id: string; status: string; iAmRequester: boolean; breakRequestedBy: string | null; services: { id: string; name: string }[] } | null;
    },
    enabled: !!userId && !!me && me.id !== userId,
  });

  const { data: favStatus } = useQuery({
    queryKey: ['favorite-status', userId],
    queryFn: async () => { const { data } = await favoriteAPI.status(userId!); return data as { isFavorite: boolean }; },
    enabled: !!userId && !!me && me.id !== userId,
  });

  const addFavMut = useMutation({
    mutationFn: () => favoriteAPI.add(userId!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['favorite-status', userId] }); queryClient.invalidateQueries({ queryKey: ['favorites'] }); },
  });
  const removeFavMut = useMutation({
    mutationFn: () => favoriteAPI.remove(userId!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['favorite-status', userId] }); queryClient.invalidateQueries({ queryKey: ['favorites'] }); },
  });

  const sendFriendMut = useMutation({
    mutationFn: () => friendshipAPI.sendRequest(userId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', userId] }),
  });
  const cancelFriendMut = useMutation({
    mutationFn: () => friendshipAPI.rejectRequest(user?.friendshipId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', userId] }),
  });
  const acceptFriendMut = useMutation({
    mutationFn: () => friendshipAPI.acceptRequest(user?.friendshipId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', userId] }),
  });
  const removeFriendMut = useMutation({
    mutationFn: () => friendshipAPI.removeFriend(user?.friendshipId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', userId] }),
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
  const portfolioLinks: any[] = user.portfolioLinks ?? [];
  const audioLinks = portfolioLinks.filter((l: any) => l.type === 'audio');
  const videoLinks = portfolioLinks.filter((l: any) => l.type === 'video');

  const friendCount = (user._count?.sentRequests ?? 0) + (user._count?.receivedRequests ?? 0);
  const hasSocialLinks = Object.values((user.socialLinks as Record<string, string>) || {}).some(Boolean);
  const bUrl = user.bannerImage ? getAvatarUrl(user.bannerImage) : null;

  return (
    <>
    <div className="min-h-screen bg-slate-950">

      {viewConn && <ConnectionViewModal connection={viewConn} onClose={() => setViewConn(null)} />}

      {showConnModal && (
        <ConnectionRequestModal
          targetUser={{ id: user.id, firstName: user.firstName, lastName: user.lastName, avatar: user.avatar }}
          onClose={() => setShowConnModal(false)}
        />
      )}


      <div className="max-w-2xl mx-auto pb-28">

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <div className="relative">
          <div className="h-44 overflow-hidden bg-gradient-to-br from-primary-900 via-purple-900/70 to-slate-900">
            {bUrl
              ? <img src={bUrl} alt="" className="w-full h-full object-cover" />
              : <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.8) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(168,85,247,0.7) 0%, transparent 60%)' }} />
            }
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
          </div>
          <button onClick={() => navigate(-1)} className="absolute top-3 left-3 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-xl transition-all">
            <ArrowLeft size={18} />
          </button>
        </div>

        <div className="px-4">
          {/* Avatar + action buttons */}
          <div className="flex items-end justify-between -mt-14 mb-4">
            <div className="relative z-10 flex-shrink-0">
              <div className="rounded-full ring-4 ring-slate-950 shadow-2xl">
                <AvatarComponent src={user.avatar} name={`${user.firstName} ${user.lastName}`} size={112} />
              </div>
            </div>
            <div className="flex items-center gap-2 mb-1 flex-wrap justify-end">
              <ShareButton
                url={`/profile/${user.id}`}
                title={`${user.firstName} ${user.lastName} — Moooza`}
                text={user.bio?.slice(0, 100)}
                className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-white rounded-xl transition-all"
                iconSize={16}
              />
              {me && me.id !== user.id && (
                <>
                  {conn && conn.status === 'PENDING' && !conn.iAmRequester && (
                    <button onClick={() => setViewConn(conn)} className="p-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl transition-all" title="Входящий запрос на связь">
                      <Link2 size={16} />
                    </button>
                  )}
                  <button onClick={() => setShowConnModal(true)} className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-primary-400 rounded-xl transition-all" title="Установить связь">
                    <Link2 size={16} />
                  </button>
                  {favStatus !== undefined && (
                    <button
                      onClick={() => favStatus.isFavorite ? removeFavMut.mutate() : addFavMut.mutate()}
                      disabled={addFavMut.isPending || removeFavMut.isPending}
                      className={`p-2 border rounded-xl transition-all disabled:opacity-50 ${favStatus.isFavorite ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700/60 text-slate-400 hover:text-amber-400'}`}
                      title={favStatus.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                    >
                      <Star size={16} fill={favStatus.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                  )}
                  {user.friendshipStatus === 'none' && (
                    <button onClick={() => sendFriendMut.mutate()} disabled={sendFriendMut.isPending} className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-primary-400 rounded-xl transition-all disabled:opacity-50" title="Добавить в друзья">
                      <UserPlus size={16} />
                    </button>
                  )}
                  {user.friendshipStatus === 'pending_sent' && (
                    <button onClick={() => cancelFriendMut.mutate()} disabled={cancelFriendMut.isPending} className="p-2 bg-slate-800/80 hover:bg-red-500/10 border border-slate-700/60 hover:border-red-500/30 text-slate-500 hover:text-red-400 rounded-xl transition-all disabled:opacity-50" title="Заявка отправлена — нажмите чтобы отменить">
                      <Clock size={16} />
                    </button>
                  )}
                  {user.friendshipStatus === 'pending_received' && (
                    <>
                      <button onClick={() => acceptFriendMut.mutate()} disabled={acceptFriendMut.isPending} className="p-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl transition-all disabled:opacity-50" title="Принять заявку в друзья">
                        <UserCheck size={16} />
                      </button>
                      <button onClick={() => cancelFriendMut.mutate()} disabled={cancelFriendMut.isPending} className="p-2 bg-slate-800/80 hover:bg-red-500/10 border border-slate-700/60 hover:border-red-500/30 text-slate-500 hover:text-red-400 rounded-xl transition-all disabled:opacity-50" title="Отклонить заявку">
                        <UserX size={16} />
                      </button>
                    </>
                  )}
                  {user.friendshipStatus === 'accepted' && (
                    <button onClick={() => removeFriendMut.mutate()} disabled={removeFriendMut.isPending} className="p-2 bg-green-500/10 hover:bg-red-500/10 border border-green-500/30 hover:border-red-500/30 text-green-400 hover:text-red-400 rounded-xl transition-all disabled:opacity-50" title="В друзьях — нажмите чтобы удалить">
                      <UserCheck size={16} />
                    </button>
                  )}
                  <button onClick={() => navigate(`/messages/${user.id}`)} className="p-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl transition-all shadow-lg shadow-primary-500/20" title="Написать сообщение">
                    <MessageCircle size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h1 className="text-2xl font-bold text-white leading-tight">{user.firstName} {user.lastName}</h1>
            {user.isPremium && <span title="Premium"><Crown size={18} className="text-amber-400" /></span>}
            {user.isVerified && <span title="Верифицирован"><BadgeCheck size={18} className="text-sky-400" /></span>}
            {user.isBlocked && <span title="Заблокирован"><Ban size={18} className="text-red-500" /></span>}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-400 mb-2">
            {user.nickname && <span className="text-slate-500">@{user.nickname}</span>}
            {me?.id !== user.id && (
              onlineUsers.has(user.id)
                ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />В сети</span>
                : user.lastSeenAt
                  ? <span className="text-xs text-slate-600">{formatLastSeen(user.lastSeenAt)}</span>
                  : null
            )}
            {(user.city || user.country) && (
              <span className="flex items-center gap-1">
                <MapPin size={12} className="flex-shrink-0" />
                {[user.city, user.country].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          {professionNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {professionNames.map((name, i) => (
                <span key={i} className="px-2.5 py-1 bg-primary-500/10 border border-primary-500/25 text-primary-300 rounded-lg text-xs font-medium">{name}</span>
              ))}
            </div>
          )}

          {hasSocialLinks && <div className="mb-4"><SocialIconRow links={(user.socialLinks as Record<string, string>) || {}} /></div>}

          {/* ── Stats chips ── */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-xl">
              <Users size={13} className="text-primary-400" />
              <span className="text-sm font-bold text-white">{friendCount}</span>
              <span className="text-xs text-slate-500">друзей</span>
            </div>

            {userConnections.length > 0 && (
              <button
                onClick={() => document.querySelector('[data-connections]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-slate-600 rounded-xl transition-all group"
              >
                <Link2 size={13} className="text-emerald-400 group-hover:text-emerald-300" />
                <span className="text-sm font-bold text-white">{userConnections.length}</span>
                <span className="text-xs text-slate-500">{plural(userConnections.length, 'связь', 'связи', 'связей')}</span>
              </button>
            )}

            {servicesFlat.length > 0 && (
              <button
                onClick={() => servicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-slate-600 rounded-xl transition-all group"
              >
                <Briefcase size={13} className="text-amber-400 group-hover:text-amber-300" />
                <span className="text-sm font-bold text-white">{servicesFlat.length}</span>
                <span className="text-xs text-slate-500">услуг</span>
              </button>
            )}

          </div>

          <div className="space-y-3">

            {/* Bio */}
            {user.bio && (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">О себе</p>
                <p className="text-slate-300 text-sm leading-relaxed">{user.bio}</p>
              </div>
            )}

            {/* Groups / Коллективы — avatar carousel */}
            {(user.userArtists?.length ?? 0) > 0 && (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Коллективы</p>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                  {user.userArtists.filter((ua: any) => ua.artist?.name).map((ua: any) => (
                    <button
                      key={ua.artistId ?? ua.artist?.id}
                      onClick={() => navigate('/artist/' + (ua.artist?.id ?? ua.artistId))}
                      className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16 group"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-800/60 to-purple-800/60 border border-primary-600/30 flex items-center justify-center overflow-hidden group-hover:border-primary-500/60 transition-colors">
                        {ua.artist?.avatar
                          ? <img src={getAvatarUrl(ua.artist.avatar) ?? ''} alt={ua.artist.name} className="w-full h-full object-cover" />
                          : <Music2 size={22} className="text-primary-400" />
                        }
                      </div>
                      <span className="text-[10px] text-slate-400 text-center leading-tight w-full truncate">{ua.artist?.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Services — carousel */}
            {servicesFlat.length > 0 && (
              <div ref={servicesRef} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <Briefcase size={14} className="text-primary-400" />
                  <span className="text-sm font-semibold text-white">Услуги</span>
                  <span className="ml-auto text-xs text-slate-500">{servicesFlat.length}</span>
                </div>
                <div className="px-3 py-3">
                  <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
                    <div className="flex gap-3" style={{ width: 'max-content' }}>
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
                          <div key={us.id} className="w-48 flex-shrink-0 rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 flex flex-col gap-1.5">
                            <p className="text-[10px] text-slate-500 leading-none mb-0.5">{us._profName}</p>
                            <p className="text-sm font-bold text-white leading-snug">{us.service?.name}</p>
                            {price && <span className="text-xs font-semibold text-primary-400">{price}</span>}
                            {tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-auto pt-1">
                                {tags.slice(0, 3).map((t: string, i: number) => (
                                  <span key={i} className="px-1.5 py-0.5 bg-slate-700/60 text-slate-400 rounded text-[10px]">{t}</span>
                                ))}
                                {tags.length > 3 && <span className="px-1.5 py-0.5 text-slate-600 text-[10px]">+{tags.length - 3}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Portfolio — tabs */}
            {(portfolioLinks.length > 0 || portfolioFiles.length > 0) && (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <Headphones size={14} className="text-primary-400" />
                  <span className="text-sm font-semibold text-white">Портфолио</span>
                </div>
                <div className="flex border-b border-slate-800/60">
                  {([
                    { key: 'audio' as const, label: 'Аудио', count: audioLinks.length },
                    { key: 'video' as const, label: 'Видео', count: videoLinks.length },
                    { key: 'other' as const, label: 'Прочее', count: portfolioFiles.length },
                  ]).map(tab => (
                    <button key={tab.key} onClick={() => setPortfolioTab(tab.key)}
                      className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-all ${portfolioTab === tab.key ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                      {tab.label}{tab.count > 0 && <span className="ml-1 opacity-60">({tab.count})</span>}
                    </button>
                  ))}
                </div>
                <div className="p-4 space-y-3">
                  {portfolioTab === 'audio' && (audioLinks.length === 0
                    ? <p className="text-sm text-slate-600 italic text-center py-2">Нет аудио ссылок</p>
                    : audioLinks.map((l: any) => <PortfolioAudioItem key={l.id} link={l} />)
                  )}
                  {portfolioTab === 'video' && (videoLinks.length === 0
                    ? <p className="text-sm text-slate-600 italic text-center py-2">Нет видео ссылок</p>
                    : videoLinks.map((l: any) => <PortfolioVideoItem key={l.id} link={l} />)
                  )}
                  {portfolioTab === 'other' && (portfolioFiles.length === 0
                    ? <p className="text-sm text-slate-600 italic text-center py-2">Нет документов</p>
                    : <div className="space-y-1.5">
                        {portfolioFiles.map((f: any) => (
                          <a key={f.id} href={`${API_URL}${f.url}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-700/40 border border-slate-700/40 transition-colors group">
                            <DocIcon mimeType={f.mimeType} name={f.originalName} />
                            <span className="flex-1 text-sm text-slate-300 truncate group-hover:text-white transition-colors">{f.originalName}</span>
                            <span className="text-xs text-slate-600 flex-shrink-0">{formatFileSize(f.size)}</span>
                          </a>
                        ))}
                      </div>
                  )}
                </div>
              </div>
            )}

            {/* Connections */}
            {userConnections.length > 0 && (() => {
              const LIMIT = 4;
              const visible = connExpanded ? userConnections : userConnections.slice(0, LIMIT);
              return (
                <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                    <Link2 size={14} className="text-primary-400" />
                    <span className="text-sm font-semibold text-white">Профессиональные связи</span>
                    <span className="ml-auto text-xs text-slate-500">{userConnections.length}</span>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {visible.map((c: any) => (
                        <button key={c.id} onClick={() => navigate(`/profile/${c.partner.id}`)} className="text-left p-3 bg-slate-800/40 border border-slate-700/40 rounded-xl hover:border-primary-500/30 hover:bg-slate-800/70 transition-all">
                          <div className="flex items-center gap-2.5 mb-2">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-700 flex-shrink-0">
                              {getAvatarUrl(c.partner.avatar)
                                ? <img src={getAvatarUrl(c.partner.avatar)!} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full bg-primary-600/30 flex items-center justify-center text-xs text-primary-300 font-bold">{c.partner.firstName?.[0]}</div>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate leading-tight">{c.partner.firstName} {c.partner.lastName}</p>
                              {c.partner.city && <p className="text-[11px] text-slate-500 truncate">{c.partner.city}</p>}
                            </div>
                          </div>
                          {c.services?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {c.services.slice(0, 2).map((s: any) => (
                                <span key={s.id} className="text-[10px] bg-primary-500/10 text-primary-300 border border-primary-500/20 rounded px-1.5 py-0.5">{s.name}</span>
                              ))}
                              {c.services.length > 2 && <span className="text-[10px] bg-slate-700/60 text-slate-400 rounded px-1.5 py-0.5">+{c.services.length - 2}</span>}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    {userConnections.length > LIMIT && (
                      <button onClick={() => setConnExpanded(v => !v)} className="mt-3 w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors text-center">
                        {connExpanded ? 'Свернуть' : `Показать ещё ${userConnections.length - LIMIT}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      </div>
    </div>

    {/* Services panel */}
    <BottomPanel open={servicesOpen} onClose={() => setServicesOpen(false)} title={`Услуги (${servicesFlat.length})`}>
      <div className="space-y-2">
        {servicesFlat.map((us: any) => {
          const price = us.priceFrom != null || us.priceTo != null
            ? [us.priceFrom != null ? `от ${us.priceFrom} ₽` : null, us.priceTo != null ? `до ${us.priceTo} ₽` : null].filter(Boolean).join(' ')
            : null;
          return (
            <div key={us.id} className="p-3 bg-slate-800/40 border border-slate-700/40 rounded-xl">
              <p className="text-[10px] text-slate-500 mb-0.5">{us._profName}</p>
              <p className="text-sm font-bold text-white">{us.service?.name}</p>
              {price && <p className="text-xs text-primary-400 mt-1">{price}</p>}
            </div>
          );
        })}
      </div>
    </BottomPanel>
    </>
  );
}
