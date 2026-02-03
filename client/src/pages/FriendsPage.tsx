import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Check, X, MessageCircle, User } from 'lucide-react';
import { friendshipAPI } from '../lib/api';

export default function FriendsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: friends, isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      const { data } = await friendshipAPI.getFriends();
      return data;
    },
  });

  const { data: requests } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: async () => {
      const { data } = await friendshipAPI.getRequests();
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Header with gradient backdrop */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
        <div className="relative max-w-7xl mx-auto px-4 pt-6 pb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-500/20 rounded-2xl">
              <Users size={28} className="text-primary-400" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Друзья
            </h2>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-24 space-y-6">

        {/* Friend Requests */}
        {requests && requests.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg sm:text-xl font-bold text-white">Заявки в друзья</h3>
              <span className="bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm font-semibold px-3 py-1 rounded-xl shadow-lg">
                {requests.length}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {requests.map((request: any) => (
                <div
                  key={request.id}
                  className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 shadow-lg hover:shadow-primary-500/10"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="flex items-center gap-4 mb-4">
                    {/* Avatar */}
                    <button onClick={() => navigate(`/profile/${request.requester.id}`)} className="flex-shrink-0">
                      {request.requester.avatar ? (
                        <img
                          src={`${import.meta.env.VITE_API_URL}${request.requester.avatar}`}
                          alt={`${request.requester.firstName} ${request.requester.lastName}`}
                          className="w-14 h-14 rounded-2xl object-cover ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all">
                          <span className="text-white font-bold text-lg">
                            {request.requester.firstName[0]}{request.requester.lastName[0]}
                          </span>
                        </div>
                      )}
                    </button>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => navigate(`/profile/${request.requester.id}`)}
                        className="font-bold text-white text-lg hover:text-primary-400 transition-colors truncate block"
                      >
                        {request.requester.firstName} {request.requester.lastName}
                      </button>
                      <p className="text-sm text-slate-400 truncate">
                        {request.requester.role && `${request.requester.role} • `}
                        {request.requester.city}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptMutation.mutate(request.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-xl font-medium transition-all"
                    >
                      <Check size={18} />
                      <span>Принять</span>
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(request.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-medium transition-all"
                    >
                      <X size={18} />
                      <span>Отклонить</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends List */}
        {friendsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-slate-700/50 rounded-2xl"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-slate-700/50 rounded-lg w-2/3 mb-2"></div>
                    <div className="h-3 bg-slate-700/50 rounded-lg w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : friends && friends.length > 0 ? (
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-4">
              Все друзья <span className="text-slate-400 text-base font-normal">({friends.length})</span>
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {friends.map((friend: any) => (
                <div
                  key={friend.id}
                  className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 shadow-lg hover:shadow-primary-500/10"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="flex flex-col items-center text-center">
                    {/* Avatar */}
                    <button onClick={() => navigate(`/profile/${friend.id}`)} className="mb-3">
                      {friend.avatar ? (
                        <img
                          src={`${import.meta.env.VITE_API_URL}${friend.avatar}`}
                          alt={`${friend.firstName} ${friend.lastName}`}
                          className="w-20 h-20 rounded-2xl object-cover ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-purple-600 rounded-2xl flex items-center justify-center ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all">
                          <span className="text-white font-bold text-2xl">
                            {friend.firstName[0]}{friend.lastName[0]}
                          </span>
                        </div>
                      )}
                    </button>

                    {/* Name */}
                    <button
                      onClick={() => navigate(`/profile/${friend.id}`)}
                      className="font-bold text-white text-lg hover:text-primary-400 transition-colors truncate w-full"
                    >
                      {friend.firstName} {friend.lastName}
                    </button>
                    
                    {friend.role && (
                      <p className="text-sm text-primary-400 truncate w-full">{friend.role}</p>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-4 w-full">
                      <button
                        onClick={() => navigate(`/messages/${friend.id}`)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-all"
                      >
                        <MessageCircle size={16} />
                        <span className="hidden sm:inline">Написать</span>
                      </button>
                      <button
                        onClick={() => navigate(`/profile/${friend.id}`)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-xl text-sm font-medium transition-all"
                      >
                        <User size={16} />
                        <span className="hidden sm:inline">Профиль</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl">
            {/* Decorative gradient orbs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>

            <div className="relative text-center py-16 px-6">
              <div className="inline-flex p-6 bg-slate-700/30 rounded-3xl mb-6">
                <Users size={64} className="text-slate-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">У вас пока нет друзей</h3>
              <p className="text-slate-400 text-lg">Найдите музыкантов в поиске</p>
              <button
                onClick={() => navigate('/search')}
                className="mt-6 px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
              >
                Найти друзей
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
