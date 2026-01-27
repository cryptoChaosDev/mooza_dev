import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Check, X, MessageCircle, UserMinus, User } from 'lucide-react';
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

  const { data: requests, isLoading: requestsLoading } = useQuery({
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
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary-500/20 rounded-lg">
          <Users size={24} className="text-primary-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Друзья</h2>
      </div>

      {/* Friend Requests */}
      {requests && requests.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Заявки в друзья</h3>
            <span className="bg-primary-500 text-white text-xs px-2 py-1 rounded-full">
              {requests.length}
            </span>
          </div>
          <div className="space-y-3">
            {requests.map((request: any) => (
              <div key={request.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50 hover:border-primary-500/50 transition-all">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  {request.requester.avatar ? (
                    <img
                      src={`${import.meta.env.VITE_API_URL}${request.requester.avatar}`}
                      alt={`${request.requester.firstName} ${request.requester.lastName}`}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold text-lg">
                        {request.requester.firstName[0]}{request.requester.lastName[0]}
                      </span>
                    </div>
                  )}

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">
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
                      className="p-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
                      title="Принять"
                    >
                      <Check size={20} className="text-white" />
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(request.id)}
                      disabled={rejectMutation.isPending}
                      className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed transition-colors"
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
        <h3 className="text-lg font-semibold text-white mb-3">Мои друзья</h3>
        {friendsLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-slate-400 mt-3">Загрузка...</p>
          </div>
        ) : friends && friends.length > 0 ? (
          <div className="space-y-3">
            {friends.map((friend: any) => (
              <div key={friend.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50 hover:border-primary-500/50 transition-all">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  {friend.avatar ? (
                    <img
                      src={`${import.meta.env.VITE_API_URL}${friend.avatar}`}
                      alt={`${friend.firstName} ${friend.lastName}`}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold text-lg">
                        {friend.firstName[0]}{friend.lastName[0]}
                      </span>
                    </div>
                  )}

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">
                      {friend.firstName} {friend.lastName}
                    </p>
                    <p className="text-sm text-slate-400 truncate">
                      {friend.role && `${friend.role} • `}
                      {friend.city}
                    </p>
                    {friend.genres && friend.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {friend.genres.slice(0, 3).map((genre: string) => (
                          <span
                            key={genre}
                            className="bg-primary-500/20 text-primary-300 px-2 py-0.5 rounded-full text-xs"
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
                      className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                      title="Профиль"
                    >
                      <User size={20} className="text-white" />
                    </button>
                    <button
                      onClick={() => navigate(`/chat/${friend.id}`)}
                      className="p-2 rounded-lg bg-primary-500 hover:bg-primary-600 transition-colors"
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
          <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
            <Users size={48} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-lg">У вас пока нет друзей</p>
            <p className="text-slate-500 text-sm mt-1">Найдите музыкантов через поиск</p>
          </div>
        )}
      </div>
    </div>
  );
}
