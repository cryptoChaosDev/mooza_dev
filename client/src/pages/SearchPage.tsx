import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, UserPlus, X, MessageCircle, Check, Users,
  SlidersHorizontal, ArrowUpDown, ChevronDown, Loader2,
} from 'lucide-react';
import { friendshipAPI, userAPI } from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { usePresenceStore } from '../stores/presenceStore';
import {
  useSearchStore,
  useSearchResults,
  useFieldsOfActivity,
  useDirections,
  useProfessions,
  useServices,
  useGenres,
  useWorkFormats,
  useEmploymentTypes,
  useSkillLevels,
  useAvailabilities,
  useGeographies,
} from '../stores/searchStore';
import FilterPanel from '../components/FilterPanel';
import BottomSheet from '../components/BottomSheet';

// ─── Sort ─────────────────────────────────────────────────────────────────────
type SortOption = 'relevance' | 'name_asc' | 'name_desc';
const SORT_CYCLE: SortOption[] = ['relevance', 'name_asc', 'name_desc'];
const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'По релевантности',
  name_asc: 'По имени А→Я',
  name_desc: 'По имени Я→А',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getUserCountText(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'участник';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'участника';
  return 'участников';
}

// ─── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-3.5 border border-slate-700/50 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-slate-700/50 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-slate-700/50 rounded w-2/3" />
          <div className="h-3 bg-slate-700/50 rounded w-1/3" />
          <div className="h-3 bg-slate-700/50 rounded w-1/2" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-7 bg-slate-700/50 rounded-lg flex-1" />
        <div className="h-7 bg-slate-700/50 rounded-lg flex-1" />
      </div>
    </div>
  );
}

