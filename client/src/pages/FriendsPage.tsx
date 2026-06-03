import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, MessageCircle, UserX, Clock,
  Search, Wifi, Link2, Star, Crown, BadgeCheck,
  ChevronRight,
} from 'lucide-react';
import { friendshipAPI, connectionAPI, favoriteAPI, artistAPI, postAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';
import { usePresenceStore } from '../stores/presenceStore';
import { formatLastSeen } from '../lib/lastSeen';
import ConnectionViewModal from '../components/ConnectionViewModal';

import ConfirmDialog from '../components/ConfirmDialog';

type Tab = 'friends' | 'connections' | 'favorites';


function SectionHeader({ label, danger }: { label: string; count?: number; danger?: boolean }) {
  return (
    <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center gap-2">
      <span className={`text-xs font-semibold uppercase tracking-wide ${danger ? 'text-red-500/70' : 'text-slate-500'}`}>{label}</span>
    </div>
  );
}

export default function FriendsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'friends');
  const [viewConn, setViewConn] = useState<any>(null);

  const [confirmRemoveFriend, setConfirmRemoveFriend] = useState<string | null>(null);
  const [confirmRemoveFav, setConfirmRemoveFav] = useState<string | null>(null);
  const [favSubTab, setFavSubTab] = useState<'people' | 'artists' | 'posts'>('people');

  useEffect(() => {
    const tab = searchParams.get('tab') as Tab | null;
    if (tab && ['friends', 'connections', 'favorites'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);
  const [search, setSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [pinnedIds] = useState<string[]>([]);

  const onlineUsers = usePresenceStore((s) => s.onlineUsers);

  // ── Friends ──
  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => { const { data } = await friendshipAPI.getFriends(); return data; },
  });
  const { data: requests = [] } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: async () => { const { data } = await friendshipAPI.getRequests(); return data; },
  });
  const { data: sentRequests = [] } = useQuery({
    queryKey: ['friend-requests-sent'],
    queryFn: async () => { const { data } = await friendshipAPI.getSentRequests(); return data; },
  });

  // ── Connections ──
  const { data: connectionsRaw = [] } = useQuery({
    queryKey: ['connections-all'],
    queryFn: async () => { const { data } = await connectionAPI.getAll(); return data as any[]; },
  });
  // Group by partner — one entry per unique person
  const connPartners: { partner: any; connections: any[] }[] = Array.from(
    connectionsRaw.reduce((map: Map<string, { partner: any; connections: any[] }>, c: any) => {
      const pid = c.partner.id;
      if (!map.has(pid)) map.set(pid, { partner: c.partner, connections: [] });
      map.get(pid)!.connections.push(c);
      return map;
    }, new Map()).values()
  );
  const { data: connRequests = [] } = useQuery({
    queryKey: ['connections-requests'],
    queryFn: async () => { const { data } = await connectionAPI.getRequests(); return data; },
  });
  const { data: connSent = [] } = useQuery({
    queryKey: ['connections-sent'],
    queryFn: async () => { const { data } = await connectionAPI.getSent(); return data; },
  });
