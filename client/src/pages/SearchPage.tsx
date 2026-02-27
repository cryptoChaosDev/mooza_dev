import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, UserPlus, X, MessageCircle, Check, Users,
  Filter, SlidersHorizontal, ChevronDown, Loader2,
} from 'lucide-react';
import { friendshipAPI } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import {
  useSearchStore,
  useSearchResults,
  useFieldsOfActivity,
  useProfessions,
  useServices,
  useGenres,
  useWorkFormats,
  useEmploymentTypes,
  useSkillLevels,
  useAvailabilities,
} from '../stores/searchStore';
import FilterPanel from '../components/FilterPanel';
import BottomSheet from '../components/BottomSheet';

// ─── Sort options ───────────────────────────────────────────────────────────
type SortOption = 'relevance' | 'name_asc' | 'name_desc';
const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'По релевантности',
  name_asc: 'По имени А→Я',
  name_desc: 'По имени Я→А',
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function getUserCountText(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'участник';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'участника';
  return 'участников';
}

// ─── Skeleton card ──────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl p-5 border border-slate-700/50 animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 bg-slate-700/50 rounded-2xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-700/50 rounded-lg w-2/3" />
          <div className="h-3 bg-slate-700/50 rounded-lg w-1/3" />
          <div className="h-3 bg-slate-700/50 rounded-lg w-1/2" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-8 bg-slate-700/50 rounded-xl flex-1" />
        <div className="h-8 bg-slate-700/50 rounded-xl flex-1" />
      </div>
    </div>
  );
}

