import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Check, X, MessageCircle, UserX, Clock, Pin, PinOff, Search, Wifi } from 'lucide-react';
import { friendshipAPI } from '../lib/api';
import { usePresenceStore } from '../stores/presenceStore';

type Tab = 'friends' | 'requests' | 'sent';

const PINNED_KEY = 'mooza_pinned_friends';

function getPinned(): string[] {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]'); }
  catch { return []; }
}
function setPinned(ids: string[]) {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
}

export default function FriendsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [search, setSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>(getPinned);

  const onlineUsers = usePresenceStore((s) => s.onlineUsers);

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

  const togglePin = (friendId: string) => {
    setPinnedIds(prev => {
      const next = prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId];
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

  const TABS = [
    { id: 'friends' as Tab, label: 'Друзья', count: friends.length },
    { id: 'requests' as Tab, label: 'Заявки', count: requests.length },
    { id: 'sent' as Tab, label: 'Отправленные', count: sentRequests.length },
  ];

  const Avatar = ({ user, size = 10, showPresence = false }: { user: any; size?: number; showPresence?: boolean }) => {
    const cls = `w-${size} h-${size} rounded-full object-cover`;
    const isOnline = showPresence && onlineUsers.has(user.id);
    const inner = user.avatar ? (
      <img src={`${import.meta.env.VITE_API_URL}${user.avatar}`} alt={`${user.firstName} ${user.lastName}`} className={cls} />
    ) : (
      <div className={`w-${size} h-${size} bg-gradient-to-br from-primary-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0`}>
        <span className="text-white font-bold text-sm">{user.firstName[0]}{user.lastName[0]}</span>
      </div>
    );
    if (!showPresence) return inner;
    return (
      <div className="relative inline-block flex-shrink-0">
        {inner}
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <Users size={20} className="text-primary-400" />
              <h2 className="text-lg font-bold text-white">Друзья</h2>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 mb-3">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                      activeTab === tab.id ? 'bg-white/20' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {tab.count}
                    </span>
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
                    onlineOnly
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Только онлайн"
                >
                  <Wifi size={13} />
                  Онлайн
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pb-24">

          {/* ── Friends tab ── */}
          {activeTab === 'friends' && (
            friendsLoading ? (
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
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        <Avatar user={friend} size={11} showPresence />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-white truncate">
                            {friend.firstName} {friend.lastName}
                          </span>
                          {isPinned && <Pin size={11} className="text-primary-400 flex-shrink-0" />}
                          {isOnline && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                          )}
                        </div>
                        {(friend.role || friend.city) && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {[friend.role, friend.city].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>

                      {/* Actions — always visible, stop propagation */}
                      <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/messages/${friend.id}`)}
                          className="p-2 text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all"
                          title="Написать"
                        >
                          <MessageCircle size={16} />
                        </button>
                        <button
                          onClick={() => togglePin(friend.id)}
                          className={`p-2 rounded-lg transition-all ${
                            isPinned
                              ? 'text-primary-400 hover:text-slate-400 hover:bg-slate-700/50'
                              : 'text-slate-400 hover:text-primary-400 hover:bg-primary-500/10'
                          }`}
                          title={isPinned ? 'Открепить' : 'Закрепить'}
                        >
                          {isPinned ? <PinOff size={15} /> : <Pin size={15} />}
                        </button>
                        {friendshipId && (
                          <button
                            onClick={() => removeMutation.mutate(friendshipId)}
                            disabled={removeMutation.isPending}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                            title="Удалить из друзей"
                          >
                            <UserX size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : friends.length === 0 ? (
              <div className="flex flex-col items-center py-16 px-6 text-center">
                <div className="p-4 bg-slate-800/50 rounded-2xl mb-4">
                  <Users size={32} className="text-slate-600" />
                </div>
                <p className="text-white font-semibold mb-1">У вас пока нет друзей</p>
                <p className="text-slate-500 text-sm mb-5">Найдите музыкантов в поиске</p>
                <button
                  onClick={() => navigate('/search')}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Найти друзей
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-12 px-6 text-center">
                <Search size={28} className="text-slate-600 mb-3" />
                <p className="text-slate-500 text-sm">Никого не найдено по вашему запросу</p>
              </div>
            )
          )}

          {/* ── Requests tab ── */}
          {activeTab === 'requests' && (
            requests.length > 0 ? (
              <div className="divide-y divide-slate-800/60">
                {requests.map((request: any) => (
                  <div key={request.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
                    <button onClick={() => navigate(`/profile/${request.requester.id}`)} className="flex-shrink-0">
                      <Avatar user={request.requester} size={11} />
                    </button>
                    <button onClick={() => navigate(`/profile/${request.requester.id}`)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-white truncate">
                        {request.requester.firstName} {request.requester.lastName}
                      </p>
                      {(request.requester.role || request.requester.city) && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {[request.requester.role, request.requester.city].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => acceptMutation.mutate(request.id)}
                        disabled={acceptMutation.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
                      >
                        <Check size={13} /> Принять
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate(request.id)}
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
            ) : (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="p-4 bg-slate-800/50 rounded-2xl mb-3">
                  <Check size={28} className="text-slate-600" />
                </div>
                <p className="text-slate-500 text-sm">Нет входящих заявок</p>
              </div>
            )
          )}

          {/* ── Sent tab ── */}
          {activeTab === 'sent' && (
            sentRequests.length > 0 ? (
              <div className="divide-y divide-slate-800/60">
                {sentRequests.map((request: any) => (
                  <div key={request.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
                    <button onClick={() => navigate(`/profile/${request.receiver.id}`)} className="flex-shrink-0">
                      <Avatar user={request.receiver} size={11} />
                    </button>
                    <button onClick={() => navigate(`/profile/${request.receiver.id}`)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-white truncate">
                        {request.receiver.firstName} {request.receiver.lastName}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={11} className="text-slate-600" />
                        <span className="text-xs text-slate-500">
                          {[request.receiver.role, request.receiver.city].filter(Boolean).join(' · ') || 'Ожидает ответа'}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => cancelMutation.mutate(request.id)}
                      disabled={cancelMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl text-xs font-medium border border-slate-700 hover:border-red-500/30 transition-all disabled:opacity-50 flex-shrink-0"
                    >
                      <X size={12} /> Отменить
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="p-4 bg-slate-800/50 rounded-2xl mb-3">
                  <Clock size={28} className="text-slate-600" />
                </div>
                <p className="text-slate-500 text-sm">Нет отправленных заявок</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