// ─── User card ─────────────────────────────────────────────────────────────────
interface UserCardProps {
  user: any;
  sentRequests: Set<string>;
  onMessage: (id: string) => void;
  onAddFriend: (id: string) => void;
  onNavigate: (id: string) => void;
}
function UserCard({ user, sentRequests, onMessage, onAddFriend, onNavigate }: UserCardProps) {
  const isSent = sentRequests.has(user.id);
  const match = user.matchPercent as number | undefined;
  const matchColor = match == null ? '' : match === 100 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : match >= 70 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-slate-700/50 text-slate-400 border-slate-600/30';
  const isOnline = usePresenceStore((s) => s.onlineUsers.has(user.id));
  return (
    <div className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-3.5 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 shadow-md hover:shadow-primary-500/10">
      <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      {match != null && (
        <div className={`absolute top-2.5 right-2.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${matchColor}`}>
          {match}%
        </div>
      )}
      <div className="flex items-start gap-3">
        <button onClick={() => onNavigate(user.id)} className="flex-shrink-0 relative">
          {user.avatar ? (
            <img
              src={`${import.meta.env.VITE_API_URL}${user.avatar}`}
              alt={`${user.firstName} ${user.lastName}`}
              className="w-10 h-10 rounded-xl object-cover ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all"
            />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-purple-600 rounded-xl flex items-center justify-center ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all">
              <span className="text-white font-bold text-sm">
                {user.firstName?.[0]}{user.lastName?.[0]}
              </span>
            </div>
          )}
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-800 rounded-full" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => onNavigate(user.id)}
            className="font-semibold text-white text-sm hover:text-primary-400 transition-colors truncate block"
          >
            {user.firstName} {user.lastName}
          </button>
          {user.nickname && <p className="text-xs text-slate-400 truncate">@{user.nickname}</p>}
          {user.city && <p className="text-xs text-slate-500 truncate">{user.city}</p>}
          {user.userProfessions && user.userProfessions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {user.userProfessions.slice(0, 2).map((up: any) => (
                <span key={up.id} className="text-xs bg-primary-500/20 text-primary-300 px-1.5 py-0.5 rounded">
                  {up.profession?.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 mt-3">
        <button
          onClick={() => onMessage(user.id)}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-all"
        >
          <MessageCircle size={13} />
          <span className="hidden sm:inline">Сообщение</span>
        </button>
        {isSent ? (
          <div className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs font-medium">
            <Check size={13} />
            <span className="hidden sm:inline">Отправлено</span>
          </div>
        ) : (
          <button
            onClick={() => onAddFriend(user.id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-lg text-xs font-medium transition-all"
          >
            <UserPlus size={13} />
            <span className="hidden sm:inline">В друзья</span>
          </button>
        )}
      </div>
    </div>
  );
}


// ─── Sort sheet ────────────────────────────────────────────────────────────────
function SortSheet({ isOpen, onClose, value, onChange }: {
  isOpen: boolean; onClose: () => void;
  value: SortOption; onChange: (v: SortOption) => void;
}) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Сортировка" height="auto">
      <div className="px-4 py-2 space-y-1">
        {SORT_CYCLE.map((key) => (
          <button
            key={key}
            onClick={() => { onChange(key); onClose(); }}
            className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm transition-colors ${
              value === key
                ? 'bg-primary-500/20 text-primary-300'
                : 'text-slate-200 hover:bg-slate-700/40 hover:text-white'
            }`}
          >
            <span>{SORT_LABELS[key]}</span>
            {value === key && <Check size={14} className="text-primary-400" />}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

// ─── Desktop sort dropdown ─────────────────────────────────────────────────────
function SortDropdown({ value, onChange }: { value: SortOption; onChange: (v: SortOption) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white transition-all"
      >
        <SlidersHorizontal size={14} />
        {SORT_LABELS[value]}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-slate-800 border border-slate-600/50 rounded-xl shadow-xl overflow-hidden">
            {SORT_CYCLE.map((key) => (
              <button
                key={key}
                onClick={() => { onChange(key); setOpen(false); }}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                  value === key
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`}
              >
                {SORT_LABELS[key]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();

  const [nameQuery, setNameQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [allFiltersOpen, setAllFiltersOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState('');

  // Debounced name (300ms)
  const [debouncedName, setDebouncedName] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(nameQuery), 300);
    return () => clearTimeout(t);
  }, [nameQuery]);

  // Store
  const {
    fieldId, directionId, professionId, serviceId, genreId,
    workFormatId, employmentTypeId, skillLevelId, availabilityId,
    geographyId, priceMin, priceMax,
    setFieldId, setDirectionId, setProfessionId, setServiceId, setGenreId,
    setWorkFormatId, setEmploymentTypeId, setSkillLevelId, setAvailabilityId,
    setGeographyId, setPriceMin, setPriceMax,
    resetAllFilters, getFilters, setPage, page,
  } = useSearchStore();

  // Reference data (for active chip labels only — FilterPanel fetches its own copy via React Query cache)
  const { data: fields }          = useFieldsOfActivity();
  const { data: directions }      = useDirections(fieldId || undefined);
  const { data: professions }     = useProfessions(directionId || undefined);
  const { data: services }        = useServices(directionId || undefined);
  const { data: genres }          = useGenres();
  const { data: workFormats }     = useWorkFormats();
  const { data: employmentTypes } = useEmploymentTypes();
  const { data: skillLevels }     = useSkillLevels();
  const { data: availabilities }  = useAvailabilities();
  const { data: geographies }     = useGeographies();

  // Whether any profile-based filter is active
  const hasProfileFilters = !!(fieldId || directionId || professionId || serviceId || genreId || workFormatId || employmentTypeId || skillLevelId || availabilityId || geographyId || priceMin || priceMax);

  // ── Default: all users (or name search) — no profile filters needed ──
  const { data: defaultUsers, isLoading: defaultLoading } = useQuery({
    queryKey: ['users', debouncedName],
    queryFn: async () => {
      const { data } = await userAPI.search(
        debouncedName.trim() ? { query: debouncedName.trim() } : {}
      );
      return (data as any[]).filter((u: any) => u.id !== currentUser?.id);
    },
    enabled: !hasProfileFilters,
  });

  // ── Profile-filter search — only when filter chips are active ──
  const filters = useMemo(() => ({
    ...getFilters(),
    ...(debouncedName.trim() ? { query: debouncedName.trim() } : {}),
  }), [fieldId, directionId, professionId, serviceId, genreId, workFormatId, employmentTypeId, skillLevelId, availabilityId, geographyId, priceMin, priceMax, debouncedName, page]);

  const { data: searchData, isLoading: searchLoading, isFetching: searchFetching } = useSearchResults(filters);

  // Pick the right source depending on mode
  const isLoading = hasProfileFilters ? searchLoading : defaultLoading;
  const isFetching = hasProfileFilters ? searchFetching : false;

  // Compute match % for a search result (only when profile filters are active)
  const computeMatch = (sp: any, userData: any): number | null => {
    const checks: boolean[] = [];
    if (fieldId) checks.push(userData?.fieldOfActivity?.id === fieldId);
    if (directionId) checks.push(userData?.userProfessions?.some((up: any) => up.profession?.directionId === directionId) ?? false);
    if (professionId) checks.push(userData?.userProfessions?.some((up: any) => up.profession?.id === professionId) ?? false);
    if (serviceId) checks.push(sp?.services?.some((s: any) => s.id === serviceId) ?? false);
    if (genreId) checks.push(sp?.genres?.some((g: any) => g.id === genreId) ?? false);
    if (workFormatId) checks.push(sp?.workFormats?.some((w: any) => w.id === workFormatId) ?? false);
    if (employmentTypeId) checks.push(sp?.employmentTypes?.some((e: any) => e.id === employmentTypeId) ?? false);
    if (skillLevelId) checks.push(sp?.skillLevels?.some((s: any) => s.id === skillLevelId) ?? false);
    if (availabilityId) checks.push(sp?.availabilities?.some((a: any) => a.id === availabilityId) ?? false);
    if (geographyId) checks.push(sp?.geographies?.some((g: any) => g.id === geographyId) ?? false);
    if (checks.length === 0) return null;
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  };

  // Sort results client-side
  const results = useMemo(() => {
    let list: any[];
    if (hasProfileFilters) {
      list = (searchData?.results || [])
        .filter((r: any) => (r.user ?? r).id !== currentUser?.id)
        .map((r: any) => ({ ...(r.user ?? r), matchPercent: computeMatch(r.searchProfile, r.user) }));
    } else {
      list = defaultUsers || [];
    }
    if (sortBy === 'name_asc') return [...list].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    if (sortBy === 'name_desc') return [...list].sort((a, b) => `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`));
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchData, defaultUsers, hasProfileFilters, sortBy, currentUser?.id, fieldId, directionId, professionId, serviceId, genreId, workFormatId, employmentTypeId, skillLevelId, availabilityId, geographyId]);

  const totalCount = hasProfileFilters ? (searchData?.pagination?.totalCount ?? 0) : (defaultUsers?.length ?? 0);
  const totalPages = hasProfileFilters ? (searchData?.pagination?.totalPages ?? 1) : 1;
  const anyLoading = isLoading || isFetching;

  // Active filter chips — only selected values, each with its own clear action
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    const clearAttrs = () => {
      setWorkFormatId(null); setEmploymentTypeId(null); setSkillLevelId(null);
      setAvailabilityId(null); setGeographyId(null); setPriceMin(''); setPriceMax('');
    };
    const p1 = () => setPage(1);
    if (fieldId && fields?.find(f => f.id === fieldId))
      chips.push({ key: 'field', label: fields!.find(f => f.id === fieldId)!.name, clear: () => { setFieldId(null); setDirectionId(null); setProfessionId(null); setServiceId(null); setGenreId(null); clearAttrs(); p1(); } });
    if (directionId && directions?.find(d => d.id === directionId))
      chips.push({ key: 'direction', label: directions!.find(d => d.id === directionId)!.name, clear: () => { setDirectionId(null); setProfessionId(null); setServiceId(null); setGenreId(null); clearAttrs(); p1(); } });
    if (professionId && professions?.find(p => p.id === professionId))
      chips.push({ key: 'profession', label: professions!.find(p => p.id === professionId)!.name, clear: () => { setProfessionId(null); setServiceId(null); setGenreId(null); p1(); } });
    if (serviceId && services?.find(s => s.id === serviceId))
      chips.push({ key: 'service', label: services!.find(s => s.id === serviceId)!.name, clear: () => { setServiceId(null); setGenreId(null); p1(); } });
    if (genreId && genres?.find(g => g.id === genreId))
      chips.push({ key: 'genre', label: genres!.find(g => g.id === genreId)!.name, clear: () => { setGenreId(null); p1(); } });
    if (workFormatId && workFormats?.find(w => w.id === workFormatId))
      chips.push({ key: 'workFormat', label: workFormats!.find(w => w.id === workFormatId)!.name, clear: () => { setWorkFormatId(null); p1(); } });
    if (employmentTypeId && employmentTypes?.find(e => e.id === employmentTypeId))
      chips.push({ key: 'employmentType', label: employmentTypes!.find(e => e.id === employmentTypeId)!.name, clear: () => { setEmploymentTypeId(null); p1(); } });
    if (skillLevelId && skillLevels?.find(s => s.id === skillLevelId))
      chips.push({ key: 'skillLevel', label: skillLevels!.find(s => s.id === skillLevelId)!.name, clear: () => { setSkillLevelId(null); p1(); } });
    if (availabilityId && availabilities?.find(a => a.id === availabilityId))
      chips.push({ key: 'availability', label: availabilities!.find(a => a.id === availabilityId)!.name, clear: () => { setAvailabilityId(null); p1(); } });
    if (geographyId && geographies?.find(g => g.id === geographyId))
      chips.push({ key: 'geography', label: geographies!.find(g => g.id === geographyId)!.name, clear: () => { setGeographyId(null); p1(); } });
    if (priceMin || priceMax)
      chips.push({ key: 'price', label: `${priceMin || '0'} — ${priceMax || '∞'} ₽`, clear: () => { setPriceMin(''); setPriceMax(''); p1(); } });
    return chips;
  }, [fieldId, directionId, professionId, serviceId, genreId, workFormatId, employmentTypeId, skillLevelId, availabilityId, geographyId, priceMin, priceMax, fields, directions, professions, services, genres, workFormats, employmentTypes, skillLevels, availabilities, geographies]);

  // Friend request
  const addFriendMutation = useMutation({
    mutationFn: friendshipAPI.sendRequest,
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      setSentRequests((prev) => new Set(prev).add(userId));
      setErrorMessage('');
    },
    onError: (error: any) => {
      setErrorMessage(error?.response?.data?.error || 'Не удалось отправить заявку');
      setTimeout(() => setErrorMessage(''), 5000);
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* ── Header ── */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-primary-500/20 rounded-xl">
              <Search size={20} className="text-primary-400" />
            </div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Поиск
            </h2>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Поиск по имени или нику..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-800/80 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 transition-all"
            />
            {nameQuery && (
              <button
                onClick={() => setNameQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* ── Mobile filter bar ── */}
          <div className="flex items-center gap-2 mt-3 lg:hidden">
            {/* Filters button */}
            <button
              onClick={() => setAllFiltersOpen(true)}
              className={`relative flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                activeChips.length > 0
                  ? 'bg-primary-500/20 border-primary-500/50 text-primary-400'
                  : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              <SlidersHorizontal size={15} />
              <span>Фильтры</span>
              {activeChips.length > 0 && (
                <span className="bg-primary-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                  {activeChips.length}
                </span>
              )}
            </button>

            {/* Sort button */}
            <button
              onClick={() => setSortSheetOpen(true)}
              title={SORT_LABELS[sortBy]}
              className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border transition-all ${
                sortBy !== 'relevance'
                  ? 'bg-primary-500/20 border-primary-500/50 text-primary-400'
                  : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              <ArrowUpDown size={16} />
            </button>

            {/* Active filter chips */}
            {activeChips.length > 0 && (
              <>
                <div className="w-px h-6 bg-slate-700/60 flex-shrink-0" />
                <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {activeChips.map((chip) => (
                    <div key={chip.key} className="flex items-center gap-1 pl-3 pr-2 py-1.5 bg-primary-500/20 border border-primary-500/50 rounded-full flex-shrink-0">
                      <span className="text-primary-300 text-sm font-medium whitespace-nowrap leading-none">{chip.label}</span>
                      <button onClick={chip.clear} className="text-primary-400 hover:text-white transition-colors ml-0.5">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="max-w-7xl mx-auto px-4 pb-24">
        <div className="flex gap-6">

          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-4 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-4">
              <FilterPanel />
            </div>
          </aside>

          {/* Results */}
          <main className="flex-1 min-w-0 space-y-4 mt-4">

            {/* Error */}
            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-center gap-2">
                <X size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Count + desktop sort */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                {anyLoading
                  ? <Loader2 size={15} className="animate-spin text-primary-400" />
                  : <Users size={15} />}
                <span>
                  {anyLoading
                    ? 'Поиск...'
                    : totalCount > 0
                      ? `${totalCount} ${getUserCountText(totalCount)}`
                      : 'Нет результатов'}
                </span>
              </div>
              {/* Desktop sort dropdown */}
              <div className="hidden lg:block">
                <SortDropdown value={sortBy} onChange={setSortBy} />
              </div>
            </div>

            {/* Grid */}
            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : results.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {results.map((user: any) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      sentRequests={sentRequests}
                      onMessage={(id) => navigate(`/messages/${id}`)}
                      onAddFriend={(id) => addFriendMutation.mutate(id)}
                      onNavigate={(id) => navigate(`/profile/${id}`)}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                      className="px-4 py-2 rounded-xl bg-slate-800/70 border border-slate-700/50 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
                    >
                      ← Назад
                    </button>
                    <span className="text-slate-400 text-sm px-2">{page} / {totalPages}</span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                      className="px-4 py-2 rounded-xl bg-slate-800/70 border border-slate-700/50 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
                    >
                      Вперёд →
                    </button>
                  </div>
                )}
              </>
            ) : !anyLoading ? (
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-xl">
                <div className="relative text-center py-10 px-6">
                  <div className="inline-flex p-4 bg-slate-700/30 rounded-2xl mb-4">
                    <Search size={32} className="text-slate-500" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">
                    Ничего не найдено
                  </h3>
                  <p className="text-slate-400 text-sm">
                    Попробуйте изменить фильтры или поисковый запрос
                  </p>
                  {(activeChips.length > 0 || nameQuery) && (
                    <button
                      onClick={() => { resetAllFilters(); setNameQuery(''); }}
                      className="mt-3 px-4 py-1.5 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 rounded-lg text-sm transition-all"
                    >
                      Сбросить всё
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      {/* ── Sort sheet (mobile) ── */}
      <SortSheet
        isOpen={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        value={sortBy}
        onChange={setSortBy}
      />

      {/* ── All filters sheet (mobile) ── */}
      <BottomSheet
        isOpen={allFiltersOpen}
        onClose={() => setAllFiltersOpen(false)}
        title="Все фильтры"
        height="full"
      >
        <FilterPanel showHeader={false} />
      </BottomSheet>

    </div>
  );
}
