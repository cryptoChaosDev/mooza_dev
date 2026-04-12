import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, UserPlus, X, MessageCircle, Check, Users,
  SlidersHorizontal, ChevronLeft, ChevronRight, Loader2,
  Crown, BadgeCheck, Ban,
} from 'lucide-react';
import { friendshipAPI, userAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { usePresenceStore } from '../stores/presenceStore';
import {
  useSearchStore,
  useFieldsOfActivity,
  useDirections,
  useProfessions,
  useGenres,
  useWorkFormats,
  useEmploymentTypes,
  useSkillLevels,
  useAvailabilities,
  useGeographies,
} from '../stores/searchStore';
import FilterPanel from '../components/FilterPanel';
import BottomSheet from '../components/BottomSheet';

// ─── Tile gradients ────────────────────────────────────────────────────────────
const TILE_GRADIENTS = [
  'from-violet-600 to-purple-700',
  'from-primary-600 to-cyan-700',
  'from-rose-600 to-pink-700',
  'from-amber-500 to-orange-600',
  'from-emerald-600 to-teal-700',
  'from-sky-600 to-blue-700',
  'from-fuchsia-600 to-pink-700',
  'from-lime-600 to-green-700',
];

// ─── User card (3-column grid) ─────────────────────────────────────────────────
function UserCard({ user, currentUserId, sentRequests, friendIds, onMessage, onAddFriend, onNavigate }: {
  user: any;
  currentUserId?: string;
  sentRequests: Set<string>;
  friendIds: Set<string>;
  onMessage: (id: string) => void;
  onAddFriend: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const isSent = sentRequests.has(user.id);
  const isFriend = friendIds.has(user.id);
  const isOnline = usePresenceStore((s) => s.onlineUsers.has(user.id));
  const isMe = user.id === currentUserId;

  const professions = user.userProfessions?.slice(0, 2)
    .map((up: any) => up.profession?.name).filter(Boolean) ?? [];
  const subtitle = [
    professions.join(', ') || user.role,
    user.city,
  ].filter(Boolean).join(' · ');

  return (
    <div
      onClick={() => onNavigate(user.id)}
      className="bg-slate-900 border border-slate-800/60 rounded-2xl overflow-hidden cursor-pointer hover:border-slate-700 hover:bg-slate-800/50 transition-all group flex flex-col"
    >
      {/* Avatar area */}
      <div className="relative">
        {user.avatar ? (
          <img
            src={getAvatarUrl(user.avatar)!}
            alt={`${user.firstName} ${user.lastName}`}
            className="w-full aspect-square object-cover"
          />
        ) : (
          <div className="w-full aspect-square bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-3xl">
              {user.firstName?.[0]}{user.lastName?.[0]}
            </span>
          </div>
        )}
        {/* Online dot */}
        {isOnline && (
          <span className="absolute top-2 right-2 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
        )}
        {/* Badges */}
        <div className="absolute bottom-2 left-2 flex gap-1">
          {user.isPremium && (
            <span className="bg-amber-500/90 backdrop-blur rounded-md p-0.5" title="Premium">
              <Crown size={11} className="text-white" />
            </span>
          )}
          {user.isVerified && (
            <span className="bg-sky-500/90 backdrop-blur rounded-md p-0.5" title="Верифицирован">
              <BadgeCheck size={11} className="text-white" />
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-sm font-semibold text-white leading-tight truncate">
          {user.firstName} {user.lastName}
        </p>
        {subtitle && (
          <p className="text-xs text-slate-400 truncate mt-0.5 flex-1">{subtitle}</p>
        )}

        {/* Actions */}
        {!isMe && (
          <div
            className="flex items-center gap-1 mt-3"
            onClick={e => e.stopPropagation()}
          >
            {isFriend ? (
              <button
                onClick={() => onMessage(user.id)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-800 hover:bg-primary-500/20 hover:text-primary-400 text-slate-400 rounded-lg transition-all text-xs"
                title="Написать"
              >
                <MessageCircle size={13} />
              </button>
            ) : null}
            {isSent ? (
              <div className="flex-1 flex items-center justify-center py-1.5 text-emerald-400" title="Заявка отправлена">
                <Check size={13} />
              </div>
            ) : (
              <button
                onClick={() => onAddFriend(user.id)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-800 hover:bg-primary-500/20 hover:text-primary-400 text-slate-400 rounded-lg transition-all text-xs"
                title="Добавить в друзья"
              >
                <UserPlus size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-slate-900 border border-slate-800/60 rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-square bg-slate-800" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 bg-slate-800 rounded w-3/4" />
        <div className="h-3 bg-slate-800 rounded w-1/2" />
        <div className="h-7 bg-slate-800 rounded-lg mt-3" />
      </div>
    </div>
  );
}

// ─── Global search row (when query typed) ─────────────────────────────────────
function SearchResultRow({ user, sentRequests, friendIds, onMessage, onAddFriend, onNavigate }: {
  user: any;
  sentRequests: Set<string>;
  friendIds: Set<string>;
  onMessage: (id: string) => void;
  onAddFriend: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const isSent = sentRequests.has(user.id);
  const isFriend = friendIds.has(user.id);
  const isOnline = usePresenceStore((s) => s.onlineUsers.has(user.id));
  const professions = user.userProfessions?.slice(0, 2).map((up: any) => up.profession?.name).filter(Boolean) ?? [];
  const subtitle = [professions.join(', ') || user.role, user.city].filter(Boolean).join(' · ');

  return (
    <div
      onClick={() => onNavigate(user.id)}
      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer"
    >
      <div className="relative flex-shrink-0">
        {user.avatar ? (
          <img src={getAvatarUrl(user.avatar)!} alt="" className="w-11 h-11 rounded-full object-cover" />
        ) : (
          <div className="w-11 h-11 bg-gradient-to-br from-primary-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">{user.firstName?.[0]}{user.lastName?.[0]}</span>
          </div>
        )}
        {isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white truncate">{user.firstName} {user.lastName}</span>
          {user.isPremium && <Crown size={12} className="text-amber-400 flex-shrink-0" />}
          {user.isVerified && <BadgeCheck size={12} className="text-sky-400 flex-shrink-0" />}
          {user.isBlocked && <Ban size={12} className="text-red-400 flex-shrink-0" />}
        </div>
        {subtitle && <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
        {isFriend && (
          <button onClick={() => onMessage(user.id)} className="p-2 text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all" title="Написать">
            <MessageCircle size={16} />
          </button>
        )}
        {isSent ? (
          <div className="p-2 text-emerald-400"><Check size={16} /></div>
        ) : (
          <button onClick={() => onAddFriend(user.id)} className="p-2 text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all" title="Добавить">
            <UserPlus size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
type DrillView = 'fields' | 'directions' | 'professions' | 'users';

export default function SearchPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();

  const [nameQuery, setNameQuery] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState('');

  const { data: friendsData } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      const { data } = await friendshipAPI.getFriends();
      return data as { friendshipId: string; user: any }[];
    },
  });
  const friendIds = useMemo(() => new Set((friendsData ?? []).map((f: any) => f.user.id)), [friendsData]);

  // Drill-down state (independent from store to allow local navigation)
  const [view, setView] = useState<DrillView>('fields');
  const [selectedField, setSelectedField] = useState<{ id: string; name: string } | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<{ id: string; name: string } | null>(null);
  const [selectedProfession, setSelectedProfession] = useState<{ id: string; name: string } | null>(null);

  // Sync drill-down selections into global search store
  const { setFieldId, setDirectionId, setProfessionId, resetAllFilters } = useSearchStore();

  useEffect(() => {
    setFieldId(selectedField?.id ?? null);
  }, [selectedField]);
  useEffect(() => {
    setDirectionId(selectedDirection?.id ?? null);
  }, [selectedDirection]);
  useEffect(() => {
    setProfessionId(selectedProfession?.id ?? null);
  }, [selectedProfession]);

  // Debounced search query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(nameQuery), 300);
    return () => clearTimeout(t);
  }, [nameQuery]);

  // Reference data
  const { data: fields, isLoading: fieldsLoading } = useFieldsOfActivity(currentUser?.id);
  const { data: directions, isLoading: directionsLoading } = useDirections(selectedField?.id, currentUser?.id);
  const { data: professions, isLoading: professionsLoading } = useProfessions(selectedDirection?.id, currentUser?.id);

  // Secondary filters from store
  const {
    genreId, workFormatId, employmentTypeId, skillLevelId, availabilityId, geographyId, priceMin, priceMax,
    setGenreId, setWorkFormatId, setEmploymentTypeId, setSkillLevelId, setAvailabilityId, setGeographyId, setPriceMin, setPriceMax,
  } = useSearchStore();

  const { data: genres } = useGenres();
  const { data: workFormats } = useWorkFormats();
  const { data: employmentTypes } = useEmploymentTypes();
  const { data: skillLevels } = useSkillLevels();
  const { data: availabilities } = useAvailabilities();
  const { data: geographies } = useGeographies();

  const hasSecondaryFilters = !!(genreId || workFormatId || employmentTypeId || skillLevelId || availabilityId || geographyId || priceMin || priceMax);

  // ── Global search query (bypasses drill-down) ─────────────────────────────
  const isSearchMode = debouncedName.trim().length > 0;

  const { data: globalSearchUsers, isLoading: globalSearchLoading } = useQuery({
    queryKey: ['globalSearch', debouncedName],
    queryFn: async () => {
      const { data } = await userAPI.search({ query: debouncedName.trim() });
      return (data as any[]).filter((u: any) => u.id !== currentUser?.id);
    },
    enabled: isSearchMode,
  });

  // ── Users in profession view — build filters directly from local state ────
  const professionFilters = useMemo(() => ({
    professionId: selectedProfession?.id || undefined,
    genreId: genreId || undefined,
    workFormatId: workFormatId || undefined,
    employmentTypeId: employmentTypeId || undefined,
    skillLevelId: skillLevelId || undefined,
    availabilityId: availabilityId || undefined,
    geographyId: geographyId || undefined,
    priceMin: priceMin || undefined,
    priceMax: priceMax || undefined,
    limit: 100,
    page: 1,
  }), [selectedProfession?.id, genreId, workFormatId, employmentTypeId, skillLevelId, availabilityId, geographyId, priceMin, priceMax]);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['searchResults', professionFilters],
    queryFn: async () => {
      const { data } = await (await import('../lib/api')).referenceAPI.searchMusicians(professionFilters);
      return data;
    },
    enabled: view === 'users' && !!selectedProfession,
  });

  const professionUsers = useMemo(() => {
    return (usersData?.results || [])
      .map((r: any) => r.user ?? r)
      .filter((u: any) => u.id !== currentUser?.id);
  }, [usersData, currentUser?.id]);

  // ── Active secondary filter chips ─────────────────────────────────────────
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (genreId && genres?.find(g => g.id === genreId))
      chips.push({ key: 'genre', label: genres!.find(g => g.id === genreId)!.name, clear: () => setGenreId(null) });
    if (workFormatId && workFormats?.find(w => w.id === workFormatId))
      chips.push({ key: 'wf', label: workFormats!.find(w => w.id === workFormatId)!.name, clear: () => setWorkFormatId(null) });
    if (employmentTypeId && employmentTypes?.find(e => e.id === employmentTypeId))
      chips.push({ key: 'et', label: employmentTypes!.find(e => e.id === employmentTypeId)!.name, clear: () => setEmploymentTypeId(null) });
    if (skillLevelId && skillLevels?.find(s => s.id === skillLevelId))
      chips.push({ key: 'sl', label: skillLevels!.find(s => s.id === skillLevelId)!.name, clear: () => setSkillLevelId(null) });
    if (availabilityId && availabilities?.find(a => a.id === availabilityId))
      chips.push({ key: 'av', label: availabilities!.find(a => a.id === availabilityId)!.name, clear: () => setAvailabilityId(null) });
    if (geographyId && geographies?.find(g => g.id === geographyId))
      chips.push({ key: 'geo', label: geographies!.find(g => g.id === geographyId)!.name, clear: () => setGeographyId(null) });
    if (priceMin || priceMax)
      chips.push({ key: 'price', label: `${priceMin || '0'} — ${priceMax || '∞'} ₽`, clear: () => { setPriceMin(''); setPriceMax(''); } });
    return chips;
  }, [genreId, workFormatId, employmentTypeId, skillLevelId, availabilityId, geographyId, priceMin, priceMax, genres, workFormats, employmentTypes, skillLevels, availabilities, geographies]);

  // ── Friend request ─────────────────────────────────────────────────────────
  const addFriendMutation = useMutation({
    mutationFn: friendshipAPI.sendRequest,
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      setSentRequests(prev => new Set(prev).add(userId));
      setErrorMessage('');
    },
    onError: (error: any) => {
      setErrorMessage(error?.response?.data?.error || 'Не удалось отправить заявку');
      setTimeout(() => setErrorMessage(''), 4000);
    },
  });

  // ── Drill-down handlers ────────────────────────────────────────────────────
  const handleFieldClick = (field: { id: string; name: string }) => {
    setSelectedField(field);
    setSelectedDirection(null);
    setSelectedProfession(null);
    setView('directions');
  };

  const handleDirectionClick = (dir: { id: string; name: string }) => {
    setSelectedDirection(dir);
    setSelectedProfession(null);
    setView('professions');
  };

  const handleProfessionClick = (prof: { id: string; name: string }) => {
    setSelectedProfession(prof);
    setView('users');
  };

  const goBack = () => {
    if (view === 'directions') {
      setSelectedField(null);
      setView('fields');
    } else if (view === 'professions') {
      setSelectedDirection(null);
      setView('directions');
    } else if (view === 'users') {
      setSelectedProfession(null);
      // Clear secondary filters too
      resetAllFilters();
      setSelectedField(selectedField);   // preserve breadcrumb
      setSelectedDirection(selectedDirection);
      setView('professions');
    }
  };

  const goToField = () => {
    setSelectedDirection(null);
    setSelectedProfession(null);
    resetAllFilters();
    setSelectedField(selectedField);
    setView('directions');
  };

  const goToDirection = () => {
    setSelectedProfession(null);
    resetAllFilters();
    setSelectedField(selectedField);
    setSelectedDirection(selectedDirection);
    setView('professions');
  };

  const resetAll = () => {
    setSelectedField(null);
    setSelectedDirection(null);
    setSelectedProfession(null);
    resetAllFilters();
    setView('fields');
  };

  // ── Breadcrumb ─────────────────────────────────────────────────────────────
  const breadcrumb = useMemo(() => {
    const crumbs: { label: string; onClick: () => void }[] = [];
    if (selectedField) crumbs.push({ label: selectedField.name, onClick: goToField });
    if (selectedDirection) crumbs.push({ label: selectedDirection.name, onClick: goToDirection });
    if (selectedProfession) crumbs.push({ label: selectedProfession.name, onClick: () => {} });
    return crumbs;
  }, [selectedField, selectedDirection, selectedProfession]);

  const showBreadcrumb = view !== 'fields' && !isSearchMode;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 space-y-3">

          {/* Title row */}
          <div className="flex items-center gap-2">
            {showBreadcrumb && (
              <button
                onClick={goBack}
                className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <Search size={18} className="text-primary-400 flex-shrink-0" />
            <h2 className="text-lg font-bold text-white">Поиск</h2>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input
              type="text"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Поиск по имени, нику, городу..."
              className="w-full pl-8 pr-9 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600 transition-colors"
            />
            {nameQuery && (
              <button onClick={() => setNameQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Breadcrumb */}
          {showBreadcrumb && (
            <div className="flex items-center gap-1 text-xs overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <button onClick={resetAll} className="text-slate-500 hover:text-slate-300 flex-shrink-0 transition-colors">
                Сферы
              </button>
              {breadcrumb.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1 flex-shrink-0">
                  <ChevronRight size={12} className="text-slate-600" />
                  <button
                    onClick={crumb.onClick}
                    className={`transition-colors ${i === breadcrumb.length - 1 ? 'text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Filter chips row (users view only) */}
          {view === 'users' && !isSearchMode && (
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setFiltersOpen(true)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                  hasSecondaryFilters
                    ? 'bg-primary-500/20 border-primary-500/50 text-primary-400'
                    : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'
                }`}
              >
                <SlidersHorizontal size={14} />
                <span>Фильтры</span>
                {activeChips.length > 0 && (
                  <span className="bg-primary-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {activeChips.length}
                  </span>
                )}
              </button>
              {activeChips.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {activeChips.map(chip => (
                    <div key={chip.key} className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-primary-500/20 border border-primary-500/40 rounded-full flex-shrink-0">
                      <span className="text-primary-300 text-xs whitespace-nowrap">{chip.label}</span>
                      <button onClick={chip.clear} className="text-primary-400 hover:text-white transition-colors">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {errorMessage && (
        <div className="max-w-7xl mx-auto px-4 mt-3">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-center gap-2">
            <X size={16} />
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 pb-24">

        {/* ══ GLOBAL SEARCH MODE ══ */}
        {isSearchMode && (
          <div className="mt-4">
            {globalSearchLoading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/60">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                    <div className="w-11 h-11 rounded-full bg-slate-800" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-slate-800 rounded w-2/5" />
                      <div className="h-3 bg-slate-800 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : globalSearchUsers && globalSearchUsers.length > 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/60">
                {globalSearchUsers.map((user: any) => (
                  <SearchResultRow
                    key={user.id}
                    user={user}
                    sentRequests={sentRequests}
                    friendIds={friendIds}
                    onMessage={id => navigate(`/messages/${id}`)}
                    onAddFriend={id => addFriendMutation.mutate(id)}
                    onNavigate={id => navigate(`/profile/${id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="p-4 bg-slate-800/50 rounded-2xl mb-4">
                  <Search size={32} className="text-slate-500" />
                </div>
                <p className="text-white font-semibold mb-1">Ничего не найдено</p>
                <p className="text-slate-400 text-sm">Попробуйте другой запрос</p>
              </div>
            )}
          </div>
        )}

        {/* ══ FIELDS VIEW ══ */}
        {!isSearchMode && view === 'fields' && (
          <div className="mt-6">
            <p className="text-slate-400 text-sm mb-4">Выберите сферу деятельности</p>
            {fieldsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-24 bg-slate-800/50 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : fields && fields.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {fields.map((field, i) => (
                  <button
                    key={field.id}
                    onClick={() => handleFieldClick(field)}
                    className={`relative overflow-hidden rounded-2xl p-5 text-left bg-gradient-to-br ${TILE_GRADIENTS[i % TILE_GRADIENTS.length]} hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg group`}
                  >
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                    <div className="relative">
                      <p className="text-white font-semibold text-sm leading-snug">{field.name}</p>
                      {field.userCount != null && (
                        <p className="text-white/70 text-xs mt-1">{field.userCount} уч.</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="absolute right-3 bottom-3 text-white/50 group-hover:text-white/80 transition-colors" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Сферы не найдены</p>
            )}
          </div>
        )}

        {/* ══ DIRECTIONS VIEW ══ */}
        {!isSearchMode && view === 'directions' && (
          <div className="mt-4">
            <p className="text-slate-400 text-sm mb-3">Выберите направление</p>
            {directionsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 bg-slate-800/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : directions && directions.length > 0 ? (
              <div className="space-y-2">
                {directions.map(dir => (
                  <button
                    key={dir.id}
                    onClick={() => handleDirectionClick(dir)}
                    className="w-full flex items-center justify-between px-4 py-3.5 bg-slate-900 border border-slate-800/60 hover:border-slate-700 hover:bg-slate-800/50 rounded-xl transition-all text-left group"
                  >
                    <span className="text-white font-medium text-sm">{dir.name}</span>
                    <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-300 transition-colors flex-shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Направления не найдены</p>
            )}
          </div>
        )}

        {/* ══ PROFESSIONS VIEW ══ */}
        {!isSearchMode && view === 'professions' && (
          <div className="mt-4">
            <p className="text-slate-400 text-sm mb-3">Выберите профессию</p>
            {professionsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 bg-slate-800/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : professions && professions.length > 0 ? (
              <div className="space-y-2">
                {professions.map(prof => (
                  <button
                    key={prof.id}
                    onClick={() => handleProfessionClick(prof)}
                    className="w-full flex items-center justify-between px-4 py-3.5 bg-slate-900 border border-slate-800/60 hover:border-slate-700 hover:bg-slate-800/50 rounded-xl transition-all text-left group"
                  >
                    <span className="text-white font-medium text-sm">{prof.name}</span>
                    <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-300 transition-colors flex-shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Профессии не найдены</p>
            )}
          </div>
        )}

        {/* ══ USERS VIEW ══ */}
        {!isSearchMode && view === 'users' && (
          <div className="flex gap-6 mt-4">
            {/* Desktop filter sidebar */}
            <aside className="hidden lg:block w-64 flex-shrink-0">
              <div className="sticky top-36 bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <FilterPanel showHeader={false} />
              </div>
            </aside>

            <main className="flex-1 min-w-0">
              {/* Count row */}
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                {usersLoading
                  ? <Loader2 size={14} className="animate-spin text-primary-400" />
                  : <Users size={14} />}
                <span>
                  {usersLoading
                    ? 'Загрузка...'
                    : `${professionUsers.length} ${getUserCountText(professionUsers.length)}`}
                </span>
              </div>

              {/* 3-column grid */}
              {usersLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : professionUsers.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {professionUsers.map((user: any) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      currentUserId={currentUser?.id}
                      sentRequests={sentRequests}
                      friendIds={friendIds}
                      onMessage={id => navigate(`/messages/${id}`)}
                      onAddFriend={id => addFriendMutation.mutate(id)}
                      onNavigate={id => navigate(`/profile/${id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-16 text-center">
                  <div className="p-4 bg-slate-800/50 rounded-2xl mb-4">
                    <Users size={32} className="text-slate-500" />
                  </div>
                  <p className="text-white font-semibold mb-1">Пользователи не найдены</p>
                  <p className="text-slate-400 text-sm">
                    {hasSecondaryFilters ? 'Попробуйте изменить фильтры' : 'В этой профессии пока нет участников'}
                  </p>
                  {hasSecondaryFilters && (
                    <button
                      onClick={() => { resetAllFilters(); setSelectedField(selectedField); setSelectedDirection(selectedDirection); setProfessionId(selectedProfession?.id ?? null); }}
                      className="mt-3 px-4 py-1.5 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 rounded-lg text-sm transition-all"
                    >
                      Сбросить фильтры
                    </button>
                  )}
                </div>
              )}
            </main>
          </div>
        )}
      </div>

      {/* ── Filters bottom sheet (mobile) ── */}
      <BottomSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Фильтры"
        height="full"
      >
        <FilterPanel showHeader={false} />
      </BottomSheet>
    </div>
  );
}

// ─── Helper ────────────────────────────────────────────────────────────────────
function getUserCountText(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'участник';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'участника';
  return 'участников';
}
