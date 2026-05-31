import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Crown, BadgeCheck, Ban, Users, Music2, Loader2, X,
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

type CatalogTab = 'services' | 'artists' | 'people';

const ARTIST_TYPES = [
  { value: 'ALL', label: 'Все', icon: Music2 },
  { value: 'SOLO', label: 'Соло', icon: Music2 },
  { value: 'GROUP', label: 'Группы', icon: Users },
  { value: 'COVER_GROUP', label: 'Кавербэнды', icon: BookOpen },
];

// ─── ExpandableUserRow ───────────────────────────────────────────────────────
// `user` is a flat user object (People tab / userAPI.catalog).
// `searchProfile` is the optional searchMusicians payload that carries
// professions/services for the "Каталог" tab result cards.
function ExpandableUserRow({ user, searchProfile, onNavigate }: { user: any; searchProfile?: any; onNavigate: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isOnline = usePresenceStore((s) => s.onlineUsers.has(user.id));
  const connCount = (user._count?.sentConnections ?? 0) + (user._count?.receivedConnections ?? 0);
  // Professions: prefer searchMusicians.searchProfile, fall back to userServices.
  const professions: string[] = (searchProfile?.professions?.map((p: any) => p?.name).filter(Boolean))
    ?? user.userServices?.map((us: any) => us.profession?.name).filter(Boolean)
    ?? [];
  const services: string[] = searchProfile?.services?.map((s: any) => s?.name).filter(Boolean) ?? [];
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
            {services.length > 0 && (
              <span className="text-xs text-primary-400/80 truncate">{services.slice(0, 2).join(', ')}</span>
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
// ─── ProfFiltersPanel ────────────────────────────────────────────────────────
function ProfFiltersPanel({ filters, selected, onToggle }: {
  filters: any[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const activeCount = selected.length;

  return (
    <div>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
      >
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        Фильтры по атрибутам
        {activeCount > 0 && (
          <span className="bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {/* Expanded filters */}
      {open && (
        <div className="mt-2 space-y-2">
          {filters.map((group: any) => (
            <div key={group.id}>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{group.name}</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {group.values?.map((val: any) => {
                  const isActive = selected.includes(String(val.id));
                  return (
                    <button
                      key={val.id}
                      onClick={() => onToggle(String(val.id))}
                      className={`flex-shrink-0 px-3 py-1 rounded-xl text-xs font-medium border transition-all ${
                        isActive
                          ? 'bg-primary-600 border-primary-500 text-white'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-600'
                      }`}
                    >
                      {val.value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ServiceCardItem ─────────────────────────────────────────────────────────
// Renders a single service offering (UserService) — a "service card", not a person.
function ServiceCardItem({ card, onNavigate }: { card: any; onNavigate: (card: any) => void }) {
  const user = card.user ?? {};
  const sectionName = card.service?.section?.name;
  const filterValues: string[] = (card.selectedCustomFilterValues ?? [])
    .map((v: any) => v?.value)
    .filter(Boolean);

  // Price label
  let priceLabel = 'Цена договорная';
  if (card.priceFrom != null && card.priceTo != null) {
    priceLabel = `${card.priceFrom.toLocaleString('ru-RU')} – ${card.priceTo.toLocaleString('ru-RU')} ₽`;
  } else if (card.priceFrom != null) {
    priceLabel = `От ${card.priceFrom.toLocaleString('ru-RU')} ₽`;
  } else if (card.priceTo != null) {
    priceLabel = `До ${card.priceTo.toLocaleString('ru-RU')} ₽`;
  }

  return (
    <button
      onClick={() => onNavigate(card)}
      className="w-full text-left bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-primary-600/60 hover:bg-slate-900/80 transition-all"
    >
      {/* Header: service name + section badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">{card.service?.name ?? 'Услуга'}</p>
          {card.name && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{card.name}</p>
          )}
        </div>
        {sectionName && (
          <span className="flex-shrink-0 text-[10px] px-2 py-0.5 bg-primary-500/15 text-primary-300 rounded-md uppercase tracking-wide">
            {sectionName}
          </span>
        )}
      </div>

      {/* Description */}
      {card.description && (
        <p className="text-xs text-slate-500 mt-2 line-clamp-2">{card.description}</p>
      )}

      {/* Filter value chips */}
      {filterValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {filterValues.slice(0, 6).map((v: string, i: number) => (
            <span key={i} className="text-[11px] px-2 py-0.5 bg-slate-800/80 border border-slate-700/60 text-slate-300 rounded-lg">
              {v}
            </span>
          ))}
        </div>
      )}

      {/* Provider + price */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/60">
        <AvatarComponent
          src={user.avatar}
          name={`${user.firstName ?? ''} ${user.lastName ?? ''}`}
          size={32}
          className="rounded-lg flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs font-medium text-white truncate">
              {user.firstName} {user.lastName}
            </span>
            {user.isPremium && <span title="Premium"><Crown size={11} className="text-amber-400 flex-shrink-0" /></span>}
            {user.isVerified && <span title="Верифицирован"><BadgeCheck size={11} className="text-sky-400 flex-shrink-0" /></span>}
          </div>
          {user.city && <p className="text-[11px] text-slate-600 truncate">{user.city}</p>}
        </div>
        <span className="flex-shrink-0 text-xs font-semibold text-primary-300">{priceLabel}</span>
      </div>
    </button>
  );
}

// ─── SearchPage ───────────────────────────────────────────────────────────────
export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState<CatalogTab>('services');

  // ── Услуги tab state ───────────────────────────────────────────────────────
  // Browse: Sections → Services → service filters. Results are service cards.
  // Free-text query for the service-card search.
  const [serviceQuery, setServiceQuery] = useState('');
  const [debouncedServiceQuery, setDebouncedServiceQuery] = useState('');

  // Section drilldown: which section's services are shown.
  const [selectedSection, setSelectedSection] = useState<{ id: string; name: string } | null>(null);
  // The chosen service (loads its attribute filters).
  const [selectedService, setSelectedService] = useState<{ id: string; name: string } | null>(null);

  // ── Service attribute filter values ─────────────────────────────────────────
  const [profFilterValues, setProfFilterValues] = useState<string[]>([]);

  // ── Artists tab state ──────────────────────────────────────────────────────
  const [artistQuery, setArtistQuery] = useState('');
  const [debouncedArtistQuery, setDebouncedArtistQuery] = useState('');

  // ── People tab state ───────────────────────────────────────────────────────
  const [peopleQuery, setPeopleQuery] = useState('');
  const [debouncedPeopleQuery, setDebouncedPeopleQuery] = useState('');
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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPeopleQuery(peopleQuery), 300);
    return () => clearTimeout(t);
  }, [peopleQuery]);

  // ── Reference data ─────────────────────────────────────────────────────────

  // Sections (each with its nested services) — for the "Услуги" browse.
  const { data: sections, isLoading: sectionsLoading } = useQuery({
    queryKey: ['sections'],
    queryFn: async () => {
      const { data } = await referenceAPI.getSections();
      return data as any[];
    },
    enabled: activeTab === 'services',
  });

  // Service attribute filters for the chosen service.
  const { data: serviceFilters } = useQuery({
    queryKey: ['service-filters', selectedService?.id],
    queryFn: async () => {
      if (!selectedService) return [];
      const { data } = await referenceAPI.getServiceFilters(selectedService.id);
      return data as any[];
    },
    enabled: !!selectedService,
  });

  const activeFilters = serviceFilters;
  const hasSelection = !!selectedService;

  // ── Service-card results (searchServiceCards) ───────────────────────────────
  const serviceSearchParams = {
    serviceId: selectedService?.id,
    sectionId: selectedSection?.id && !selectedService ? selectedSection.id : undefined,
    customFilterValueIds: profFilterValues.length ? profFilterValues.join(',') : undefined,
    query: debouncedServiceQuery || undefined,
  };

  const { data: serviceCards, isLoading: catalogLoading } = useQuery({
    queryKey: ['service-card-search', serviceSearchParams],
    queryFn: async () => {
      const { data } = await referenceAPI.searchServiceCards(serviceSearchParams);
      const results = ((data as any)?.results ?? []) as any[];
      return results.filter((r: any) => r.user?.id !== currentUser?.id);
    },
    enabled: activeTab === 'services',
  });

  // ── Artists ────────────────────────────────────────────────────────────────
  const { data: artists, isLoading: artistsLoading } = useQuery({
    queryKey: ['catalog-artists', debouncedArtistQuery, artistTypeFilter, artistGenreFilter],
    queryFn: async () => {
      // Only show groups (GROUP / COVER_GROUP), not solo artists
      const { data } = await referenceAPI.getArtists({
        search: debouncedArtistQuery || undefined,
      });
      let result = (data as any[]).filter((a: any) => a.type === 'GROUP' || a.type === 'COVER_GROUP');
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

  // ── People ────────────────────────────────────────────────────────────────
  const { data: peopleUsers, isLoading: peopleLoading } = useQuery({
    queryKey: ['catalog-people', debouncedPeopleQuery],
    queryFn: async () => {
      const { data } = await userAPI.catalog({
        query: debouncedPeopleQuery || undefined,
      });
      return (data as any[]).filter((u: any) => u.id !== currentUser?.id);
    },
    enabled: activeTab === 'people',
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
  // Open a section to reveal its services.
  const handleSectionClick = (section: any) => {
    setSelectedSection({ id: section.id, name: section.name });
    setSelectedService(null);
    setProfFilterValues([]);
  };

  // Pick / unpick a service (loads its filters).
  const handleServiceClick = (svc: any) => {
    setSelectedService(prev => (prev?.id === svc.id ? null : { id: svc.id, name: svc.name }));
    setProfFilterValues([]);
  };

  // Back from service list to sections grid.
  const goBack = () => {
    if (selectedSection) {
      setSelectedSection(null);
      setSelectedService(null);
      setProfFilterValues([]);
    }
  };

  const handleNavigateToProfile = (id: string) => {
    navigate(`/profile/${id}`, { state: { from: location.pathname } });
  };

  const handleNavigateToArtist = (id: string) => {
    navigate(`/artist/${id}`, { state: { from: location.pathname } });
  };

  // Tapping a service card → its service page (falls back to provider profile).
  const handleNavigateToServiceCard = (card: any) => {
    if (card?.id) {
      navigate(`/services/${card.id}`, { state: { from: location.pathname } });
    } else if (card?.user?.id) {
      navigate(`/profile/${card.user.id}`, { state: { from: location.pathname } });
    }
  };

  // Show the "back" control only when drilled into a section.
  const canGoBack = !!selectedSection;

  // Services of the currently opened section (sections mode).
  const sectionServices: any[] = selectedSection
    ? ((sections ?? []).find((s: any) => s.id === selectedSection.id)?.services ?? [])
    : [];

  // ── Toggle attribute filter value ──────────────────────────────────────────
  function toggleProfFilterValue(valueId: string) {
    setProfFilterValues(prev =>
      prev.includes(valueId) ? prev.filter(v => v !== valueId) : [...prev, valueId]
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-3 space-y-3">

          {/* Title + back into section */}
          <div className="flex items-center gap-2">
            {canGoBack && activeTab === 'services' && (
              <button onClick={goBack} className="p-1.5 -ml-1.5 text-slate-400 hover:text-white transition-colors">
                <ChevronLeft size={20} />
              </button>
            )}
            <h2 className="text-lg font-bold text-white">
              {canGoBack && activeTab === 'services' ? selectedSection!.name : 'Каталог'}
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
            {[
              { id: 'services' as const, label: 'Каталог' },
              { id: 'artists' as const, label: 'Артисты' },
              { id: 'people' as const, label: 'Люди' },
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

          {/* Search bar.
              services → free-text service-card search.
              artists / people → their own query. */}
          {(() => {
            const value =
              activeTab === 'services'
                ? serviceQuery
                : activeTab === 'artists' ? artistQuery : peopleQuery;
            const setValue = (v: string) => {
              if (activeTab === 'services') setServiceQuery(v);
              else if (activeTab === 'artists') setArtistQuery(v);
              else setPeopleQuery(v);
            };
            const placeholder =
              activeTab === 'services'
                ? 'Поиск услуг...'
                : activeTab === 'artists' ? 'Поиск артистов...' : 'Поиск людей...';
            return (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder={placeholder}
                  className="w-full pl-8 pr-9 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600 transition-colors"
                />
                {value && (
                  <button
                    onClick={() => setValue('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            );
          })()}

          {/* Attribute filters for the selected profession / service — expanded */}
          {activeTab === 'services' && hasSelection && activeFilters && activeFilters.length > 0 && (
            <ProfFiltersPanel
              filters={activeFilters}
              selected={profFilterValues}
              onToggle={toggleProfFilterValue}
            />
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-4xl mx-auto px-4 pb-28">

        {/* ══ УСЛУГИ TAB ══ */}
        {activeTab === 'services' && (
          <>
            {/* ── Browse: Sections → Services ── */}
            <div className="mt-4 mb-6">
              {/* Section grid (no section opened yet) */}
              {!selectedSection && (
                  sectionsLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-20 bg-slate-800/50 rounded-2xl animate-pulse" />
                      ))}
                    </div>
                  ) : (sections ?? []).length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {(sections ?? []).map((section: any, i: number) => (
                        <button
                          key={section.id}
                          onClick={() => handleSectionClick(section)}
                          className={`relative overflow-hidden rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md group bg-gradient-to-br ${TILE_GRADIENTS[i % TILE_GRADIENTS.length]}`}
                        >
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                          <div className="relative">
                            <p className="text-white font-semibold text-xs leading-snug line-clamp-2 uppercase tracking-wide">{section.name}</p>
                          </div>
                          <ChevronRight size={14} className="absolute right-2 bottom-2 text-white/50 group-hover:text-white/80 transition-colors" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">Разделы не найдены</p>
                  )
                )}

                {/* Services of the opened section (chips) */}
                {selectedSection && (
                  <div className="flex flex-wrap gap-2">
                    {sectionServices.length > 0 ? sectionServices.map((svc: any) => {
                      const isActive = selectedService?.id === svc.id;
                      return (
                        <button
                          key={svc.id}
                          onClick={() => handleServiceClick(svc)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                            isActive
                              ? 'bg-primary-600 border-primary-500 text-white'
                              : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600'
                          }`}
                        >
                          {svc.name}
                          {isActive && <X size={12} className="flex-shrink-0" />}
                        </button>
                      );
                    }) : (
                      <p className="text-slate-500 text-sm">В этом разделе нет услуг</p>
                    )}
                  </div>
                )}
            </div>

            {/* ── Results: service cards ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {selectedService ? selectedService.name
                    : selectedSection ? selectedSection.name
                    : 'Все услуги'}
                </p>
                {catalogLoading && <Loader2 size={12} className="text-primary-400 animate-spin" />}
                {!catalogLoading && serviceCards && (
                  <span className="text-xs text-slate-600">{serviceCards.length}</span>
                )}
              </div>

              {catalogLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 animate-pulse">
                      <div className="h-4 bg-slate-800 rounded w-2/5 mb-2" />
                      <div className="h-3 bg-slate-800 rounded w-1/3 mb-4" />
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-800" />
                        <div className="h-3 bg-slate-800 rounded w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : serviceCards && serviceCards.length > 0 ? (
                <div className="space-y-2">
                  {serviceCards.map((card: any) => (
                    <ServiceCardItem
                      key={card.id}
                      card={card}
                      onNavigate={handleNavigateToServiceCard}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-14 text-center">
                  <div className="p-4 bg-slate-800/50 rounded-2xl mb-3">
                    <Music2 size={28} className="text-slate-600" />
                  </div>
                  <p className="text-slate-400 text-sm">Услуги не найдены</p>
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

        {/* ══ PEOPLE TAB ══ */}
        {activeTab === 'people' && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {debouncedPeopleQuery ? `Результаты: «${debouncedPeopleQuery}»` : 'Все участники · от А до Я'}
              </p>
              {peopleLoading && <Loader2 size={12} className="text-primary-400 animate-spin" />}
              {!peopleLoading && peopleUsers && (
                <span className="text-xs text-slate-600">{peopleUsers.length}</span>
              )}
            </div>

            {peopleLoading ? (
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
            ) : peopleUsers && peopleUsers.length > 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                {peopleUsers.map((user: any) => (
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
                <p className="text-slate-400 text-sm">
                  {debouncedPeopleQuery ? 'Никого не найдено' : 'Нет участников'}
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
