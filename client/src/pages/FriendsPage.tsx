import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, Check, X, MessageCircle, UserX, Clock,
  Pin, PinOff, Search, Wifi, Link2, Star, Crown, BadgeCheck, Music2,
} from 'lucide-react';
import { friendshipAPI, connectionAPI, favoriteAPI, groupAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';
import { usePresenceStore } from '../stores/presenceStore';
import ConnectionViewModal from '../components/ConnectionViewModal';

type Tab = 'friends' | 'connections' | 'favorites' | 'groups';

const PINNED_KEY = 'mooza_pinned_friends';
function getPinned(): string[] {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]'); }
  catch { return []; }
}
function setPinned(ids: string[]) { localStorage.setItem(PINNED_KEY, JSON.stringify(ids)); }

function SectionHeader({ label, count, danger }: { label: string; count?: number; danger?: boolean }) {
  return (
    <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center gap-2">
      <span className={`text-xs font-semibold uppercase tracking-wide ${danger ? 'text-red-500/70' : 'text-slate-500'}`}>{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${danger ? 'bg-red-500/15 text-red-400' : 'bg-slate-800 text-slate-400'}`}>{count}</span>
      )}
    </div>
  );
}

export default function FriendsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [viewConn, setViewConn] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>(getPinned);

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
  const { data: connections = [] } = useQuery({
    queryKey: ['connections-accepted'],
    queryFn: async () => { const { data } = await connectionAPI.getAccepted(); return data; },
  });
  const { data: connRequests = [] } = useQuery({
    queryKey: ['connections-requests'],
    queryFn: async () => { const { data } = await connectionAPI.getRequests(); return data; },
  });
  const { data: connSent = [] } = useQuery({
    queryKey: ['connections-sent'],
    queryFn: async () => { const { data } = await connectionAPI.getSent(); return data; },
  });
  const { data: breakRequests = [] } = useQuery({
    queryKey: ['connections-break-requests'],
    queryFn: async () => { const { data } = await connectionAPI.getBreakRequests(); return data; },
  });

  // ── Favorites ──
  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => { const { data } = await favoriteAPI.list(); return data; },
  });

  // ── Group invites ──
  const { data: groupInvites = [] } = useQuery({
    queryKey: ['group-invites'],
    queryFn: async () => { const { data } = await groupAPI.getInvites(); return data as any[]; },
  });

  // ── My groups ──
  const { data: myGroups = [] } = useQuery({
    queryKey: ['my-groups'],
    queryFn: async () => { const { data } = await groupAPI.getMyGroups(); return data as any[]; },
  });

  const acceptGroupInviteMut = useMutation({
    mutationFn: (membershipId: string) => groupAPI.acceptInvite(membershipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-invites'] }),
  });
  const declineGroupInviteMut = useMutation({
    mutationFn: (membershipId: string) => groupAPI.declineInvite(membershipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-invites'] }),
  });

  // ── Mutations (friends) ──
  const acceptMutation = useMutation({
    mutationFn: friendshipAPI.acceptRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
  });
  const rejectMutation = useMutation({
    mutationFn: friendshipAPI.rejectRequest,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['friend-requests'] }); },
  });
  const cancelMutation = useMutation({
    mutationFn: friendshipAPI.rejectRequest,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['friend-requests-sent'] }); },
  });
  const removeMutation = useMutation({
    mutationFn: friendshipAPI.removeFriend,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['friends'] }); },
  });

  // ── Mutations (favorites) ──
  const removeFavMutation = useMutation({
    mutationFn: (targetId: string) => favoriteAPI.remove(targetId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['favorites'] }); },
  });

  const togglePin = (friendId: string) => {
    setPinnedIds(prev => {
      const next = prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId];
      setPinned(next);
      return next;
    });
  };

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
  const connBadge = connRequests.length + breakRequests.length;
  const groupsBadge = groupInvites.length;

  const TABS: { id: Tab; label: string; badge: number }[] = [
    { id: 'friends',     label: 'Друзья',   badge: friendsBadge },
    { id: 'connections', label: 'Связи',    badge: connBadge },
    { id: 'groups',      label: 'Группы',   badge: groupsBadge },
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
              <h2 className="text-lg font-bold text-white flex-1">Друзья и связи</h2>
              {activeTab === 'groups' && (
                <button
                  onClick={() => navigate('/groups/create')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-medium transition-colors"
                >
                  <Music2 size={13} /> + Группа
                </button>
              )}
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
                  {tab.badge > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                      activeTab === tab.id ? 'bg-white/20' : 'bg-slate-800 text-slate-400'
                    }`}>{tab.badge}</span>
                  )}
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
              {/* Incoming requests */}
              {requests.length > 0 && (
                <div>
                  <SectionHeader label="Входящие заявки" count={requests.length} />
                  <div className="divide-y divide-slate-800/60">
                    {requests.map((req: any) => (
                      <div key={req.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
                        <button onClick={() => navigate(`/profile/${req.requester.id}`)} className="flex-shrink-0">
                          <UserAvatar user={req.requester} />
                        </button>
                        <button onClick={() => navigate(`/profile/${req.requester.id}`)} className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-semibold text-white truncate">{req.requester.firstName} {req.requester.lastName}</p>
                          {(req.requester.role || req.requester.city) && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{[req.requester.role, req.requester.city].filter(Boolean).join(' · ')}</p>
                          )}
                        </button>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => acceptMutation.mutate(req.id)}
                            disabled={acceptMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
                          >
                            <Check size={13} /> Принять
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate(req.id)}
                            disabled={rejectMutation.isPending}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                            title="Отклонить"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Outgoing requests */}
              {sentRequests.length > 0 && (
                <div>
                  <SectionHeader label="Отправленные заявки" count={sentRequests.length} />
                  <div className="divide-y divide-slate-800/60">
                    {sentRequests.map((req: any) => (
                      <div key={req.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
                        <button onClick={() => navigate(`/profile/${req.receiver.id}`)} className="flex-shrink-0">
                          <UserAvatar user={req.receiver} />
                        </button>
                        <button onClick={() => navigate(`/profile/${req.receiver.id}`)} className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-semibold text-white truncate">{req.receiver.firstName} {req.receiver.lastName}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock size={11} className="text-slate-600" />
                            <span className="text-xs text-slate-500">{[req.receiver.role, req.receiver.city].filter(Boolean).join(' · ') || 'Ожидает ответа'}</span>
                          </div>
                        </button>
                        <button
                          onClick={() => cancelMutation.mutate(req.id)}
                          disabled={cancelMutation.isPending}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl text-xs font-medium border border-slate-700 hover:border-red-500/30 transition-all disabled:opacity-50 flex-shrink-0"
                        >
                          <X size={12} /> Отменить
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Friends list */}
              {(friends.length > 0 || requests.length > 0 || sentRequests.length > 0) && friends.length > 0 && (
                <SectionHeader label="Список друзей" count={friends.length} />
              )}

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
                    const isPinned = pinnedIds.includes(friend.id);
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
                            {isPinned && <Pin size={11} className="text-primary-400 flex-shrink-0" />}
                            {isOnline && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
                          </div>
                          {(friend.role || friend.city) && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{[friend.role, friend.city].filter(Boolean).join(' · ')}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => navigate(`/messages/${friend.id}`)} className="p-2 text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all" title="Написать">
                            <MessageCircle size={16} />
                          </button>
                          <button
                            onClick={() => togglePin(friend.id)}
                            className={`p-2 rounded-lg transition-all ${isPinned ? 'text-primary-400 hover:text-slate-400 hover:bg-slate-700/50' : 'text-slate-400 hover:text-primary-400 hover:bg-primary-500/10'}`}
                            title={isPinned ? 'Открепить' : 'Закрепить'}
                          >
                            {isPinned ? <PinOff size={15} /> : <Pin size={15} />}
                          </button>
                          {friendshipId && (
                            <button onClick={() => removeMutation.mutate(friendshipId)} disabled={removeMutation.isPending} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50" title="Удалить из друзей">
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
              {connRequests.length > 0 && (
                <div>
                  <SectionHeader label="Входящие запросы" count={connRequests.length} />
                  <div className="divide-y divide-slate-800/60">
                    {connRequests.map((c: any) => (
                      <div key={c.id} onClick={() => setViewConn(c)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer">
                        <div className="flex-shrink-0"><UserAvatar user={c.partner} /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{c.partner.firstName} {c.partner.lastName}</p>
                          {c.services?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.services.slice(0, 3).map((s: any) => (
                                <span key={s.id} className="text-[11px] bg-primary-500/10 text-primary-300 border border-primary-500/20 rounded-md px-1.5 py-0.5">{s.name}</span>
                              ))}
                              {c.services.length > 3 && <span className="text-[11px] text-slate-500">+{c.services.length - 3}</span>}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-primary-400 font-medium flex-shrink-0">Открыть →</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {breakRequests.length > 0 && (
                <div>
                  <SectionHeader label="Запросы на разрыв" count={breakRequests.length} danger />
                  <div className="divide-y divide-slate-800/60">
                    {breakRequests.map((c: any) => (
                      <div key={c.id} onClick={() => setViewConn(c)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer">
                        <div className="flex-shrink-0"><UserAvatar user={c.partner} /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{c.partner.firstName} {c.partner.lastName}</p>
                          <p className="text-xs text-red-400/80 mt-0.5">Запрашивает разрыв связи</p>
                        </div>
                        <span className="text-xs text-red-400 font-medium flex-shrink-0">Открыть →</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {connSent.length > 0 && (
                <div>
                  <SectionHeader label="Отправленные запросы" count={connSent.length} />
                  <div className="divide-y divide-slate-800/60">
                    {connSent.map((c: any) => (
                      <div key={c.id} onClick={() => setViewConn(c)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer">
                        <div className="flex-shrink-0"><UserAvatar user={c.partner} /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{c.partner.firstName} {c.partner.lastName}</p>
                          {c.services?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.services.slice(0, 3).map((s: any) => (
                                <span key={s.id} className="text-[11px] bg-slate-700/60 text-slate-400 rounded-md px-1.5 py-0.5">{s.name}</span>
                              ))}
                              {c.services.length > 3 && <span className="text-[11px] text-slate-500">+{c.services.length - 3}</span>}
                            </div>
                          )}
                        </div>
                        <Clock size={14} className="text-slate-500 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {connections.length > 0 && (
                <div>
                  <SectionHeader label="Мои связи" count={connections.length} />
                  <div className="divide-y divide-slate-800/60">
                    {connections.map((c: any) => (
                      <div key={c.id} onClick={() => setViewConn(c)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer">
                        <div className="flex-shrink-0"><UserAvatar user={c.partner} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-white truncate">{c.partner.firstName} {c.partner.lastName}</span>
                            {c.partner.isPremium && <Crown size={13} className="text-amber-400 flex-shrink-0" />}
                            {c.partner.isVerified && <BadgeCheck size={13} className="text-sky-400 flex-shrink-0" />}
                          </div>
                          {c.services?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.services.slice(0, 3).map((s: any) => (
                                <span key={s.id} className="text-[11px] bg-primary-500/10 text-primary-300 border border-primary-500/20 rounded-md px-1.5 py-0.5">{s.name}</span>
                              ))}
                              {c.services.length > 3 && <span className="text-[11px] text-slate-500">+{c.services.length - 3}</span>}
                            </div>
                          )}
                        </div>
                        <Link2 size={14} className="text-primary-400/60 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {connections.length === 0 && connRequests.length === 0 && connSent.length === 0 && breakRequests.length === 0 && (
                <div className="flex flex-col items-center py-16 px-6 text-center">
                  <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Link2 size={32} className="text-slate-600" /></div>
                  <p className="text-white font-semibold mb-1">Нет профессиональных связей</p>
                  <p className="text-slate-500 text-sm">Найдите музыкантов и установите профессиональные связи</p>
                </div>
              )}
            </div>
          )}

          {/* ══ GROUPS TAB ══ */}
          {activeTab === 'groups' && (
            <div className="pb-4">

              {/* Invites */}
              {groupInvites.length > 0 && (
                <div>
                  <SectionHeader label="Приглашения" count={groupInvites.length} />
                  <div className="divide-y divide-slate-800/60">
                    {groupInvites.map((inv: any) => (
                      <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                        <button onClick={() => navigate(`/groups/${inv.group.id}`)} className="flex-shrink-0">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center overflow-hidden">
                            {inv.group.avatar
                              ? <img src={inv.group.avatar} alt={inv.group.name} className="w-full h-full object-cover" />
                              : <span className="text-white font-bold text-sm">{inv.group.name?.[0]?.toUpperCase()}</span>}
                          </div>
                        </button>
                        <button onClick={() => navigate(`/groups/${inv.group.id}`)} className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-semibold text-white truncate">{inv.group.name}</p>
                          <p className="text-xs text-primary-400 truncate">
                            {inv.profession ? `Роль: ${inv.profession.name}` : 'Приглашение в группу'}
                          </p>
                          {inv.invitedBy && (
                            <p className="text-xs text-slate-600 truncate">от {inv.invitedBy.firstName} {inv.invitedBy.lastName}</p>
                          )}
                        </button>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => acceptGroupInviteMut.mutate(inv.id)}
                            disabled={acceptGroupInviteMut.isPending || declineGroupInviteMut.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
                          >
                            <Check size={13} /> Вступить
                          </button>
                          <button
                            onClick={() => declineGroupInviteMut.mutate(inv.id)}
                            disabled={declineGroupInviteMut.isPending || acceptGroupInviteMut.isPending}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                            title="Отклонить"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* My groups (owner or accepted member) */}
              {myGroups.length > 0 && (
                <div>
                  <SectionHeader label="Мои группы" count={myGroups.length} />
                  <div className="divide-y divide-slate-800/60">
                    {myGroups.map((g: any) => {
                      return (
                        <button
                          key={g.id}
                          onClick={() => navigate(`/groups/${g.id}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left"
                        >
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-600 to-purple-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {g.avatar
                              ? <img src={g.avatar} alt={g.name} className="w-full h-full object-cover" />
                              : <span className="text-white font-bold text-sm">{g.name?.[0]?.toUpperCase()}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{g.name}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {g.type === 'COVER_GROUP' ? 'Кавер-группа' : 'Группа'}
                              {g.city ? ` · ${g.city}` : ''}
                              {' · '}{(g.userArtists ?? []).filter((ua: any) => ua.inviteStatus === 'ACCEPTED').length} уч.
                            </p>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                            g.status === 'VERIFIED' ? 'bg-green-500/15 text-green-400' :
                            g.status === 'PENDING' ? 'bg-amber-500/15 text-amber-400' :
                            g.status === 'DRAFT' ? 'bg-slate-700 text-slate-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {g.status === 'VERIFIED' ? 'Верифицирована' :
                             g.status === 'PENDING' ? 'Модерация' :
                             g.status === 'APPROVED' ? 'Одобрена' :
                             g.status === 'DRAFT' ? 'Черновик' : g.status}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {groupInvites.length === 0 && myGroups.length === 0 && (
                <div className="flex flex-col items-center py-16 px-6 text-center">
                  <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Music2 size={32} className="text-slate-600" /></div>
                  <p className="text-white font-semibold mb-1">Нет групп</p>
                  <p className="text-slate-500 text-sm mb-5">Создайте свою группу или ждите приглашения</p>
                  <button onClick={() => navigate('/groups/create')} className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium transition-colors">
                    Создать группу
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══ FAVORITES TAB ══ */}
          {activeTab === 'favorites' && (
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
                        onClick={() => removeFavMutation.mutate(fav.user.id)}
                        disabled={removeFavMutation.isPending}
                        className="p-2 text-amber-400/60 hover:text-slate-400 hover:bg-slate-700/50 rounded-lg transition-all disabled:opacity-50"
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
                <p className="text-slate-500 text-sm">Нажмите ★ на профиле пользователя, чтобы следить за его новостями</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>

    {viewConn && (
      <ConnectionViewModal connection={viewConn} onClose={() => setViewConn(null)} />
    )}
    </>
  );
}
