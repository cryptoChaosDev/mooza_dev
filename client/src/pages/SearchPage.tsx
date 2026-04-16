import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Crown, BadgeCheck, Ban, Mic, Users, Music2, Loader2, X,
  BookOpen, Link2, ShieldCheck,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { usePresenceStore } from '../stores/presenceStore';
import { referenceAPI, userAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';
import { plural } from '../lib/plural';

const API_URL = import.meta.env.VITE_API_URL || '';

// ─── Tile gradients ──────────────────────────────────────────────────────────
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

type CatalogTab = 'services' | 'artists';
type ServiceView = 'fields' | 'directions' | 'professions';

const ARTIST_TYPES = [
  { value: 'ALL', label: 'Все', icon: Music2 },
  { value: 'SOLO', label: 'Соло', icon: Mic },
  { value: 'GROUP', label: 'Группы', icon: Users },
  { value: 'COVER_GROUP', label: 'Кавербэнды', icon: BookOpen },
];

// ─── ExpandableUserRow ───────────────────────────────────────────────────────
function ExpandableUserRow({ user, onNavigate }: { user: any; onNavigate: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isOnline = usePresenceStore((s) => s.onlineUsers.has(user.id));
  const connCount = (user._count?.sentConnections ?? 0) + (user._count?.receivedConnections ?? 0);
  // Professions come from userServices (UserProfession is unused, UserService has the data)
  const professions = user.userServices?.map((us: any) => us.profession?.name).filter(Boolean) ?? [];
  const portfolio = user.portfolioFiles ?? [];

  return (
    <div className="border-b border-slate-800/50 last:border-0">
      {/* Row */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors">
        {/* Avatar — click navigates to profile */}
        <div
          className="relative flex-shrink-0 cursor-pointer"
          onClick={() => onNavigate(user.id)}
        >
          <AvatarComponent src={user.avatar} name={`${user.firstName} ${user.lastName}`} size={44} className="rounded-xl" />
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-950 rounded-full" />
          )}
        </div>

        {/* Info — click navigates to profile */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onNavigate(user.id)}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white">
              {user.firstName} {user.lastName}
            </span>
            {user.isPremium && <span title="Premium"><Crown size={12} className="text-amber-400 flex-shrink-0" /></span>}
            {user.isVerified && <span title="Верифицирован"><BadgeCheck size={12} className="text-sky-400 flex-shrink-0" /></span>}
            {user.isBlocked && <span title="Заблокирован"><Ban size={12} className="text-red-400 flex-shrink-0" /></span>}
          </div>

          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {professions.length > 0 && (
              <span className="text-xs text-slate-400 truncate">{professions.slice(0, 2).join(', ')}</span>
            )}
            {connCount > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-slate-500">
                <Link2 size={10} />
                {connCount} {plural(connCount, 'связь', 'связи', 'связей')}
              </span>
            )}
            {user.city && <span className="text-xs text-slate-600 truncate">· {user.city}</span>}
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          className="p-2 text-slate-500 hover:text-primary-400 hover:bg-primary-500/10 rounded-xl transition-all flex-shrink-0"
          title={expanded ? 'Свернуть' : 'Раскрыть'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div
          className="px-4 pb-4 bg-slate-900/40 cursor-pointer"
          onClick={() => onNavigate(user.id)}
        >
          {/* Portfolio grid */}
          {portfolio.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wider">Портфолио</p>
              <div className="grid grid-cols-3 gap-1.5">
                {portfolio.filter((f: any) => f.mimeType?.startsWith('image/')).slice(0, 6).map((f: any) => (
                  <div
                    key={f.id}
                    className="aspect-square rounded-lg overflow-hidden bg-slate-800"
                    onClick={e => { e.stopPropagation(); window.open(`${API_URL}${f.url}`, '_blank'); }}
                  >
                    <img src={`${API_URL}${f.url}`} alt={f.originalName} className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
                  </div>
                ))}
                {portfolio.filter((f: any) => !f.mimeType?.startsWith('image/')).slice(0, 3).map((f: any) => (
                  <div key={f.id} className="flex items-center gap-1.5 p-2 bg-slate-800 rounded-lg col-span-1">
                    <BookOpen size={12} className="text-slate-400 flex-shrink-0" />
                    <span className="text-xs text-slate-400 truncate">{f.originalName}</span>
                  </div>
                ))}
              </div>
              {portfolio.filter((f: any) => f.mimeType?.startsWith('image/')).length === 0 && (
                <p className="text-xs text-slate-600 italic">Нет изображений в портфолио</p>
              )}
            </div>
          )}
          {portfolio.length === 0 && (
            <p className="text-xs text-slate-600 italic mb-2">Портфолио не добавлено</p>
          )}

          <p className="text-xs text-primary-400 hover:text-primary-300 transition-colors text-right mt-1">
            Открыть профиль →
          </p>
        </div>
      )}
    </div>
  );
}