// ─── User card ──────────────────────────────────────────────────────────────
interface UserCardProps {
  user: any;
  sentRequests: Set<string>;
  onMessage: (id: string) => void;
  onAddFriend: (id: string) => void;
  onNavigate: (id: string) => void;
}
function UserCard({ user, sentRequests, onMessage, onAddFriend, onNavigate }: UserCardProps) {
  const isSent = sentRequests.has(user.id);
  return (
    <div className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 shadow-lg hover:shadow-primary-500/10">
      <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="flex items-start gap-4">
        <button onClick={() => onNavigate(user.id)} className="flex-shrink-0">
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

        <div className="flex-1 min-w-0">
          <button
            onClick={() => onNavigate(user.id)}
            className="font-bold text-white text-base hover:text-primary-400 transition-colors truncate block"
          >
            {user.firstName} {user.lastName}
          </button>
          {user.nickname && <p className="text-sm text-slate-400 truncate">@{user.nickname}</p>}
          {user.city && <p className="text-xs text-slate-500 truncate mt-0.5">{user.city}</p>}
          {user.userProfessions && user.userProfessions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {user.userProfessions.slice(0, 2).map((up: any) => (
                <span key={up.id} className="text-xs bg-primary-500/20 text-primary-300 px-2 py-0.5 rounded">
                  {up.profession?.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => onMessage(user.id)}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-all"
        >
          <MessageCircle size={15} />
          <span className="hidden sm:inline">Сообщение</span>
        </button>
        {isSent ? (
          <div className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-500/10 text-green-400 rounded-xl text-sm font-medium">
            <Check size={15} />
            <span className="hidden sm:inline">Отправлено</span>
          </div>
        ) : (
          <button
            onClick={() => onAddFriend(user.id)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-xl text-sm font-medium transition-all"
          >
            <UserPlus size={15} />
            <span className="hidden sm:inline">В друзья</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Active filter chip ──────────────────────────────────────────────────────
function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/15 border border-primary-500/30 text-primary-300 rounded-full text-sm whitespace-nowrap">
      <span>{label}</span>
      <button onClick={onRemove} className="hover:text-white transition-colors">
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Sort dropdown ───────────────────────────────────────────────────────────
function SortDropdown({ value, onChange }: { value: SortOption; onChange: (v: SortOption) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white transition-all"
      >
        <SlidersHorizontal size={15} />
        <span className="hidden sm:inline">{SORT_LABELS[value]}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-slate-800 border border-slate-600/50 rounded-xl shadow-xl overflow-hidden">
            {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { onChange(key); setOpen(false); }}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                  value === key
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function SearchPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();

  const [nameQuery, setNameQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState('');

  // Debounced name query (300 ms)
  const [debouncedName, setDebouncedName] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(nameQuery), 300);
    return () => clearTimeout(t);
  }, [nameQuery]);

  // Filter store
  const {
    fieldId, professionId, serviceId, genreId,
    workFormatId, employmentTypeId, skillLevelId, availabilityId,
    setFieldId, setProfessionId, setServiceId, setGenreId,
    setWorkFormatId, setEmploymentTypeId, setSkillLevelId, setAvailabilityId,
    resetAllFilters, getFilters, setPage, page,
  } = useSearchStore();

  // Reference data (for chip labels)
  const { data: fields } = useFieldsOfActivity();
  const { data: professions } = useProfessions(fieldId || undefined);
  const { data: services } = useServices(professionId || undefined, fieldId || undefined);
  const { data: genres } = useGenres(serviceId || undefined);
  const { data: workFormats } = useWorkFormats();
  const { data: employmentTypes } = useEmploymentTypes();
  const { data: skillLevels } = useSkillLevels();
  const { data: availabilities } = useAvailabilities();

  // Build filters for the query
  const filters = useMemo(() => ({
    ...getFilters(),
    ...(debouncedName.trim() ? { query: debouncedName.trim() } : {}),
  }), [fieldId, professionId, serviceId, genreId, workFormatId, employmentTypeId, skillLevelId, availabilityId, debouncedName, page]);

  const { data: searchData, isLoading, isFetching } = useSearchResults(filters);

  // Sort results client-side
  const results = useMemo(() => {
    const list: any[] = (searchData?.results || [])
      .map((r: any) => r.user ?? r) // handle both flat users and SearchResult shape
      .filter((u: any) => u.id !== currentUser?.id);

    if (sortBy === 'name_asc') {
      return [...list].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );
    }
    if (sortBy === 'name_desc') {
      return [...list].sort((a, b) =>
        `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`)
      );
    }
    return list;
  }, [searchData, sortBy, currentUser?.id]);

  // Active filter chips data
  const activeChips = useMemo(() => {
    const chips: { label: string; onRemove: () => void }[] = [];
    if (fieldId) {
      const n = fields?.find((f) => f.id === fieldId)?.name;
      if (n) chips.push({ label: n, onRemove: () => { setFieldId(null); setProfessionId(null); setServiceId(null); setGenreId(null); setPage(1); } });
    }
    if (professionId) {
      const n = professions?.find((p) => p.id === professionId)?.name;
      if (n) chips.push({ label: n, onRemove: () => { setProfessionId(null); setServiceId(null); setGenreId(null); setPage(1); } });
    }
    if (serviceId) {
      const n = services?.find((s) => s.id === serviceId)?.name;
      if (n) chips.push({ label: n, onRemove: () => { setServiceId(null); setGenreId(null); setPage(1); } });
    }
    if (genreId) {
      const n = genres?.find((g) => g.id === genreId)?.name;
      if (n) chips.push({ label: n, onRemove: () => { setGenreId(null); setPage(1); } });
    }
    if (workFormatId) {
      const n = workFormats?.find((w) => w.id === workFormatId)?.name;
      if (n) chips.push({ label: n, onRemove: () => { setWorkFormatId(null); setPage(1); } });
    }
    if (employmentTypeId) {
      const n = employmentTypes?.find((e) => e.id === employmentTypeId)?.name;
      if (n) chips.push({ label: n, onRemove: () => { setEmploymentTypeId(null); setPage(1); } });
    }
    if (skillLevelId) {
      const n = skillLevels?.find((s) => s.id === skillLevelId)?.name;
      if (n) chips.push({ label: n, onRemove: () => { setSkillLevelId(null); setPage(1); } });
    }
    if (availabilityId) {
      const n = availabilities?.find((a) => a.id === availabilityId)?.name;
      if (n) chips.push({ label: n, onRemove: () => { setAvailabilityId(null); setPage(1); } });
    }
    return chips;
  }, [
    fieldId, professionId, serviceId, genreId,
    workFormatId, employmentTypeId, skillLevelId, availabilityId,
    fields, professions, services, genres, workFormats, employmentTypes, skillLevels, availabilities,
  ]);

  const activeCount = activeChips.length;
  const totalCount = searchData?.pagination?.totalCount ?? 0;
  const totalPages = searchData?.pagination?.totalPages ?? 1;
  const anyLoading = isLoading || isFetching;

  // Friend request mutation
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
      {/* ── Page header ── */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary-500/20 rounded-2xl">
              <Search size={26} className="text-primary-400" />
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Поиск
            </h2>
          </div>

          {/* ── Search input ── */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Поиск по имени или нику..."
              className="w-full pl-11 pr-10 py-3 bg-slate-800/80 border border-slate-700/50 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 transition-all"
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
        </div>
      </div>

      {/* ── Main layout: sidebar + content ── */}
      <div className="max-w-7xl mx-auto px-4 pb-24">
        <div className="flex gap-6">

          {/* ── Desktop sidebar ── */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-4 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-4">
              <FilterPanel />
            </div>
          </aside>

          {/* ── Results area ── */}
          <main className="flex-1 min-w-0 space-y-4">

            {/* ── Mobile: filter button + active chips ── */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Mobile filter button */}
              <button
                onClick={() => setFiltersOpen(true)}
                className="lg:hidden flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white transition-all"
              >
                <Filter size={16} />
                Фильтры
                {activeCount > 0 && (
                  <span className="bg-primary-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {activeCount}
                  </span>
                )}
              </button>

              {/* Active filter chips */}
              {activeChips.map((chip, i) => (
                <ActiveChip key={i} label={chip.label} onRemove={chip.onRemove} />
              ))}

              {/* Clear all chips */}
              {activeCount > 1 && (
                <button
                  onClick={() => { resetAllFilters(); setPage(1); }}
                  className="text-xs text-slate-400 hover:text-white transition-colors underline underline-offset-2"
                >
                  Очистить всё
                </button>
              )}
            </div>

            {/* ── Error message ── */}
            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-center gap-2">
                <X size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* ── Results header: count + sort ── */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                {anyLoading ? (
                  <Loader2 size={15} className="animate-spin text-primary-400" />
                ) : (
                  <Users size={15} />
                )}
                <span>
                  {anyLoading
                    ? 'Поиск...'
                    : totalCount > 0
                      ? `${totalCount} ${getUserCountText(totalCount)}`
                      : 'Нет результатов'}
                </span>
              </div>
              <SortDropdown value={sortBy} onChange={setSortBy} />
            </div>

            {/* ── Results grid ── */}
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : results.length > 0 ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                      className="px-4 py-2 rounded-xl bg-slate-800/70 border border-slate-700/50 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
                    >
                      ← Назад
                    </button>
                    <span className="text-slate-400 text-sm px-2">
                      {page} / {totalPages}
                    </span>
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
              /* ── Empty state ── */
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
                <div className="relative text-center py-16 px-6">
                  <div className="inline-flex p-6 bg-slate-700/30 rounded-3xl mb-6">
                    <Search size={56} className="text-slate-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">
                    {activeCount > 0 || nameQuery ? 'Ничего не найдено' : 'Начните поиск'}
                  </h3>
                  <p className="text-slate-400 text-base">
                    {activeCount > 0 || nameQuery
                      ? 'Попробуйте изменить фильтры или поисковый запрос'
                      : 'Используйте фильтры слева или введите имя в строку поиска'}
                  </p>
                  {activeCount > 0 && (
                    <button
                      onClick={() => { resetAllFilters(); setNameQuery(''); }}
                      className="mt-4 px-5 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 rounded-xl text-sm transition-all"
                    >
                      Сбросить фильтры
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      {/* ── Mobile: BottomSheet with FilterPanel ── */}
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
