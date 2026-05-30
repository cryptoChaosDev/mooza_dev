import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, MessageCircle,
  Crown, BadgeCheck, Ban, X, Zap,
  Headphones, FileText, Briefcase,
  Link2, Star, UserPlus, UserCheck, UserX, Clock, Music2,
  Globe, Play, Pause, ChevronRight, Flag, Phone, Calendar,
  MoreHorizontal, Share2, Check,
} from 'lucide-react';
import { userAPI, connectionAPI, favoriteAPI, friendshipAPI } from '../lib/api';
import ComplaintModal from '../components/ComplaintModal';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { SocialIconRow, CONTACT_KEYS, SOCIAL_KEYS } from '../components/SocialLinks';
import AvatarComponent from '../components/Avatar';
import BadgeTooltip from '../components/BadgeTooltip';
import ConnectionRequestModal from '../components/ConnectionRequestModal';
import ConnectionViewModal from '../components/ConnectionViewModal';
import ReviewsBlock from '../components/ReviewsBlock';
import { useAuthStore } from '../stores/authStore';
import { formatLastSeen } from '../lib/lastSeen';
import { usePresenceStore } from '../stores/presenceStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function getFileExt(name: string) {
  return (name.split('.').pop() ?? '').toUpperCase().slice(0, 4);
}

