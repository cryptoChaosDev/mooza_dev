import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, SlidersHorizontal, UserPlus, X, MessageCircle, User, Check } from 'lucide-react';
import { userAPI, friendshipAPI } from '../lib/api';
import { useNavigate } from 'react-router-dom';

const ROLES = ['Продюсер', 'Вокалист', 'Битмейкер', 'Композитор', 'Саунд-дизайнер', 'Диджей', 'Звукорежиссер'];
const GENRES = ['Hip-Hop', 'Trap', 'Drill', 'R&B', 'Pop', 'EDM', 'House', 'Rock', 'Jazz'];

export default function SearchPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string>('');

  const { data: users, isLoading } = useQuery({
    queryKey: ['search', query, selectedRole, selectedGenre],
    queryFn: async () => {
      const { data } = await userAPI.search({
        query: query || undefined,
        role: selectedRole || undefined,
        genre: selectedGenre || undefined
      });
      return data;
    },
  });

  const addFriendMutation = useMutation({
    mutationFn: friendshipAPI.sendRequest,
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      setSentRequests(prev => new Set(prev).add(userId));
      setErrorMessage('');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Не удалось отправить заявку';
      setErrorMessage(message);
      console.error('Friend request error:', error);

      setTimeout(() => setErrorMessage(''), 5000);
    },
  });

  const activeFiltersCount = [selectedRole, selectedGenre].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Search Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">
            Поиск пользователей
          </h2>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="relative p-3 rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 hover:border-primary-500/50 transition-all hover:scale-105 shadow-lg shadow-primary-500/10"
          >
            <SlidersHorizontal size={20} className="text-slate-300" />
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-semibold shadow-lg">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени, городу..."
            className="w-full pl-12 pr-4 py-4 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 transition-all shadow-lg"
          />
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 space-y-6 border border-slate-700/50 shadow-xl">
            {/* Role Filter */}
            <div>
              <label className="text-sm font-semibold text-slate-300 mb-3 block">Роль в музыке</label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    onClick={() => setSelectedRole(selectedRole === role ? '' : role)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      selectedRole === role
                        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30 scale-105'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:scale-105'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {/* Genre Filter */}
            <div>
              <label className="text-sm font-semibold text-slate-300 mb-3 block">Музыкальный жанр</label>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setSelectedGenre(selectedGenre === genre ? '' : genre)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      selectedGenre === genre
                        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30 scale-105'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:scale-105'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Filters */}
            {activeFiltersCount > 0 && (
              <button
                onClick={() => {
                  setSelectedRole('');
                  setSelectedGenre('');
                }}
                className="w-full py-3 text-sm font-semibold text-primary-400 hover:text-primary-300 transition-all hover:scale-105 rounded-xl border border-primary-500/20 hover:border-primary-500/50"
              >
                Сбросить все фильтры
              </button>
            )}
          </div>
        )}

        {/* Active Filter Chips */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedRole && (
              <button
                onClick={() => setSelectedRole('')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-primary-600/20 text-primary-300 rounded-xl text-sm font-medium border border-primary-500/30 hover:border-primary-500/50 transition-all hover:scale-105"
              >
                {selectedRole}
                <X size={16} />
              </button>
            )}
            {selectedGenre && (
              <button
                onClick={() => setSelectedGenre('')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-primary-600/20 text-primary-300 rounded-xl text-sm font-medium border border-primary-500/30 hover:border-primary-500/50 transition-all hover:scale-105"
              >
                {selectedGenre}
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-gradient-to-r from-red-500/20 to-red-600/20 border border-red-500/50 rounded-2xl p-4">
            <p className="text-red-300 text-center font-medium">{errorMessage}</p>
          </div>
        )}

        {/* Results */}
        {isLoading ? (
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
                    <div className="w-10 h-10 bg-slate-700/50 rounded-xl"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {users?.map((user: any) => (
              <div
                key={user.id}
                className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 hover:border-primary-500/50 transition-all hover:shadow-xl hover:shadow-primary-500/10 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary-500/0 via-primary-500/5 to-primary-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                <div className="relative flex items-center gap-4">
                  {/* Avatar */}
                  {user.avatar ? (
                    <img
                      src={`${import.meta.env.VITE_API_URL}${user.avatar}`}
                      alt={`${user.firstName} ${user.lastName}`}
                      className="w-16 h-16 rounded-2xl object-cover shadow-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg">
                      <span className="text-white font-bold text-xl">
                        {user.firstName[0]}{user.lastName[0]}
                      </span>
                    </div>
                  )}

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-lg truncate">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-sm text-slate-400">
                      {user.role && `${user.role} • `}
                      {user.city}
                    </p>
                    {user.genres && user.genres.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {user.genres.slice(0, 3).map((genre: string) => (
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
                      onClick={() => navigate(`/profile/${user.id}`)}
                      className="p-3 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 transition-all hover:scale-110 shadow-lg"
                      title="Профиль"
                    >
                      <User size={20} className="text-slate-300" />
                    </button>
                    <button
                      onClick={() => navigate(`/chat/${user.id}`)}
                      className="p-3 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 transition-all hover:scale-110 shadow-lg"
                      title="Написать сообщение"
                    >
                      <MessageCircle size={20} className="text-slate-300" />
                    </button>
                    {sentRequests.has(user.id) ? (
                      <button
                        disabled
                        className="p-3 rounded-xl bg-gradient-to-r from-green-500 to-green-600 transition-all shadow-lg shadow-green-500/30 cursor-default"
                        title="Заявка отправлена"
                      >
                        <Check size={20} className="text-white" />
                      </button>
                    ) : (
                      <button
                        onClick={() => addFriendMutation.mutate(user.id)}
                        disabled={addFriendMutation.isPending}
                        className="p-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed transition-all hover:scale-110 shadow-lg shadow-primary-500/30"
                        title="Добавить в друзья"
                      >
                        <UserPlus size={20} className="text-white" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {users?.length === 0 && !isLoading && (
              <div className="relative text-center py-20 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
                {/* Decorative gradient orbs */}
                <div className="absolute top-10 left-10 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-10 right-10 w-32 h-32 bg-primary-600/10 rounded-full blur-3xl"></div>

                <div className="relative">
                  <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-2xl flex items-center justify-center">
                    <Search size={40} className="text-slate-500" />
                  </div>
                  <p className="text-slate-300 text-xl font-semibold mb-2">Пользователи не найдены</p>
                  <p className="text-slate-500 text-sm">
                    {query || activeFiltersCount > 0
                      ? 'Попробуйте изменить параметры поиска'
                      : 'В базе данных пока нет других пользователей'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
