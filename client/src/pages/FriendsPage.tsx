import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Check, X, MessageCircle, UserX, Clock } from 'lucide-react';
import { friendshipAPI } from '../lib/api';

type Tab = 'friends' | 'requests' | 'sent';

export default function FriendsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('friends');

  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      const { data } = await friendshipAPI.getFriends();
      return data;
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: async () => {
      const { data } = await friendshipAPI.getRequests();
      return data;
    },
  });

  const { data: sentRequests = [] } = useQuery({
    queryKey: ['friend-requests-sent'],
    queryFn: async () => {
      const { data } = await friendshipAPI.getSentRequests();
      return data;
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: friendshipAPI.rejectRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests-sent'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: friendshipAPI.removeFriend,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });

  const TABS = [
    { id: 'friends' as Tab, label: 'Друзья', count: friends.length },
    { id: 'requests' as Tab, label: 'Заявки', count: requests.length },
    { id: 'sent' as Tab, label: 'Отправленные', count: sentRequests.length },
  ];

  const Avatar = ({ user, size = 10 }: { user: any; size?: number }) => {
    const cls = `w-${size} h-${size} rounded-xl object-cover ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all`;
    if (user.avatar) {
      return <img src={`${import.meta.env.VITE_API_URL}${user.avatar}`} alt={`${user.firstName} ${user.lastName}`} className={cls} />;
    }
    return (
      <div className={`w-${size} h-${size} bg-gradient-to-br from-primary-500 to-purple-600 rounded-xl flex items-center justify-center ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all`}>
        <span className="text-white font-bold text-sm">{user.firstName[0]}{user.lastName[0]}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
        <div className="relative max-w-4xl mx-auto px-4 pt-4 pb-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-primary-500/20 rounded-xl">
              <Users size={20} className="text-primary-400" />
            </div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Друзья
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-800/80 rounded-xl border border-slate-700/50">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary-500 text-white shadow-md shadow-primary-500/30'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-24">

        {/* Friends Tab */}
        {activeTab === 'friends' && (
          friendsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-slate-800/80 rounded-xl p-3.5 border border-slate-700/50 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-700/50 rounded-xl"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-slate-700/50 rounded w-2/3 mb-2"></div>
                      <div className="h-3 bg-slate-700/50 rounded w-1/2"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : friends.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {friends.map((item: any) => {
                const friend = item.user ?? item; // backward compat
                const friendshipId = item.friendshipId;
                return (
                  <div key={friend.id} className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-3.5 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    <div className="flex flex-col items-center text-center">
                      <button onClick={() => navigate(`/profile/${friend.id}`)} className="mb-2">
                        <Avatar user={friend} size={14} />
                      </button>
                      <button onClick={() => navigate(`/profile/${friend.id}`)} className="font-semibold text-white text-sm hover:text-primary-400 transition-colors truncate w-full">
                        {friend.firstName} {friend.lastName}
                      </button>
                      {friend.role && <p className="text-xs text-primary-400 truncate w-full mb-2">{friend.role}</p>}
                      {friend.city && <p className="text-xs text-slate-500 truncate w-full mb-3">{friend.city}</p>}
                      <div className="flex gap-2 w-full">
                        <button
                          onClick={() => navigate(`/messages/${friend.id}`)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-lg text-xs font-medium transition-all"
                        >
                          <MessageCircle size={14} />
                          <span>Написать</span>
                        </button>
                        {friendshipId && (
                          <button
                            onClick={() => removeMutation.mutate(friendshipId)}
                            disabled={removeMutation.isPending}
                            className="flex items-center justify-center p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all disabled:opacity-50"
                            title="Удалить из друзей"
                          >
                            <UserX size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700/50 text-center py-12 px-6">
              <div className="inline-flex p-4 bg-slate-700/30 rounded-2xl mb-4">
                <Users size={36} className="text-slate-500" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">У вас пока нет друзей</h3>
              <p className="text-slate-400 text-sm mb-4">Найдите музыкантов в поиске</p>
              <button
                onClick={() => navigate('/search')}
                className="px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg text-sm font-medium transition-all"
              >
                Найти друзей
              </button>
            </div>
          )
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          requests.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {requests.map((request: any) => (
                <div key={request.id} className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-3.5 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300">
                  <div className="flex items-center gap-3 mb-3">
                    <button onClick={() => navigate(`/profile/${request.requester.id}`)} className="flex-shrink-0">
                      <Avatar user={request.requester} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => navigate(`/profile/${request.requester.id}`)} className="font-bold text-white text-sm hover:text-primary-400 transition-colors truncate block">
                        {request.requester.firstName} {request.requester.lastName}
                      </button>
                      <p className="text-xs text-slate-400 truncate">
                        {request.requester.role && `${request.requester.role}`}
                        {request.requester.role && request.requester.city && ' • '}
                        {request.requester.city}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptMutation.mutate(request.id)}
                      disabled={acceptMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                    >
                      <Check size={16} />
                      Принять
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(request.id)}
                      disabled={rejectMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                    >
                      <X size={16} />
                      Отклонить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700/50 text-center py-12 px-6">
              <div className="inline-flex p-4 bg-slate-700/30 rounded-2xl mb-4">
                <Check size={36} className="text-slate-500" />
              </div>
              <p className="text-slate-400 text-sm">Нет входящих заявок</p>
            </div>
          )
        )}

        {/* Sent Tab */}
        {activeTab === 'sent' && (
          sentRequests.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {sentRequests.map((request: any) => (
                <div key={request.id} className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-3.5 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <button onClick={() => navigate(`/profile/${request.receiver.id}`)} className="flex-shrink-0">
                      <Avatar user={request.receiver} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => navigate(`/profile/${request.receiver.id}`)} className="font-semibold text-white text-sm hover:text-primary-400 transition-colors truncate block">
                        {request.receiver.firstName} {request.receiver.lastName}
                      </button>
                      <p className="text-xs text-slate-400 truncate">
                        {request.receiver.role && `${request.receiver.role}`}
                        {request.receiver.role && request.receiver.city && ' • '}
                        {request.receiver.city}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock size={11} className="text-slate-500" />
                        <span className="text-xs text-slate-500">Ожидает ответа</span>
                      </div>
                    </div>
                    <button
                      onClick={() => cancelMutation.mutate(request.id)}
                      disabled={cancelMutation.isPending}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-red-500/15 text-slate-400 hover:text-red-400 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                    >
                      <X size={13} />
                      Отменить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700/50 text-center py-12 px-6">
              <div className="inline-flex p-4 bg-slate-700/30 rounded-2xl mb-4">
                <Clock size={36} className="text-slate-500" />
              </div>
              <p className="text-slate-400 text-sm">Нет отправленных заявок</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
