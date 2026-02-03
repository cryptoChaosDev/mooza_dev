import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, X, MessageCircle, Check, Users, Music, Mic, Disc, Radio, Guitar, Piano, Headphones, Filter, List } from 'lucide-react';
import { userAPI, referenceAPI, friendshipAPI } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import MultiLevelSearch from '../components/MultiLevelSearch';

// Icon mapping for fields of activity
const getFieldIcon = (name: string) => {
  const icons: Record<string, any> = {
    'Музыка': Music,
    'Звук': Headphones,
    'Вокал': Mic,
    'Инструменты': Guitar,
    'Продюсирование': Radio,
    'DJ': Disc,
    'Клавишные': Piano,
  };
  return icons[name] || Users;
};

export default function SearchPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedField, setSelectedField] = useState<any>(null);
  const [fieldUsers, setFieldUsers] = useState<any[]>([]);
  const [professionSearch, setProfessionSearch] = useState('');
  const [selectedProfessions, setSelectedProfessions] = useState<Set<string>>(new Set());
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');

  // Fetch fields of activity with user counts
  const { data: fieldsData, isLoading: fieldsLoading } = useQuery({
    queryKey: ['fieldsOfActivity'],
    queryFn: async () => {
      const { data } = await referenceAPI.getFieldsOfActivity();
      return data;
    },
  });

  // Search users by name (excluding current user)
  const { data: searchResults } = useQuery({
    queryKey: ['searchUsers', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const { data } = await userAPI.search({ query: searchQuery });
      return data.filter((user: any) => user.id !== currentUser?.id);
    },
    enabled: searchQuery.trim().length > 0,
  });

  // Get filtered fields based on search
  const displayedFields = searchQuery.trim() && searchResults
    ? fieldsData?.filter((field: any) => 
        searchResults.some((user: any) => user.fieldOfActivity?.id === field.id)
      ) || []
    : fieldsData || [];

  // Get users for selected field
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['usersByField', selectedField?.id],
    queryFn: async () => {
      if (!selectedField) return [];
      const { data } = await userAPI.search({ fieldOfActivityId: selectedField.id });
      return data;
    },
    enabled: !!selectedField && !searchQuery.trim(),
  });

  // Fetch professions for selected field
  const { data: professions, isLoading: professionsLoading } = useQuery({
    queryKey: ['professions', selectedField?.id],
    queryFn: async () => {
      if (!selectedField) return [];
      const { data } = await referenceAPI.getProfessions({ fieldOfActivityId: selectedField.id });
      return data;
    },
    enabled: !!selectedField,
  });

  // Filter professions by search
  const filteredProfessions = professions?.filter((prof: any) =>
    prof.name.toLowerCase().includes(professionSearch.toLowerCase())
  ) || [];

  // Get displayed users based on profession filter
  const displayedUsers = (() => {
    let sourceUsers = fieldUsers.length > 0 ? fieldUsers : (users || []);
    
    // Exclude current user
    sourceUsers = sourceUsers.filter((user: any) => user.id !== currentUser?.id);
    
    // Filter by selected professions
    if (selectedProfessions.size > 0) {
      sourceUsers = sourceUsers.filter((user: any) => {
        const userProfessions = user.userProfessions || [];
        return userProfessions.some((up: any) => 
          selectedProfessions.has(up.profession?.id)
        );
      });
    }
    
    return sourceUsers;
  })();

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

  // Handle clicking on a field card
  const handleFieldClick = (field: any) => {
    setSelectedProfessions(new Set());
    setProfessionSearch('');
    if (searchQuery.trim() && searchResults) {
      const usersInField = searchResults.filter((u: any) => u.fieldOfActivity?.id === field.id);
      setFieldUsers(usersInField);
    }
    setSelectedField(field);
  };

  // Handle back button
  const handleBack = () => {
    setSelectedField(null);
    setFieldUsers([]);
    setSelectedProfessions(new Set());
    setProfessionSearch('');
  };

  // Toggle profession selection
  const toggleProfession = (professionId: string) => {
    setSelectedProfessions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(professionId)) {
        newSet.delete(professionId);
      } else {
        newSet.add(professionId);
      }
      return newSet;
    });
  };

  if (selectedField) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        {/* Header with gradient backdrop */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
          <div className="relative max-w-7xl mx-auto px-4 pt-6 pb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-3 bg-slate-800/80 hover:bg-slate-700/80 rounded-2xl transition-all"
              >
                <X size={24} className="text-slate-300" />
              </button>
              <div className="p-3 bg-primary-500/20 rounded-2xl">
                {(() => {
                  const Icon = getFieldIcon(selectedField.name);
                  return <Icon size={28} className="text-primary-400" />;
                })()}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                {selectedField.name}
              </h2>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-24 space-y-6">
          {/* Error Message */}
          {errorMessage && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-center gap-2 animate-fade-in">
              <X size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Profession Filter */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-4">
              <Filter size={20} className="text-primary-400" />
              <h3 className="text-lg font-bold text-white">Фильтр по профессиям</h3>
              {selectedProfessions.size > 0 && (
                <span className="bg-primary-500 text-white text-xs px-2 py-1 rounded-full">
                  {selectedProfessions.size}
                </span>
              )}
            </div>

            {/* Profession Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={professionSearch}
                onChange={(e) => setProfessionSearch(e.target.value)}
                placeholder="Поиск профессий..."
                className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              />
            </div>

            {/* Profession Tags */}
            {professionsLoading ? (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 w-24 bg-slate-700/50 rounded-lg animate-pulse"></div>
                ))}
              </div>
            ) : filteredProfessions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {filteredProfessions.map((profession: any) => {
                  const isSelected = selectedProfessions.has(profession.id);
                  return (
                    <button
                      key={profession.id}
                      onClick={() => toggleProfession(profession.id)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30'
                          : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                      }`}
                    >
                      {profession.name}
                      {isSelected && <Check size={14} className="inline ml-1" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-400 text-sm">Профессии не найдены</p>
            )}
          </div>

          {/* Users count */}
          <h3 className="text-lg sm:text-xl font-bold text-white">
            {selectedField.name} <span className="text-slate-400 text-base font-normal">({displayedUsers.length} пользователей)</span>
          </h3>

          {/* Users list */}
          {usersLoading || professionsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-slate-700/50 rounded-2xl"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-700/50 rounded-lg w-1/3"></div>
                      <div className="h-3 bg-slate-700/50 rounded-lg w-1/4"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : displayedUsers.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayedUsers.map((user: any) => {
                const isSent = sentRequests.has(user.id);
                return (
                  <div
                    key={user.id}
                    className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 shadow-lg hover:shadow-primary-500/10"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <button onClick={() => navigate(`/profile/${user.id}`)} className="flex-shrink-0">
                        {user.avatar ? (
                          <img
                            src={`${import.meta.env.VITE_API_URL}${user.avatar}`}
                            alt={`${user.firstName} ${user.lastName}`}
                            className="w-14 h-14 rounded-2xl object-cover ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all"
                          />
                        ) : (
                          <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-purple-600 rounded-2xl flex items-center justify-center ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all">
                            <span className="text-white font-bold text-lg">
                              {user.firstName?.[0]}{user.lastName?.[0]}
                            </span>
                          </div>
                        )}
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => navigate(`/profile/${user.id}`)}
                          className="font-bold text-white text-lg hover:text-primary-400 transition-colors truncate block"
                        >
                          {user.firstName} {user.lastName}
                        </button>
                        {user.nickname && (
                          <p className="text-sm text-slate-400 truncate">@{user.nickname}</p>
                        )}
                        {user.city && (
                          <p className="text-xs text-slate-500 truncate mt-1">{user.city}</p>
                        )}
                        {/* User professions */}
                        {user.userProfessions && user.userProfessions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {user.userProfessions.slice(0, 3).map((up: any) => (
                              <span key={up.id} className="text-xs bg-primary-500/20 text-primary-300 px-2 py-0.5 rounded">
                                {up.profession?.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => navigate(`/messages/${user.id}`)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-all"
                      >
                        <MessageCircle size={16} />
                        <span className="hidden sm:inline">Сообщение</span>
                      </button>
                      {!isSent && (
                        <button
                          onClick={() => addFriendMutation.mutate(user.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-xl text-sm font-medium transition-all"
                        >
                          <UserPlus size={16} />
                          <span className="hidden sm:inline">В друзья</span>
                        </button>
                      )}
                      {isSent && (
                        <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500/10 text-green-400 rounded-xl text-sm font-medium">
                          <Check size={16} />
                          <span className="hidden sm:inline">Отправлено</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>

              <div className="relative text-center py-16 px-6">
                <div className="inline-flex p-6 bg-slate-700/30 rounded-3xl mb-6">
                  <Users size={64} className="text-slate-500" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Пока нет пользователей</h3>
                <p className="text-slate-400 text-lg">
                  {selectedProfessions.size > 0 
                    ? 'Нет пользователей с выбранными профессиями'
                    : 'В этой сфере пока никто не зарегистрирован'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Header with gradient backdrop */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
        <div className="relative max-w-7xl mx-auto px-4 pt-6 pb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-500/20 rounded-2xl">
              <Search size={28} className="text-primary-400" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Поиск
            </h2>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-24 space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('basic')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
              activeTab === 'basic'
                ? 'bg-primary-500 text-white'
                : 'bg-slate-800/50 text-slate-400 hover:text-white'
            }`}
          >
            <List size={18} />
            Базовый поиск
          </button>
          <button
            onClick={() => setActiveTab('advanced')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
              activeTab === 'advanced'
                ? 'bg-primary-500 text-white'
                : 'bg-slate-800/50 text-slate-400 hover:text-white'
            }`}
          >
            <Filter size={18} />
            Расширенный поиск
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'basic' ? (
          <>
            {/* Search Input */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl blur-xl"></div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск пользователей..."
                  className="w-full pl-12 pr-4 py-4 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 transition-all shadow-lg"
                />
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-center gap-2 animate-fade-in">
                <X size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Fields of Activity */}
            {fieldsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 animate-pulse">
                    <div className="flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-slate-700/50 rounded-full mb-4"></div>
                      <div className="h-6 bg-slate-700/50 rounded-lg w-3/4 mb-2"></div>
                      <div className="h-4 bg-slate-700/50 rounded-lg w-1/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedFields.length > 0 ? (
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-4">
                  Сферы деятельности <span className="text-slate-400 text-base font-normal">({displayedFields.length})</span>
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {displayedFields.map((field: any) => {
                    const Icon = getFieldIcon(field.name);
                    let userCount = searchQuery.trim() && searchResults
                      ? searchResults.filter((u: any) => u.fieldOfActivity?.id === field.id).length
                      : field.userCount;
                    
                    // Exclude current user from count when not searching
                    if (!searchQuery.trim() && currentUser?.fieldOfActivityId === field.id) {
                      userCount = Math.max(0, userCount - 1);
                    }
                    
                    return (
                      <button
                        key={field.id}
                        onClick={() => handleFieldClick(field)}
                        className="group relative overflow-hidden bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 shadow-lg hover:shadow-primary-500/20 hover:-translate-y-1 text-left"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        
                        <div className="relative flex flex-col items-center text-center">
                          <div className="p-4 bg-primary-500/20 rounded-2xl mb-4 group-hover:bg-primary-500/30 group-hover:scale-110 transition-all duration-300">
                            <Icon size={40} className="text-primary-400" />
                          </div>
                          <h4 className="font-bold text-white text-xl mb-2">{field.name}</h4>
                          
                          <div className="flex items-center gap-2 text-slate-400 text-sm bg-slate-800/50 px-3 py-1.5 rounded-full">
                            <Users size={14} />
                            <span>
                              {userCount} {getUserCountText(userCount)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : searchQuery.trim() ? (
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>

                <div className="relative text-center py-16 px-6">
                  <div className="inline-flex p-6 bg-slate-700/30 rounded-3xl mb-6">
                    <Search size={64} className="text-slate-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Ничего не найдено</h3>
                  <p className="text-slate-400 text-lg">Попробуйте изменить параметры поиска</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Users size={64} className="mx-auto text-slate-600 mb-4" />
                <p className="text-slate-400 text-lg">Нет доступных сфер</p>
                <p className="text-slate-500 text-sm mt-1">Сферы деятельности появятся позже</p>
              </div>
            )}
          </>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Multi-Level Search Filters */}
            <div className="lg:col-span-1">
              <MultiLevelSearch />
            </div>

            {/* Results will be displayed here when filters are applied */}
            <div className="lg:col-span-2">
              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
                <h3 className="text-lg font-bold text-white mb-4">Результаты поиска</h3>
                <p className="text-slate-400">
                  Используйте фильтры слева для поиска музыкантов по различным критериям.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function to format user count
function getUserCountText(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) {
    return 'участник';
  }
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) {
    return 'участника';
  }
  return 'участников';
}
