import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, SlidersHorizontal, UserPlus, X, MessageCircle, User } from 'lucide-react';
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

  const { data: users, isLoading } = useQuery({
    queryKey: ['search', query, selectedRole, selectedGenre],
    queryFn: async () => {
      if (!query && !selectedRole && !selectedGenre) return [];
      const { data } = await userAPI.search({
        query,
        role: selectedRole || undefined,
        genre: selectedGenre || undefined
      });
      return data;
    },
    enabled: query.length > 0 || !!selectedRole || !!selectedGenre,
  });

  const addFriendMutation = useMutation({
    mutationFn: friendshipAPI.sendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });

  const activeFiltersCount = [selectedRole, selectedGenre].filter(Boolean).length;

  return (
    <div className="space-y-4 p-4">
      {/* Search Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Поиск</h2>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <SlidersHorizontal size={20} className="text-slate-300" />
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени, городу..."
          className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
        />
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-slate-800 rounded-xl p-4 space-y-4 border border-slate-700">
          {/* Role Filter */}
          <div>
            <label className="text-sm text-slate-400 mb-2 block">Роль</label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => setSelectedRole(selectedRole === role ? '' : role)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    selectedRole === role
                      ? 'bg-primary-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          {/* Genre Filter */}
          <div>
            <label className="text-sm text-slate-400 mb-2 block">Жанр</label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((genre) => (
                <button
                  key={genre}
                  onClick={() => setSelectedGenre(selectedGenre === genre ? '' : genre)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    selectedGenre === genre
                      ? 'bg-primary-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
              className="w-full py-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              Сбросить фильтры
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
              className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/20 text-primary-300 rounded-full text-sm"
            >
              {selectedRole}
              <X size={14} />
            </button>
          )}
          {selectedGenre && (
            <button
              onClick={() => setSelectedGenre('')}
              className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/20 text-primary-300 rounded-full text-sm"
            >
              {selectedGenre}
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-slate-400 mt-3">Поиск...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users?.map((user: any) => (
            <div key={user.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50 hover:border-primary-500/50 transition-all">
              <div className="flex items-center gap-3">
                {/* Avatar */}
                {user.avatar ? (
                  <img
                    src={`${import.meta.env.VITE_API_URL}${user.avatar}`}
                    alt={`${user.firstName} ${user.lastName}`}
                    className="w-14 h-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-lg">
                      {user.firstName[0]}{user.lastName[0]}
                    </span>
                  </div>
                )}

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-sm text-slate-400">
                    {user.role && `${user.role} • `}
                    {user.city}
                  </p>
                  {user.genres && user.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {user.genres.slice(0, 3).map((genre: string) => (
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
                    onClick={() => navigate(`/profile/${user.id}`)}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                    title="Профиль"
                  >
                    <User size={20} className="text-slate-300" />
                  </button>
                  <button
                    onClick={() => navigate(`/chat/${user.id}`)}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                    title="Написать сообщение"
                  >
                    <MessageCircle size={20} className="text-slate-300" />
                  </button>
                  <button
                    onClick={() => addFriendMutation.mutate(user.id)}
                    disabled={addFriendMutation.isPending}
                    className="p-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
                    title="Добавить в друзья"
                  >
                    <UserPlus size={20} className="text-white" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {(query || activeFiltersCount > 0) && users?.length === 0 && (
            <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
              <Search size={48} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-lg">Ничего не найдено</p>
              <p className="text-slate-500 text-sm mt-1">Попробуйте изменить параметры поиска</p>
            </div>
          )}

          {!query && activeFiltersCount === 0 && (
            <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
              <Search size={48} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-lg">Начните поиск</p>
              <p className="text-slate-500 text-sm mt-1">Введите имя или используйте фильтры</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