function AudioTile({ url, title }: { url: string; title?: string }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement>(null);
  const toggle = () => {
    if (!ref.current) return;
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { ref.current.play(); setPlaying(true); }
  };
  return (
    <div className="flex flex-col gap-1 flex-shrink-0" style={{ width: 'calc((100% - 24px) / 3.5)' }}>
      <button
        onClick={toggle}
        className="w-full aspect-square rounded-xl bg-gradient-to-br from-primary-900/80 to-slate-800/80 border border-primary-700/30 flex flex-col items-center justify-center gap-2 hover:border-primary-500/50 transition-colors group"
      >
        <Music2 size={16} className="text-primary-400" />
        <div className="w-7 h-7 rounded-full bg-primary-600/80 flex items-center justify-center group-hover:bg-primary-500 transition-colors">
          {playing ? <Pause size={12} className="text-white" /> : <Play size={12} className="text-white ml-0.5" />}
        </div>
      </button>
      {title && <p className="text-[9px] text-slate-400 text-center leading-tight line-clamp-2">{title}</p>}
      <audio ref={ref} src={url} onEnded={() => setPlaying(false)} preload="none" />
    </div>
  );
}

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuthStore(s => s.user);
  const onlineUsers = usePresenceStore(s => s.onlineUsers);

  const [showConnModal, setShowConnModal] = useState(false);
  const [viewConn, setViewConn] = useState<any>(null);
  const [showComplaint, setShowComplaint] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [portfolioTab, setPortfolioTab] = useState<'audio' | 'images' | 'other'>('audio');
  const [imageFullscreen, setImageFullscreen] = useState<string | null>(null);
  const [docFullscreen, setDocFullscreen] = useState<{ url: string; name: string } | null>(null);
  const [selectedProfession, setSelectedProfession] = useState<any>(null);
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
    queryFn: async () => { const { data } = await connectionAPI.getWith(userId!); return data as any; },
    enabled: !!userId && !!me && me.id !== userId,
  });

  const { data: favStatus } = useQuery({
    queryKey: ['favorite-status', userId],
    queryFn: async () => { const { data } = await favoriteAPI.status(userId!); return data as { isFavorite: boolean }; },
    enabled: !!userId && !!me && me.id !== userId,
  });


  const addFavMut = useMutation({
    mutationFn: () => favoriteAPI.add(userId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorite-status', userId] }),
  });
  const removeFavMut = useMutation({
    mutationFn: () => favoriteAPI.remove(userId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorite-status', userId] }),
  });
  const sendFriendMut = useMutation({
    mutationFn: () => friendshipAPI.sendRequest(userId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', userId] }),
  });
  const cancelFriendMut = useMutation({
    mutationFn: () => {
      if (!user?.friendshipId) throw new Error('No friendshipId');
      return friendshipAPI.rejectRequest(user.friendshipId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', userId] }),
  });
  const acceptFriendMut = useMutation({
    mutationFn: () => {
      if (!user?.friendshipId) throw new Error('No friendshipId');
      return friendshipAPI.acceptRequest(user.friendshipId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', userId] }),
  });
  const removeFriendMut = useMutation({
    mutationFn: () => {
      if (!user?.friendshipId) throw new Error('No friendshipId');
      return friendshipAPI.removeFriend(user.friendshipId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', userId] }),
  });

  const handleShareProfile = async () => {
    const fullUrl = `${window.location.origin}/profile/${userId}`;
    const title = user ? `${user.firstName} ${user.lastName} — Moooza` : 'Профиль — Moooza';
    if (navigator.share) {
      try { await navigator.share({ title, text: user?.bio?.slice(0, 100), url: fullUrl }); } catch { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(fullUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch { /* ignore */ }
    }
    setShowMenu(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent mx-auto" />
          <p className="text-slate-400 mt-3 text-sm">Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 gap-3">
        <p className="text-slate-400 text-sm">Пользователь не найден</p>
        <button onClick={() => navigate(-1)} className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-xl text-sm">Назад</button>
      </div>
    );
  }

  const servicesFlat: any[] = user.userServices ?? [];
  const portfolioFiles: any[] = user.portfolioFiles ?? [];
  const portfolioLinks: any[] = user.portfolioLinks ?? [];
  const audioLinks = portfolioLinks.filter((l: any) => l.type === 'audio');
  const audioFiles = portfolioFiles.filter((f: any) => f.mimeType?.startsWith('audio/'));
  const imageFiles = portfolioFiles.filter((f: any) => f.mimeType?.startsWith('image/'));
  const otherFiles = portfolioFiles.filter((f: any) => !f.mimeType?.startsWith('audio/') && !f.mimeType?.startsWith('image/'));
  const allAudio = [...audioFiles, ...audioLinks];
  const hasPortfolio = allAudio.length > 0 || imageFiles.length > 0 || otherFiles.length > 0;
  const socialLinksMap = (user.socialLinks as Record<string, string>) || {};
  const hasContactLinks = CONTACT_KEYS.some(k => socialLinksMap[k]);
  const hasSocialNetworkLinks = SOCIAL_KEYS.some(k => socialLinksMap[k]);
  const bUrl = user.bannerImage ? getAvatarUrl(user.bannerImage) : null;
  const isMe = me?.id === user.id;

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

        {/* ── HERO ── */}
        <div className="relative">
          <div className="h-44 overflow-hidden bg-gradient-to-br from-primary-900 via-purple-900/70 to-slate-900">
            {bUrl
              ? <img src={bUrl} alt="" className="w-full h-full object-cover" />
              : <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.8) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(168,85,247,0.7) 0%, transparent 60%)' }} />
            }
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
          </div>
          <button
            onClick={() => navigate(-1)}
            className="absolute top-3 left-3 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-xl transition-all"
            style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        <div className="px-4">
          {/* ── Avatar ── */}
          <div className="flex items-end justify-between -mt-14 mb-4">
            <div className="relative z-10 flex-shrink-0">
              <div className="rounded-full ring-4 ring-slate-950 shadow-2xl">
                <AvatarComponent src={user.avatar} name={`${user.firstName} ${user.lastName}`} size={112} />
              </div>
            </div>

            {me && !isMe && showComplaint && (
              <ComplaintModal targetType="user" targetId={user.id} onClose={() => setShowComplaint(false)} />
            )}
          </div>

          {/* ── Name + badges ── */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h1 className="text-2xl font-bold text-white leading-tight">{user.firstName} {user.lastName}</h1>
            {user.isPro && <BadgeTooltip label="PRO аккаунт"><Zap size={18} className="text-violet-400" /></BadgeTooltip>}
            {user.isPremium && <BadgeTooltip label="Premium"><Crown size={18} className="text-amber-400" /></BadgeTooltip>}
            {user.isVerified && <BadgeTooltip label="Верифицирован"><BadgeCheck size={18} className="text-sky-400" /></BadgeTooltip>}
            {(user._count?.referrals ?? 0) >= 100 && <BadgeTooltip label="Амбасадор Moooza"><Star size={18} className="text-orange-400" /></BadgeTooltip>}
            {user.isBlocked && <BadgeTooltip label="Заблокирован"><Ban size={18} className="text-red-500" /></BadgeTooltip>}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-400 mb-2">
            {user.nickname && <span className="text-slate-500">@{user.nickname}</span>}
            {(user.city || user.country) && (
              <span className="flex items-center gap-1">
                <MapPin size={12} className="flex-shrink-0" />
                {[user.city, user.country].filter(Boolean).join(', ')}
              </span>
            )}
            {user.birthDate && (() => {
              const age = Math.floor((Date.now() - new Date(user.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000));
              return (
                <span className="flex items-center gap-1">
                  <Calendar size={12} className="flex-shrink-0" />
                  {age} {age % 10 === 1 && age % 100 !== 11 ? 'год' : (age % 10 >= 2 && age % 10 <= 4 && (age % 100 < 10 || age % 100 >= 20) ? 'года' : 'лет')}
                </span>
              );
            })()}
            {!isMe && (
              onlineUsers.has(user.id)
                ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />В сети</span>
                : user.lastSeenAt
                  ? <span className="text-xs text-slate-600">{formatLastSeen(user.lastSeenAt)}</span>
                  : null
            )}
            {!isMe && user.avgResponseMinutes != null && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock size={11} />
                Обычно отвечает за {user.avgResponseMinutes < 60
                  ? `${user.avgResponseMinutes} мин`
                  : `${Math.round(user.avgResponseMinutes / 60)} ч`}
              </span>
            )}
          </div>

          {/* ── Occupancy status ── */}
          {user.occupancyStatus && (
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg border font-medium mb-3 ${
              user.occupancyStatus === 'open' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' :
              user.occupancyStatus === 'considering' ? 'text-amber-400 border-amber-500/20 bg-amber-500/10' :
              'text-red-400 border-red-500/20 bg-red-500/10'
            }`}>
              {user.occupancyStatus === 'open' ? '🟢 Открыт для работы' :
               user.occupancyStatus === 'considering' ? '🟡 Рассматриваю предложения' :
               '🔴 Не беру заказы'}
            </span>
          )}

          {/* ── Action buttons ── */}
          {me && !isMe && (
            <div className="flex items-stretch gap-2 mb-5">
              {/* Primary: Message */}
              <button
                onClick={() => navigate(`/messages/${user.id}`)}
                className="flex items-center justify-center px-3.5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl transition-all shadow-lg shadow-primary-500/20"
                title="Написать сообщение"
              >
                <MessageCircle size={18} />
              </button>

              {/* Connection — style depends on status */}
              {conn?.status === 'ACCEPTED' ? (
                <button
                  onClick={() => navigate(`/connection/${user.id}`, { state: { partner: user, connections: [conn] } })}
                  className="flex items-center justify-center px-3.5 py-2.5 bg-violet-500/15 border border-violet-500/30 text-violet-400 rounded-xl transition-all"
                  title="Связь установлена"
                >
                  <Link2 size={18} />
                </button>
              ) : conn?.status === 'PENDING' && conn.iAmRequester ? (
                <button
                  onClick={() => setViewConn(conn)}
                  className="flex items-center justify-center px-3.5 py-2.5 bg-slate-800/80 border border-slate-700/60 text-slate-500 rounded-xl transition-all"
                  title="Запрос отправлен"
                >
                  <Clock size={18} />
                </button>
              ) : conn?.status === 'PENDING' && !conn.iAmRequester ? (
                <button
                  onClick={() => setViewConn(conn)}
                  className="flex items-center justify-center px-3.5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl transition-all"
                  title="Входящий запрос на связь"
                >
                  <Link2 size={18} />
                </button>
              ) : (
                <button
                  onClick={() => setShowConnModal(true)}
                  className="flex items-center justify-center px-3.5 py-2.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-primary-400 rounded-xl transition-all"
                  title="Установить связь"
                >
                  <Link2 size={18} />
                </button>
              )}

              {/* Friend — style depends on status */}
              {user.friendshipStatus === 'none' && (
                <button
                  onClick={() => sendFriendMut.mutate()}
                  disabled={sendFriendMut.isPending}
                  className="flex items-center justify-center px-3.5 py-2.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-primary-400 rounded-xl transition-all disabled:opacity-50"
                  title="Добавить в друзья"
                >
                  <UserPlus size={18} />
                </button>
              )}
              {user.friendshipStatus === 'pending_sent' && (
                <button
                  onClick={() => cancelFriendMut.mutate()}
                  disabled={cancelFriendMut.isPending}
                  className="flex items-center justify-center px-3.5 py-2.5 bg-slate-800/80 border border-slate-700/60 text-slate-500 rounded-xl transition-all disabled:opacity-50"
                  title="Отменить заявку"
                >
                  <Clock size={18} />
                </button>
              )}
              {user.friendshipStatus === 'pending_received' && (
                <>
                  <button
                    onClick={() => acceptFriendMut.mutate()}
                    disabled={acceptFriendMut.isPending}
                    className="flex items-center justify-center px-3.5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl transition-all disabled:opacity-50"
                    title="Принять заявку"
                  >
                    <UserCheck size={18} />
                  </button>
                  <button
                    onClick={() => cancelFriendMut.mutate()}
                    disabled={cancelFriendMut.isPending}
                    className="flex items-center justify-center px-3.5 py-2.5 bg-slate-800/80 border border-slate-700/60 text-slate-400 hover:text-red-400 rounded-xl transition-all disabled:opacity-50"
                    title="Отклонить заявку"
                  >
                    <UserX size={18} />
                  </button>
                </>
              )}
              {user.friendshipStatus === 'accepted' && (
                <button
                  onClick={() => removeFriendMut.mutate()}
                  disabled={removeFriendMut.isPending}
                  className="flex items-center justify-center px-3.5 py-2.5 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl transition-all disabled:opacity-50"
                  title="В друзьях — нажмите, чтобы удалить"
                >
                  <UserCheck size={18} />
                </button>
              )}

              {/* Overflow menu: favorite, share, report */}
              <div className="relative">
                <button
                  onClick={() => setShowMenu(v => !v)}
                  className="flex items-center justify-center h-full px-3 py-2.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-white rounded-xl transition-all"
                  title="Ещё"
                >
                  <MoreHorizontal size={18} />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-52 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 py-1">
                      {/* Favorite */}
                      {favStatus !== undefined && (
                        favStatus.isFavorite ? (
                          <button
                            onClick={() => { removeFavMut.mutate(); setShowMenu(false); }}
                            disabled={removeFavMut.isPending}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-amber-400 hover:bg-slate-800 transition-colors"
                          >
                            <Star size={16} fill="currentColor" /> Убрать из избранного
                          </button>
                        ) : (
                          <button
                            onClick={() => { addFavMut.mutate(); setShowMenu(false); }}
                            disabled={addFavMut.isPending}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-amber-400 transition-colors"
                          >
                            <Star size={16} /> В избранное
                          </button>
                        )
                      )}
                      {/* Share */}
                      <button
                        onClick={handleShareProfile}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                      >
                        {shareCopied ? <Check size={16} className="text-emerald-400" /> : <Share2 size={16} />}
                        {shareCopied ? 'Ссылка скопирована' : 'Поделиться'}
                      </button>
                      {/* Report */}
                      <div className="my-1 border-t border-slate-800" />
                      <button
                        onClick={() => { setShowComplaint(true); setShowMenu(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/8 transition-colors"
                      >
                        <Flag size={16} /> Пожаловаться
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Stats row ── */}
          <div className="grid grid-cols-2 divide-x divide-slate-800 mb-5 bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
            <button
              onClick={() => navigate(`/profile/${userId}/connections`)}
              className="flex flex-col items-center py-1.5 px-1 hover:bg-slate-800/40 transition-colors"
            >
              <span className="text-sm font-bold text-white">{userConnections.length}</span>
              <span className="text-[9px] text-slate-500">Связи</span>
            </button>
            <div className="flex flex-col items-center py-1.5 px-1">
              <span className="text-sm font-bold text-white">{user.dealsCount ?? 0}</span>
              <span className="text-[9px] text-slate-500">Сделки</span>
            </div>
          </div>

          <div className="space-y-3">

            {/* Bio */}
            {user.bio && (
              <p className="text-slate-300 text-sm leading-relaxed break-words">{user.bio}</p>
            )}

            {/* ── Artists ── */}
            {(user.userArtists?.length ?? 0) > 0 && (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <Music2 size={14} className="text-primary-400" />
                  <span className="text-sm font-bold text-white">Артисты</span>
                </div>
                <div className="p-3">
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                    {user.userArtists.filter((ua: any) => ua.artist?.name).map((ua: any) => {
                      const role = ua.profession?.name ?? (ua.isOwner ? 'Основатель' : null);
                      return (
                        <button
                          key={ua.artistId ?? ua.artist?.id}
                          onClick={() => navigate('/artist/' + (ua.artist?.id ?? ua.artistId))}
                          className="flex flex-col gap-1.5 flex-shrink-0 text-left group"
                          style={{ width: 'calc((100% - 24px) / 3.5)' }}
                        >
                          <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-primary-800/60 to-purple-800/60 border border-primary-600/30 flex items-center justify-center overflow-hidden group-hover:border-primary-500/60 transition-colors">
                            {ua.artist?.avatar
                              ? <img src={getAvatarUrl(ua.artist.avatar) ?? ''} alt={ua.artist.name} className="w-full h-full object-cover" />
                              : <Music2 size={16} className="text-primary-400" />
                            }
                          </div>
                          <div className="w-full">
                            <p className="text-[10px] font-semibold text-white leading-tight line-clamp-2">{ua.artist?.name}</p>
                            {role && <p className="text-[9px] text-slate-500 leading-tight mt-0.5 truncate">{role}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Professions ── */}
            {(user.userProfessions?.length ?? 0) > 0 && (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <Briefcase size={14} className="text-primary-400" />
                  <span className="text-sm font-semibold text-white">Профессии</span>
                </div>
                <div className="px-4 pt-3 pb-3">
                  <p className="text-sm leading-relaxed">
                    {user.userProfessions.map((up: any, i: number) => (
                      <span key={up.professionId ?? i}>
                        <button
                          onClick={() => setSelectedProfession(up)}
                          className="text-primary-400 hover:text-primary-300 font-medium underline underline-offset-2 decoration-primary-500/40 hover:decoration-primary-400 transition-colors"
                        >
                          {up.profession?.name}
                        </button>
                        {i < user.userProfessions.length - 1 && <span className="text-slate-500">, </span>}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            )}

            {/* ── Services ── */}
            {servicesFlat.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <Briefcase size={14} className="text-primary-400" />
                  <span className="text-sm font-semibold text-white">Услуги</span>
                  <span className="text-xs text-slate-500">{servicesFlat.length}</span>
                  <button
                    onClick={() => navigate(`/profile/${userId}/services`)}
                    className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                  >
                    Смотреть все
                  </button>
                </div>
                <div className="p-3">
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                    {servicesFlat.map((us: any) => {
                      const price = us.priceFrom != null || us.priceTo != null
                        ? [us.priceFrom != null ? `от ${us.priceFrom} ₽` : null, us.priceTo != null ? `до ${us.priceTo} ₽` : null].filter(Boolean).join(' ')
                        : null;
                      return (
                        <button
                          key={us.id}
                          onClick={() => navigate(`/services/${us.id}`)}
                          className="flex flex-col flex-shrink-0 text-left group"
                          style={{ width: 'calc((100% - 24px) / 3.5)' }}
                        >
                          <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-primary-900/80 to-slate-800/80 border border-primary-700/30 flex items-center justify-center group-hover:border-primary-500/50 transition-colors">
                            <Briefcase size={16} className="text-primary-400" />
                          </div>
                          <div className="w-full mt-1.5">
                            <p className="text-[10px] font-semibold text-white leading-tight line-clamp-2">{us.service?.name}</p>
                            {price && <p className="text-[9px] text-primary-400 leading-tight mt-0.5">{price}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Reviews ── */}
            {userId && <ReviewsBlock userId={userId} isOwner={false} />}

            {/* ── Portfolio ── */}
            {hasPortfolio && (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <Headphones size={14} className="text-primary-400" />
                  <span className="text-sm font-semibold text-white">Портфолио</span>
                </div>
                <div className="flex border-b border-slate-800/60">
                  {([
                    { key: 'audio' as const, label: 'Аудио', count: allAudio.length },
                    { key: 'images' as const, label: 'Изображения', count: imageFiles.length },
                    { key: 'other' as const, label: 'Другое', count: otherFiles.length },
                  ]).map(tab => (
                    <button key={tab.key} onClick={() => setPortfolioTab(tab.key)}
                      className={`flex-1 py-2 text-xs font-medium transition-colors relative ${portfolioTab === tab.key ? 'text-primary-400' : 'text-slate-500 hover:text-slate-300'}`}>
                      {tab.label}
                      {tab.count > 0 && <span className="ml-1 text-[10px] opacity-70">{tab.count}</span>}
                      {portfolioTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" />}
                    </button>
                  ))}
                </div>
                <div className="px-3 py-3">
                  {portfolioTab === 'audio' && (
                    allAudio.length === 0
                      ? <p className="text-sm text-slate-600 italic text-center py-2">Нет аудио</p>
                      : <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                          {audioFiles.map((f: any) => <AudioTile key={f.id} url={`${API_URL}${f.url}`} title={f.originalName} />)}
                          {audioLinks.map((l: any) => <AudioTile key={l.id} url={l.url} title={l.title} />)}
                        </div>
                  )}
                  {portfolioTab === 'images' && (
                    imageFiles.length === 0
                      ? <p className="text-sm text-slate-600 italic text-center py-2">Нет изображений</p>
                      : <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                          {imageFiles.map((f: any) => (
                            <button
                              key={f.id}
                              onClick={() => setImageFullscreen(`${API_URL}${f.url}`)}
                              className="flex-shrink-0 rounded-xl overflow-hidden border border-slate-700/40 hover:border-primary-500/40 transition-colors"
                              style={{ width: 'calc((100% - 24px) / 3.5)' }}
                            >
                              <img src={`${API_URL}${f.url}`} alt={f.originalName} className="w-full aspect-square object-cover" />
                            </button>
                          ))}
                        </div>
                  )}
                  {portfolioTab === 'other' && (
                    otherFiles.length === 0
                      ? <p className="text-sm text-slate-600 italic text-center py-2">Нет документов</p>
                      : <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                          {otherFiles.map((f: any) => (
                            <button
                              key={f.id}
                              onClick={() => setDocFullscreen({ url: `${API_URL}${f.url}`, name: f.originalName })}
                              className="flex flex-col gap-1 flex-shrink-0"
                              style={{ width: 'calc((100% - 24px) / 3.5)' }}
                            >
                              <div className="w-full aspect-square rounded-xl bg-slate-800/60 border border-slate-700/40 hover:border-primary-500/40 flex flex-col items-center justify-center gap-1 transition-colors">
                                <span className="text-sm font-black text-primary-400">{getFileExt(f.originalName)}</span>
                                <FileText size={13} className="text-slate-500" />
                              </div>
                              <p className="text-[9px] text-slate-400 text-center leading-tight line-clamp-2">{f.originalName}</p>
                            </button>
                          ))}
                        </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Connections ── */}
            {userConnections.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <Link2 size={14} className="text-primary-400" />
                  <span className="text-sm font-semibold text-white">Связи</span>
                  <span className="text-xs text-slate-500">{userConnections.length}</span>
                  {userConnections.length > 3 && (
                    <button
                      onClick={() => navigate(`/profile/${userId}/connections`)}
                      className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                    >
                      Смотреть все
                    </button>
                  )}
                </div>
                <div className="divide-y divide-slate-800/40">
                  {userConnections.slice(0, 3).map((c: any) => {
                    const subtitle = c.services?.slice(0, 2).map((s: any) => s.name).join(', ') || null;
                    return (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/profile/${c.partner.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/40 transition-colors text-left"
                      >
                        <AvatarComponent src={c.partner.avatar} name={`${c.partner.firstName} ${c.partner.lastName}`} size={36} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{c.partner.firstName} {c.partner.lastName}</p>
                          {subtitle && <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>}
                        </div>
                        <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Contacts — visible only to users with a filled profile ── */}
            {hasContactLinks && (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <Phone size={14} className="text-primary-400" />
                  <span className="text-sm font-semibold text-white">Контакты</span>
                </div>
                <div className="p-4">
                  {!me ? (
                    <p className="text-xs text-slate-500 italic">Войдите, чтобы видеть контакты</p>
                  ) : !(me.firstName && me.lastName && me.avatar) ? (
                    <p className="text-xs text-slate-500 italic">Заполните свой профиль (имя, фото), чтобы видеть контакты</p>
                  ) : (
                    <SocialIconRow only={CONTACT_KEYS} links={(user.socialLinks as Record<string, string>) || {}} />
                  )}
                </div>
              </div>
            )}

            {/* ── Social networks ── */}
            {hasSocialNetworkLinks && (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <Globe size={14} className="text-primary-400" />
                  <span className="text-sm font-semibold text-white">Соц.сети</span>
                </div>
                <div className="p-4">
                  <SocialIconRow only={SOCIAL_KEYS} links={(user.socialLinks as Record<string, string>) || {}} />
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>

    {/* ── Image fullscreen ── */}
    {imageFullscreen && (
      <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setImageFullscreen(null)}>
        <button onClick={() => setImageFullscreen(null)} className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-white z-10">
          <X size={20} />
        </button>
        <img src={imageFullscreen} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
      </div>
    )}

    {/* ── Document fullscreen ── */}
    {docFullscreen && (
      <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
          <span className="text-sm text-slate-300 truncate">{docFullscreen.name}</span>
          <button onClick={() => setDocFullscreen(null)} className="p-2 rounded-full bg-slate-800 text-white flex-shrink-0">
            <X size={20} />
          </button>
        </div>
        <iframe src={docFullscreen.url} className="flex-1 w-full border-0" title={docFullscreen.name} />
      </div>
    )}

    {/* ── Profession popup ── */}
    {selectedProfession && createPortal(
      <>
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={() => setSelectedProfession(null)} />
        <div
          className="fixed inset-x-0 bottom-0 z-[71] bg-slate-900 border-t border-slate-800 rounded-t-3xl"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 mb-1" />
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
            <h3 className="text-base font-bold text-white">{selectedProfession.profession?.name}</h3>
            <button onClick={() => setSelectedProfession(null)} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
          <div className="px-5 py-4">
            {(() => {
              const related = (user.userServices ?? []).filter(
                (us: any) => us.professionId === selectedProfession.professionId
              );
              if (related.length === 0) {
                return <p className="text-sm text-slate-500 text-center py-4">Нет услуг для этой профессии</p>;
              }
              return (
                <div className="space-y-3">
                  {related.map((us: any) => (
                    <button
                      key={us.id}
                      onClick={() => { setSelectedProfession(null); navigate(`/services/${us.id}`); }}
                      className="w-full flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3 text-left hover:bg-slate-800 transition-colors"
                    >
                      <Briefcase size={16} className="text-primary-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{us.service?.name}</p>
                        {(us.priceFrom || us.priceTo) && (
                          <p className="text-xs text-primary-400 mt-0.5">
                            {[us.priceFrom && `от ${us.priceFrom} ₽`, us.priceTo && `до ${us.priceTo} ₽`].filter(Boolean).join(' ')}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </>,
      document.body
    )}
    </>
  );
}
