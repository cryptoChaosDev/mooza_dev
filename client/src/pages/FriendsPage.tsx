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
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-primary-500/20 to-primary-600/20 rounded-2xl border border-primary-500/30 shadow-lg">
            <Users size={28} className="text-primary-400" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">
            Друзья
          </h2>
        </div>

        {/* Friend Requests */}
        {requests && requests.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Заявки в друзья</h3>
              <span className="bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm font-semibold px-3 py-1 rounded-xl shadow-lg">
                {requests.length}
              </span>
            </div>
            <div className="space-y-4">
              {requests.map((request: any) => (
                <div
                  key={request.id}
                  className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 hover:border-primary-500/50 transition-all hover:shadow-xl hover:shadow-primary-500/10 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500/0 via-primary-500/5 to-primary-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                  <div className="relative flex items-center gap-4">
                    {/* Avatar */}
                    {request.requester.avatar ? (
                      <img
                        src={`${import.meta.env.VITE_API_URL}${request.requester.avatar}`}
                        alt={`${request.requester.firstName} ${request.requester.lastName}`}
                        className="w-16 h-16 rounded-2xl object-cover shadow-lg"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg">
                        <span className="text-white font-bold text-xl">
                          {request.requester.firstName[0]}{request.requester.lastName[0]}
                        </span>
                      </div>
                    )}

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-lg truncate">
                        {request.requester.firstName} {request.requester.lastName}
                      </p>
                      <p className="text-sm text-slate-400 truncate">
                        {request.requester.role && `${request.requester.role} • `}
                        {request.requester.city}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptMutation.mutate(request.id)}
                        disabled={acceptMutation.isPending}
                        className="p-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed transition-all hover:scale-110 shadow-lg shadow-primary-500/30"
                        title="Принять"
                      >
                        <Check size={20} className="text-white" />
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate(request.id)}
                        disabled={rejectMutation.isPending}
                        className="p-3 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 disabled:bg-slate-800/50 disabled:cursor-not-allowed transition-all hover:scale-110 shadow-lg"
                        title="Отклонить"
                      >
                        <X size={20} className="text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends List */}
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Мои друзья</h3>
          {friendsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl animate-pulse"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-slate-700/50 rounded-2xl"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-5 bg-slate-700/50 rounded-lg w-1/3"></div>
                      <div className="h-4 bg-slate-700/50 rounded-lg w-1/2"></div>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-10 h-10 bg-slate-700/50 rounded-xl"></div>
                      <div className="w-10 h-10 bg-slate-700/50 rounded-xl"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : friends && friends.length > 0 ? (
            <div className="space-y-4">
              {friends.map((friend: any) => (
                <div
                  key={friend.id}
                  className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 hover:border-primary-500/50 transition-all hover:shadow-xl hover:shadow-primary-500/10 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500/0 via-primary-500/5 to-primary-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                  <div className="relative flex items-center gap-4">
                    {/* Avatar */}
                    {friend.avatar ? (
                      <img
                        src={`${import.meta.env.VITE_API_URL}${friend.avatar}`}
                        alt={`${friend.firstName} ${friend.lastName}`}
                        className="w-16 h-16 rounded-2xl object-cover shadow-lg"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg">
                        <span className="text-white font-bold text-xl">
                          {friend.firstName[0]}{friend.lastName[0]}
                        </span>
                      </div>
                    )}

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-lg truncate">
                        {friend.firstName} {friend.lastName}
                      </p>
                      <p className="text-sm text-slate-400 truncate">
                        {friend.role && `${friend.role} • `}
                        {friend.city}
                      </p>
                      {friend.genres && friend.genres.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {friend.genres.slice(0, 3).map((genre: string) => (
                            <span
                              key={genre}
                              className="bg-gradient-to-r from-primary-500/20 to-primary-600/20 text-primary-300 px-3 py-1 rounded-xl text-xs font-medium border border-primary-500/30"
                            >
                              {genre}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/profile/${friend.id}`)}
                        className="p-3 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 transition-all hover:scale-110 shadow-lg"
                        title="Профиль"
                      >
                        <User size={20} className="text-white" />
                      </button>
                      <button
                        onClick={() => navigate(`/chat/${friend.id}`)}
                        className="p-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 transition-all hover:scale-110 shadow-lg shadow-primary-500/30"
                        title="Написать сообщение"
                      >
                        <MessageCircle size={20} className="text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative text-center py-20 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
              {/* Decorative gradient orbs */}
              <div className="absolute top-10 left-10 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-10 right-10 w-32 h-32 bg-primary-600/10 rounded-full blur-3xl"></div>

              <div className="relative">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-2xl flex items-center justify-center">
                  <Users size={40} className="text-slate-500" />
                </div>
                <p className="text-slate-300 text-xl font-semibold mb-2">У вас пока нет друзей</p>
                <p className="text-slate-500 text-sm">Найдите музыкантов через поиск</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