// ─── CatalogPage ──────────────────────────────────────────────────────────────
export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState<CatalogTab>('services');

  // ── Services tab state ─────────────────────────────────────────────────────
  const [serviceQuery, setServiceQuery] = useState('');
  const [debouncedServiceQuery, setDebouncedServiceQuery] = useState('');
  const [serviceView, setServiceView] = useState<ServiceView>('fields');
  const [selectedField, setSelectedField] = useState<{ id: string; name: string } | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<{ id: string; name: string } | null>(null);
  const [selectedProfession, setSelectedProfession] = useState<{ id: string; name: string } | null>(null);

  // ── Artists tab state ──────────────────────────────────────────────────────
  const [artistQuery, setArtistQuery] = useState('');
  const [debouncedArtistQuery, setDebouncedArtistQuery] = useState('');
  const [artistTypeFilter, setArtistTypeFilter] = useState<string[]>([]);
  const [artistGenreFilter, setArtistGenreFilter] = useState<string[]>([]);

  function toggleType(value: string) {
    if (value === 'ALL') { setArtistTypeFilter([]); return; }
    setArtistTypeFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  }

  function toggleGenre(id: string) {
    setArtistGenreFilter(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  }
  const [showAllGenres, setShowAllGenres] = useState(false);

  const POPULAR_GENRE_NAMES = ['рок', 'рэп', 'поп', 'панк', 'инди'];

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedServiceQuery(serviceQuery), 300);
    return () => clearTimeout(t);
  }, [serviceQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedArtistQuery(artistQuery), 300);
    return () => clearTimeout(t);
  }, [artistQuery]);

  // ── Reference data ─────────────────────────────────────────────────────────
  const { data: fields, isLoading: fieldsLoading } = useQuery({
    queryKey: ['fields-all'],
    queryFn: async () => {
      const { data } = await referenceAPI.getFieldsOfActivity({ all: true });
      return data as any[];
    },
  });

  const { data: directions, isLoading: directionsLoading } = useQuery({
    queryKey: ['directions-all', selectedField?.id],
    queryFn: async () => {
      const { data } = await referenceAPI.getDirections({ fieldOfActivityId: selectedField?.id, all: true });
      return data as any[];
    },
    enabled: !!selectedField,
  });

  const { data: professions, isLoading: professionsLoading } = useQuery({
    queryKey: ['professions-direction', selectedDirection?.id],
    queryFn: async () => {
      const { data } = await referenceAPI.getProfessions({ directionId: selectedDirection?.id });
      return data as any[];
    },
    enabled: !!selectedDirection,
  });

  // ── Catalog users ──────────────────────────────────────────────────────────
  const catalogParams = {
    query: debouncedServiceQuery || undefined,
    fieldOfActivityId: selectedField?.id,
    directionId: selectedDirection?.id,
    professionId: selectedProfession?.id,
  };

  const { data: catalogUsers, isLoading: catalogLoading } = useQuery({
    queryKey: ['catalog-users', catalogParams],
    queryFn: async () => {
      const { data } = await userAPI.catalog(catalogParams);
      return (data as any[]).filter((u: any) => u.id !== currentUser?.id);
    },
  });

  // ── Artists ────────────────────────────────────────────────────────────────
  const { data: artists, isLoading: artistsLoading } = useQuery({
    queryKey: ['catalog-artists', debouncedArtistQuery, artistTypeFilter, artistGenreFilter],
    queryFn: async () => {
      // Fetch all matching artists (server filters by single type; we do multi-type client-side)
      const { data } = await referenceAPI.getArtists({
        search: debouncedArtistQuery || undefined,
      });
      let result = data as any[];
      if (artistTypeFilter.length > 0) {
        result = result.filter((a: any) => artistTypeFilter.includes(a.type));
      }
      if (artistGenreFilter.length > 0) {
        result = result.filter((a: any) =>
          a.genres?.some((g: any) => artistGenreFilter.includes(g.genre?.id))
        );
      }
      return result;
    },
    enabled: activeTab === 'artists',
  });

  // ── Genres for artist filter ───────────────────────────────────────────────
  const { data: genresList } = useQuery({
    queryKey: ['genres'],
    queryFn: async () => {
      const { data } = await referenceAPI.getGenres();
      return data as any[];
    },
    enabled: activeTab === 'artists',
  });

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const handleFieldClick = (field: any) => {
    setSelectedField(field);
    setSelectedDirection(null);
    setSelectedProfession(null);
    setServiceView('directions');
  };

  const handleDirectionClick = (dir: any) => {
    setSelectedDirection(dir);
    setSelectedProfession(null);
    setServiceView('professions');
  };

  const handleProfessionClick = (prof: any) => {
    setSelectedProfession(prof);
  };

  const goBack = () => {
    if (serviceView === 'directions') {
      setSelectedField(null);
      setServiceView('fields');
    } else if (serviceView === 'professions') {
      setSelectedDirection(null);
      setSelectedProfession(null);
      setServiceView('directions');
    }
  };

  const resetAll = () => {
    setSelectedField(null);
    setSelectedDirection(null);
    setSelectedProfession(null);
    setServiceView('fields');
  };

  const handleNavigateToProfile = (id: string) => {
    navigate(`/profile/${id}`, { state: { from: location.pathname } });
  };

  const handleNavigateToArtist = (id: string) => {
    navigate(`/artist/${id}`, { state: { from: location.pathname } });
  };

  // ── Breadcrumb ─────────────────────────────────────────────────────────────
  const breadcrumbs = [];
  if (selectedField) breadcrumbs.push({ label: selectedField.name, onClick: () => { setSelectedDirection(null); setSelectedProfession(null); setServiceView('directions'); } });
  if (selectedDirection) breadcrumbs.push({ label: selectedDirection.name, onClick: () => { setSelectedProfession(null); setServiceView('professions'); } });
  if (selectedProfession) breadcrumbs.push({ label: selectedProfession.name, onClick: () => {} });

  const hasTileDrilldown = serviceView !== 'fields' && !debouncedServiceQuery;

  // Current tiles to show
  const currentTiles = serviceView === 'fields' ? (fields ?? [])
    : serviceView === 'directions' ? (directions ?? [])
    : serviceView === 'professions' ? (professions ?? [])
    : [];

  const tilesLoading = serviceView === 'fields' ? fieldsLoading
    : serviceView === 'directions' ? directionsLoading
    : professionsLoading;

  return (
    <div className="min-h-screen bg-slate-950">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-3 space-y-3">

          {/* Title + breadcrumb back */}
          <div className="flex items-center gap-2">
            {hasTileDrilldown && activeTab === 'services' && (
              <button onClick={goBack} className="p-1.5 -ml-1.5 text-slate-400 hover:text-white transition-colors">
                <ChevronLeft size={20} />
              </button>
            )}
            <h2 className="text-lg font-bold text-white">Каталог</h2>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
            {[
              { id: 'services' as const, label: 'Услуги' },
              { id: 'artists' as const, label: 'Артисты' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.id ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input
              type="text"
              value={activeTab === 'services' ? serviceQuery : artistQuery}
              onChange={e => activeTab === 'services' ? setServiceQuery(e.target.value) : setArtistQuery(e.target.value)}
              placeholder={activeTab === 'services' ? 'Поиск специалистов...' : 'Поиск артистов...'}
              className="w-full pl-8 pr-9 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600 transition-colors"
            />
            {(activeTab === 'services' ? serviceQuery : artistQuery) && (
              <button
                onClick={() => activeTab === 'services' ? setServiceQuery('') : setArtistQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Breadcrumb (services tab) */}
          {hasTileDrilldown && activeTab === 'services' && breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1 text-xs overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <button onClick={resetAll} className="text-slate-500 hover:text-slate-300 flex-shrink-0">Все сферы</button>
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1 flex-shrink-0">
                  <ChevronRight size={12} className="text-slate-600" />
                  <button
                    onClick={crumb.onClick}
                    className={i === breadcrumbs.length - 1 ? 'text-white font-medium' : 'text-slate-400 hover:text-slate-200'}
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-4xl mx-auto px-4 pb-28">

        {/* ══ SERVICES TAB ══ */}
        {activeTab === 'services' && (
          <>
            {/* Tiles (hide during text search) */}
            {!debouncedServiceQuery && (
              <div className="mt-4 mb-6">
                {tilesLoading ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-20 bg-slate-800/50 rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : currentTiles.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {/* "Все" button when drilled in */}
                    {serviceView !== 'fields' && (
                      <button
                        onClick={() => setSelectedProfession(null)}
                        className={`relative overflow-hidden rounded-2xl p-4 text-left bg-slate-800 border transition-all hover:scale-[1.02] active:scale-[0.98] ${
                          !selectedProfession ? 'border-primary-500/60 ring-1 ring-primary-500/30' : 'border-slate-700/50 hover:border-slate-600'
                        }`}
                      >
                        <p className="text-white font-semibold text-xs leading-snug">Все</p>
                      </button>
                    )}
                    {currentTiles.map((tile: any, i: number) => {
                      const isSelected = selectedProfession?.id === tile.id;
                      const canSelect = serviceView === 'professions';
                      return (
                        <button
                          key={tile.id}
                          onClick={() => {
                            if (serviceView === 'fields') handleFieldClick(tile);
                            else if (serviceView === 'directions') handleDirectionClick(tile);
                            else handleProfessionClick(tile);
                          }}
                          className={`relative overflow-hidden rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md group ${
                            canSelect && isSelected
                              ? 'ring-2 ring-white/50'
                              : ''
                          } bg-gradient-to-br ${TILE_GRADIENTS[i % TILE_GRADIENTS.length]}`}
                        >
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                          <div className="relative">
                            <p className="text-white font-semibold text-xs leading-snug line-clamp-2">{tile.name}</p>
                          </div>
                          {serviceView !== 'professions' && (
                            <ChevronRight size={14} className="absolute right-2 bottom-2 text-white/50 group-hover:text-white/80 transition-colors" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  serviceView !== 'fields' && (
                    <p className="text-slate-500 text-sm">Ничего не найдено</p>
                  )
                )}
              </div>
            )}

            {/* User list */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {selectedProfession
                    ? selectedProfession.name
                    : selectedDirection
                    ? selectedDirection.name
                    : selectedField
                    ? selectedField.name
                    : 'Все специалисты'} · от А до Я
                </p>
                {catalogLoading && <Loader2 size={12} className="text-primary-400 animate-spin" />}
                {!catalogLoading && catalogUsers && (
                  <span className="text-xs text-slate-600">{catalogUsers.length}</span>
                )}
              </div>

              {catalogLoading ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/50 animate-pulse last:border-0">
                      <div className="w-11 h-11 rounded-xl bg-slate-800 flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-slate-800 rounded w-2/5" />
                        <div className="h-3 bg-slate-800 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : catalogUsers && catalogUsers.length > 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  {catalogUsers.map((user: any) => (
                    <ExpandableUserRow
                      key={user.id}
                      user={user}
                      onNavigate={handleNavigateToProfile}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-14 text-center">
                  <div className="p-4 bg-slate-800/50 rounded-2xl mb-3">
                    <Users size={28} className="text-slate-600" />
                  </div>
                  <p className="text-slate-400 text-sm">Специалистов не найдено</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ ARTISTS TAB ══ */}
        {activeTab === 'artists' && (
          <>
            {/* Artist type filter */}
            <div className="mt-4 mb-4">
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {ARTIST_TYPES.map(type => {
                  const Icon = type.icon;
                  const isActive = type.value === 'ALL'
                    ? artistTypeFilter.length === 0
                    : artistTypeFilter.includes(type.value);
                  return (
                    <button
                      key={type.value}
                      onClick={() => toggleType(type.value)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 ${
                        isActive
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
                      }`}
                    >
                      <Icon size={14} />
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Genre tiles */}
            {genresList && genresList.length > 0 && (() => {
              const popular = genresList.filter((g: any) =>
                POPULAR_GENRE_NAMES.some(name => g.name.toLowerCase().includes(name))
              );
              const rest = genresList.filter((g: any) =>
                !POPULAR_GENRE_NAMES.some(name => g.name.toLowerCase().includes(name))
              );
              const visibleGenres = showAllGenres ? genresList : popular;
              return (
                <div className="mb-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Жанры</p>
                  <div className="flex flex-wrap gap-2" style={{ maxHeight: showAllGenres ? undefined : '4.5rem', overflow: showAllGenres ? undefined : 'hidden' }}>
                    <button
                      onClick={() => setArtistGenreFilter([])}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex-shrink-0 ${
                        artistGenreFilter.length === 0
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
                      }`}
                    >
                      Все жанры
                    </button>
                    {visibleGenres.map((genre: any, i: number) => (
                      <button
                        key={genre.id}
                        onClick={() => toggleGenre(genre.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex-shrink-0 ${
                          artistGenreFilter.includes(genre.id)
                            ? `bg-gradient-to-r ${TILE_GRADIENTS[i % TILE_GRADIENTS.length]} text-white`
                            : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        {genre.name}
                      </button>
                    ))}
                  </div>
                  {rest.length > 0 && (
                    <button
                      onClick={() => setShowAllGenres(v => !v)}
                      className="mt-2 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                    >
                      {showAllGenres ? 'Скрыть' : `Ещё ${rest.length} жанров →`}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Artist list */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Все артисты · от А до Я</p>
                {artistsLoading && <Loader2 size={12} className="text-primary-400 animate-spin" />}
                {!artistsLoading && artists && (
                  <span className="text-xs text-slate-600">{artists.length}</span>
                )}
              </div>

              {artistsLoading ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/50 animate-pulse last:border-0">
                      <div className="w-11 h-11 rounded-xl bg-slate-800 flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-slate-800 rounded w-1/3" />
                        <div className="h-3 bg-slate-800 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : artists && artists.length > 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/50">
                  {artists.map((artist: any) => {
                    const genreNames = artist.genres?.map((g: any) => g.genre?.name).filter(Boolean).slice(0, 3) ?? [];
                    const typeLabel = artist.type === 'SOLO' ? 'Соло' : artist.type === 'GROUP' ? 'Группа' : artist.type === 'COVER_GROUP' ? 'Кавербэнд' : '';
                    return (
                      <button
                        key={artist.id}
                        onClick={() => handleNavigateToArtist(artist.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left"
                      >
                        <AvatarComponent src={artist.avatar} name={artist.name} size={44} className="rounded-xl flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-white truncate">{artist.name}</span>
                            {typeLabel && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-primary-500/20 text-primary-300 rounded-md flex-shrink-0">{typeLabel}</span>
                            )}
                            {artist.status === 'VERIFIED' && (
                              <span title="Верифицирован"><BadgeCheck size={13} className="text-sky-400 flex-shrink-0" /></span>
                            )}
                            {artist.status === 'APPROVED' && (
                              <span title="Проверен"><ShieldCheck size={13} className="text-emerald-400 flex-shrink-0" /></span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {genreNames.map((g: string, i: number) => (
                              <span key={i} className="text-xs text-slate-500">{g}</span>
                            ))}
                            {artist.city && <span className="text-xs text-slate-600">· {artist.city}</span>}
                            {artist.listeners > 0 && (
                              <span className="text-xs text-slate-600">· {artist.listeners.toLocaleString('ru-RU')} {plural(artist.listeners, 'слушатель', 'слушателя', 'слушателей')}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center py-14 text-center">
                  <div className="p-4 bg-slate-800/50 rounded-2xl mb-3">
                    <Music2 size={28} className="text-slate-600" />
                  </div>
                  <p className="text-slate-400 text-sm">Артисты не найдены</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