const { data: myBreakRequests = [] } = useQuery({
    queryKey: ['connections-my-break-requests'],
    queryFn: async () => { const { data } = await connectionAPI.getMyBreakRequests(); return data; },
  });
  const { data: connRejected = [] } = useQuery({
    queryKey: ['connections-rejected'],
    queryFn: async () => { const { data } = await connectionAPI.getRejected(); return data; },
  });
  const { data: connHistory = [] } = useQuery({
    queryKey: ['connections-history'],
    queryFn: async () => { const { data } = await connectionAPI.getHistory(); return data; },
  });

  // ── Favorites (people) ──
  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => { const { data } = await favoriteAPI.list(); return data; },
  });

  // ── Followed artists ──
  const { data: followedArtists = [] } = useQuery({
    queryKey: ['followed-artists'],
    queryFn: async () => { const { data } = await artistAPI.getFollowing(); return data as any[]; },
  });

  // ── Saved posts ──
  const { data: savedPosts = [] } = useQuery({
    queryKey: ['saved-posts'],
    queryFn: async () => { const { data } = await postAPI.getSavedPosts(); return data as any[]; },
  });

  // ── Mutations (friends) ──
  const removeMutation = useMutation({
    mutationFn: friendshipAPI.removeFriend,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['friends'] }); },
  });

  // ── Mutations (favorites) ──
  const removeFavMutation = useMutation({
    mutationFn: (targetId: string) => favoriteAPI.remove(targetId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['favorites'] }); },
  });


  const filteredFriends = useMemo(() => {
    return friends
      .map((item: any) => ({ ...item, friend: item.user ?? item }))
      .filter(({ friend }: any) => {
        const q = search.toLowerCase();
        const matchesSearch = !q ||
          `${friend.firstName} ${friend.lastName}`.toLowerCase().includes(q) ||
          (friend.role ?? '').toLowerCase().includes(q) ||
          (friend.city ?? '').toLowerCase().includes(q);
        const matchesOnline = !onlineOnly || onlineUsers.has(friend.id);
        return matchesSearch && matchesOnline;
      })
      .sort((a: any, b: any) => {
        const aPin = pinnedIds.includes(a.friend.id);
        const bPin = pinnedIds.includes(b.friend.id);
        if (aPin !== bPin) return aPin ? -1 : 1;
        return `${a.friend.firstName} ${a.friend.lastName}`.localeCompare(`${b.friend.firstName} ${b.friend.lastName}`);
      });
  }, [friends, search, onlineOnly, pinnedIds, onlineUsers]);

  const friendsBadge = requests.length;
  const connBadge = connRequests.length;

  const TABS: { id: Tab; label: string; badge: number }[] = [
    { id: 'friends',     label: 'Друзья',   badge: friendsBadge },
    { id: 'connections', label: 'Связи',    badge: connBadge },
    { id: 'favorites',   label: 'Избранное', badge: 0 },
  ];

  const UserAvatar = ({ user, showPresence = false }: { user: any; showPresence?: boolean }) => {
    const isOnline = showPresence && onlineUsers.has(user.id);
    return (
      <div className="relative inline-block flex-shrink-0">
        <AvatarComponent src={user.avatar} name={`${user.firstName} ${user.lastName}`} size={44} />
        {isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />}
      </div>
    );
  };

  return (
    <>
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <Users size={20} className="text-primary-400" />
              <h2 className="text-lg font-bold text-white flex-1">Отношения</h2>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 mb-3">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === tab.id ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Search + filters (friends tab only) */}
            {activeTab === 'friends' && (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск по имени, роли, городу..."
                    className="w-full bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-500 pl-8 pr-3 py-2 rounded-xl outline-none focus:border-primary-600 transition-colors"
                  />
                </div>
                <button
                  onClick={() => setOnlineOnly(o => !o)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                    onlineOnly ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Wifi size={13} /> Онлайн
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pb-24">

          {/* ══ FRIENDS TAB ══ */}
          {activeTab === 'friends' && (
            <div>
              {/* Requests navigator */}
              <button
                onClick={() => navigate('/friends/requests')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors border-b border-slate-800/60 text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary-500/15 flex items-center justify-center flex-shrink-0">
                  <Users size={18} className="text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Запросы дружбы</p>
                  <p className="text-xs text-slate-500">
                    {requests.length > 0 ? `${requests.length} новых` : sentRequests.length > 0 ? `${sentRequests.length} отправлено` : 'Нет новых запросов'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
              </button>

              {friends.length > 0 && <SectionHeader label="Список друзей" count={friends.length} />}

              {friendsLoading ? (
                <div className="divide-y divide-slate-800/60">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                      <div className="w-11 h-11 rounded-full bg-slate-800 flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-slate-800 rounded w-2/5" />
                        <div className="h-3 bg-slate-800 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredFriends.length > 0 ? (
                <div className="divide-y divide-slate-800/60">
                  {filteredFriends.map(({ friend, friendshipId }: any) => {
                    const isOnline = onlineUsers.has(friend.id);
                    return (
                      <div
                        key={friend.id}
                        onClick={() => navigate(`/profile/${friend.id}`)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <div className="flex-shrink-0"><UserAvatar user={friend} showPresence /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-white truncate">{friend.firstName} {friend.lastName}</span>
                            {friend.isPremium && <Crown size={13} className="text-amber-400 flex-shrink-0" />}
                            {friend.isVerified && <BadgeCheck size={13} className="text-sky-400 flex-shrink-0" />}

                            {isOnline && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
                          </div>
                          {isOnline ? (
                            <p className="text-xs text-emerald-500 truncate mt-0.5">В сети</p>
                          ) : formatLastSeen(friend.lastSeenAt) ? (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{formatLastSeen(friend.lastSeenAt)}</p>
                          ) : (friend.role || friend.city) ? (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{[friend.role, friend.city].filter(Boolean).join(' · ')}</p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => navigate(`/messages/${friend.id}`)} className="p-2 text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all" title="Написать">
                            <MessageCircle size={16} />
                          </button>
                          {friendshipId && (
                            <button onClick={() => setConfirmRemoveFriend(friendshipId)} disabled={removeMutation.isPending} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50" title="Удалить из друзей">
                              <UserX size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : friends.length === 0 && requests.length === 0 && sentRequests.length === 0 ? (
                <div className="flex flex-col items-center py-16 px-6 text-center">
                  <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Users size={32} className="text-slate-600" /></div>
                  <p className="text-white font-semibold mb-1">У вас пока нет друзей</p>
                  <p className="text-slate-500 text-sm mb-5">Найдите музыкантов в поиске</p>
                  <button onClick={() => navigate('/search')} className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium transition-colors">Найти друзей</button>
                </div>
              ) : search || onlineOnly ? (
                <div className="flex flex-col items-center py-12 px-6 text-center">
                  <Search size={28} className="text-slate-600 mb-3" />
                  <p className="text-slate-500 text-sm">Никого не найдено</p>
                </div>
              ) : null}
            </div>
          )}

          {/* ══ CONNECTIONS TAB ══ */}
          {activeTab === 'connections' && (
            <div className="pb-4">
              {/* Requests navigator */}
              <button
                onClick={() => navigate('/connections/requests')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors border-b border-slate-800/60 text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary-500/15 flex items-center justify-center flex-shrink-0">
                  <Link2 size={18} className="text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Запросы связи</p>
                  <p className="text-xs text-slate-500">
                    {connRequests.length > 0 ? `${connRequests.length} новых` : connSent.length > 0 ? `${connSent.length} отправлено` : 'Нет новых запросов'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
              </button>

              {connPartners.length > 0 && (
                <div>
                  <SectionHeader label="Мои связи" count={connPartners.length} />
                  <div className="divide-y divide-slate-800/60">
                    {connPartners.map((g: any) => {
                      const roles = [...new Set(g.connections.map((x: any) => x.myRole ?? (x.iAmRequester ? 'CUSTOMER' : 'EXECUTOR')))] as string[];
                      const ROLE_LABEL_SHORT: Record<string, string> = { CUSTOMER: 'Заказчик', EXECUTOR: 'Исполнитель', COLLEAGUE: 'Коллега' };
                      const ROLE_CLR: Record<string, string> = {
                        CUSTOMER: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                        EXECUTOR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                        COLLEAGUE: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
                      };
                      return (
                        <div key={g.partner.id} onClick={() => navigate(`/connection/${g.partner.id}`, { state: g })} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer">
                          <div className="flex-shrink-0"><UserAvatar user={g.partner} /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-white truncate">{g.partner.firstName} {g.partner.lastName}</span>
                              {g.partner.isPremium && <Crown size={13} className="text-amber-400 flex-shrink-0" />}
                              {g.partner.isVerified && <BadgeCheck size={13} className="text-sky-400 flex-shrink-0" />}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {roles.map((r: string) => (
                                <span key={r} className={`text-[11px] rounded-md px-1.5 py-0.5 border ${ROLE_CLR[r] ?? 'bg-slate-700/40 text-slate-400 border-slate-700'}`}>
                                  {ROLE_LABEL_SHORT[r] ?? r}
                                </span>
                              ))}
                              {g.connections.length > 1 && (
                                <span className="text-[11px] text-slate-500">{g.connections.length} связей</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {myBreakRequests.length > 0 && (
                <div>
                  <SectionHeader label="Ожидают подтверждения разрыва" count={myBreakRequests.length} danger />
                  <div className="divide-y divide-slate-800/60">
                    {myBreakRequests.map((c: any) => (
                      <div key={c.id} onClick={() => setViewConn(c)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer">
                        <div className="flex-shrink-0"><UserAvatar user={c.partner} /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{c.partner.firstName} {c.partner.lastName}</p>
                          <p className="text-xs text-red-400/80 mt-0.5">Ожидает подтверждения разрыва</p>
                        </div>
                        <Clock size={14} className="text-red-400/60 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {connHistory.length > 0 && (
                <div>
                  <SectionHeader label="История связей" count={connHistory.length} />
                  <div className="divide-y divide-slate-800/60">
                    {connHistory.map((h: any) => (
                      <div key={h.id} className="px-4 py-3 opacity-70">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0"><UserAvatar user={h.partner} /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{h.partner.firstName} {h.partner.lastName}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {h.profession && (
                                <span className="text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-md px-1.5 py-0.5">{h.profession.name}</span>
                              )}
                              <span className="text-[11px] text-slate-500">
                                {h.iInitiatedBreak ? 'Вы инициировали разрыв' : 'Партнёр инициировал разрыв'}
                              </span>
                              <span className="text-[11px] text-slate-600">·</span>
                              <span className="text-[11px] text-slate-500">
                                {new Date(h.endedAt).toLocaleString('ru', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {connPartners.length === 0 && connRequests.length === 0 && connSent.length === 0 && connRejected.length === 0 && myBreakRequests.length === 0 && connHistory.length === 0 && (
                <div className="flex flex-col items-center py-16 px-6 text-center">
                  <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Link2 size={32} className="text-slate-600" /></div>
                  <p className="text-white font-semibold mb-1">Нет профессиональных связей</p>
                  <p className="text-slate-500 text-sm">Найдите музыкантов и установите профессиональные связи</p>
                </div>
              )}
            </div>
          )}

          {/* ══ FAVORITES TAB ══ */}
          {activeTab === 'favorites' && (
            <div>
              {/* Sub-tabs */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
                  {([
                    { id: 'people',  label: 'Люди' },
                    { id: 'artists', label: 'Артисты' },
                    { id: 'posts',   label: 'Публикации' },
                  ] as const).map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setFavSubTab(sub.id)}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-medium transition-all ${
                        favSubTab === sub.id ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── People ── */}
              {favSubTab === 'people' && (
                favorites.length > 0 ? (
                  <div className="divide-y divide-slate-800/60">
                    {favorites.map((fav: any) => (
                      <div
                        key={fav.id}
                        onClick={() => navigate(`/profile/${fav.user.id}`)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <div className="flex-shrink-0"><UserAvatar user={fav.user} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-white truncate">{fav.user.firstName} {fav.user.lastName}</span>
                            {fav.user.isPremium && <Crown size={13} className="text-amber-400 flex-shrink-0" />}
                            {fav.user.isVerified && <BadgeCheck size={13} className="text-sky-400 flex-shrink-0" />}
                          </div>
                          {(fav.user.role || fav.user.city) && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{[fav.user.role, fav.user.city].filter(Boolean).join(' · ')}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/messages/${fav.user.id}`)}
                            className="p-2 text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all"
                            title="Написать"
                          >
                            <MessageCircle size={16} />
                          </button>
                          <button
                            onClick={() => setConfirmRemoveFav(fav.user.id)}
                            disabled={removeFavMutation.isPending}
                            className="p-2 text-amber-400 hover:text-slate-400 hover:bg-slate-700/50 rounded-lg transition-all disabled:opacity-50"
                            title="Убрать из избранного"
                          >
                            <Star size={15} fill="currentColor" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-16 px-6 text-center">
                    <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Star size={32} className="text-slate-600" /></div>
                    <p className="text-white font-semibold mb-1">Нет избранных</p>
                    <p className="text-slate-500 text-sm">Нажмите ★ на профиле пользователя, чтобы добавить в избранное</p>
                  </div>
                )
              )}

              {/* ── Artists ── */}
              {favSubTab === 'artists' && (
                followedArtists.length > 0 ? (
                  <div className="divide-y divide-slate-800/60">
                    {followedArtists.map((artist: any) => (
                      <div
                        key={artist.id}
                        onClick={() => navigate(`/artist/${artist.id}`)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {artist.avatar
                            ? <img src={artist.avatar} alt={artist.name} className="w-full h-full object-cover" />
                            : <span className="text-white font-bold text-sm">{artist.name?.[0]?.toUpperCase()}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{artist.name}</p>
                          {(artist.city || artist.followersCount) && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {[artist.city, artist.followersCount ? artist.followersCount + ' подписчиков' : null].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-16 px-6 text-center">
                    <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Star size={32} className="text-slate-600" /></div>
                    <p className="text-white font-semibold mb-1">Вы не подписаны на артистов</p>
                  </div>
                )
              )}

              {/* ── Saved posts ── */}
              {favSubTab === 'posts' && (
                savedPosts.length > 0 ? (
                  <div className="divide-y divide-slate-800/60">
                    {savedPosts.map((post: any) => {
                      const thumb = post.images?.[0] ?? post.media?.[0]?.url;
                      return (
                        <div
                          key={post.id}
                          onClick={() => post.author && navigate(`/profile/${post.author.id}`)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer"
                        >
                          {post.author && <div className="flex-shrink-0"><UserAvatar user={post.author} /></div>}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {post.author && (
                                <span className="text-sm font-semibold text-white truncate">{post.author.firstName} {post.author.lastName}</span>
                              )}
                              {(post.savedAt || post.createdAt) && (
                                <span className="text-[11px] text-slate-600 flex-shrink-0">
                                  {new Date(post.savedAt ?? post.createdAt).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </div>
                            {post.content && (
                              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{post.content.slice(0, 140)}</p>
                            )}
                          </div>
                          {thumb && (
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0">
                              <img src={thumb} alt="" className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-16 px-6 text-center">
                    <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Star size={32} className="text-slate-600" /></div>
                    <p className="text-white font-semibold mb-1">Нет сохранённых публикаций</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {viewConn && (
      <ConnectionViewModal connection={viewConn} onClose={() => setViewConn(null)} />
    )}
    <ConfirmDialog
      open={!!confirmRemoveFriend}
      message="Удалить из друзей? Это действие нельзя отменить."
      onConfirm={() => { if (confirmRemoveFriend) removeMutation.mutate(confirmRemoveFriend); }}
      onCancel={() => setConfirmRemoveFriend(null)}
    />
    <ConfirmDialog
      open={!!confirmRemoveFav}
      message="Убрать из избранного?"
      confirmLabel="Убрать"
      onConfirm={() => { if (confirmRemoveFav) removeFavMutation.mutate(confirmRemoveFav); }}
      onCancel={() => setConfirmRemoveFav(null)}
    />
    </>
  );
}
