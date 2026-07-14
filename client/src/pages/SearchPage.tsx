import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, ChevronRight, ChevronDown, ChevronUp,
  Crown, BadgeCheck, Ban, Users, Music2, Loader2, X,
  Link2, ShieldCheck, Star, SlidersHorizontal,
  ArrowDownUp,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { usePresenceStore } from '../stores/presenceStore';
import { referenceAPI, userAPI, artistAPI, favoriteAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';
import { plural } from '../lib/plural';
import { useScrollLock } from '../lib/scrollLock';

type CatalogTab = 'services' | 'artists' | 'people';

const ARTIST_TYPES = [
  { value: 'ALL', label: 'Все' },
  { value: 'SOLO', label: 'Соло' },
  { value: 'GROUP', label: 'Группы' },
  { value: 'COVER_GROUP', label: 'Кавербэнды' },
];

// ─── Chip ────────────────────────────────────────────────────────────────────
// Спокойный чип-фильтр — тот же стиль, что у чипсов типов постов в Потоке.
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
        active ? 'bg-primary-600 border-primary-500 text-white shadow-sm' : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

// ─── ExpandableUserRow ───────────────────────────────────────────────────────
// `user` is a flat user object (People tab / userAPI.catalog).
// `searchProfile` is the optional searchMusicians payload that carries
// professions/services for the "Каталог" tab result cards.
function ExpandableUserRow({ user, searchProfile, onNavigate }: { user: any; searchProfile?: any; onNavigate: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isOnline = usePresenceStore((s) => s.onlineUsers.has(user.id));
  // Connections: catalog now returns a flat `connectionsCount`; fall back to _count.
  const connCount = user.connectionsCount
    ?? ((user._count?.sentConnections ?? 0) + (user._count?.receivedConnections ?? 0));
  // Professions: prefer searchMusicians.searchProfile, fall back to userServices.
  const professions: string[] = (searchProfile?.professions?.map((p: any) => p?.name).filter(Boolean))
    ?? user.userServices?.map((us: any) => us.profession?.name).filter(Boolean)
    ?? [];
  // Rating aggregates (only shown if there are reviews).
  const reviewsCount: number = user.reviewsCount ?? 0;
  const ratingAvg: number | null = user.ratingAvg ?? null;
  const hasRating = reviewsCount > 0 && ratingAvg != null;
  const location = user.city || user.country || '';

  return (
    <div className="border-b border-slate-800/50 last:border-0">
      {/* ── Collapsed row (always visible) ── */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors">
        {/* Avatar — click navigates to profile */}
        <div
          className="relative flex-shrink-0 cursor-pointer"
          onClick={() => onNavigate(user.id)}
        >
          <AvatarComponent src={user.avatar} name={`${user.lastName ?? ''} ${user.firstName ?? ''}`} size={44} className="rounded-xl" />
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-950 rounded-full" />
          )}
        </div>

        {/* Info — click navigates to profile. Surname first per spec. */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onNavigate(user.id)}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white min-w-0 break-words [overflow-wrap:anywhere]">
              {user.lastName} {user.firstName}
            </span>
            {user.isVerified && <span title="Верифицирован"><BadgeCheck size={12} className="text-sky-400 flex-shrink-0" /></span>}
            {user.isBlocked && <span title="Заблокирован"><Ban size={12} className="text-red-400 flex-shrink-0" /></span>}
          </div>

          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {location && <span className="text-xs text-slate-500 min-w-0 break-words [overflow-wrap:anywhere]">{location}</span>}
            {professions.length > 0 && (
              <span className="text-xs text-slate-400 min-w-0 break-words [overflow-wrap:anywhere]">{location ? '· ' : ''}{professions.slice(0, 2).join(', ')}</span>
            )}
            <span className="flex items-center gap-0.5 text-xs text-slate-500">
              <Link2 size={10} />
              {connCount} {plural(connCount, 'связь', 'связи', 'связей')}
            </span>
          </div>
        </div>

        {/* Expand toggle — a visible bordered pill (a bare chevron read as non-clickable) */}
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          className={`flex items-center gap-1 pl-2.5 pr-1.5 py-1.5 rounded-full border text-[11px] font-medium transition-all flex-shrink-0 ${
            expanded
              ? 'bg-primary-500/15 border-primary-500/40 text-primary-300'
              : 'bg-slate-800 border-slate-600 text-slate-300 hover:text-primary-300 hover:border-primary-500/40'
          }`}
          title={expanded ? 'Свернуть' : 'Раскрыть превью профиля'}
        >
          {expanded ? 'Свернуть' : 'Превью'}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* ── Expanded preview (max ~half the screen, scroll inside) ── */}
      {expanded && (
        <div className="px-4 pb-4 bg-slate-900/40 max-h-[50dvh] overflow-y-auto space-y-3">
          {/* О себе */}
          {user.bio?.trim() ? (
            <div>
              <p className="text-[11px] text-slate-500 mb-1 font-medium uppercase tracking-wider">О себе</p>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere]">{user.bio}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-600 italic">Описание не добавлено</p>
          )}

          {/* Профессии — full list */}
          {professions.length > 0 && (
            <div>
              <p className="text-[11px] text-slate-500 mb-1.5 font-medium uppercase tracking-wider">Профессии</p>
              <div className="flex flex-wrap gap-1.5">
                {professions.map((p, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 text-slate-300">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Средняя оценка + отзывы — only if there are ratings */}
          <div className="flex items-center gap-4">
            {hasRating && (
              <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
                <Star size={13} fill="currentColor" />
                {ratingAvg!.toFixed(1)}
                <span className="text-slate-500 font-normal">· {reviewsCount} {plural(reviewsCount, 'отзыв', 'отзыва', 'отзывов')}</span>
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Link2 size={12} />
              {connCount} {plural(connCount, 'связь', 'связи', 'связей')}
            </span>
          </div>

          {/* Перейти в профиль */}
          <button
            onClick={() => onNavigate(user.id)}
            className="w-full mt-1 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Перейти в профиль
          </button>
        </div>
      )}
    </div>
  );
}


// ─── SearchPage ───────────────────────────────────────────────────────────────
export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState<CatalogTab>('services');
  // Звёздочка «Избранное» — на вкладках «Артисты»/«Люди» показывает избранные (подписки/favorites)
  const [showFavorites, setShowFavorites] = useState(false);

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tempFilters, setTempFilters] = useState<string[]>([]);

  // ── Sort + location + price (applied) ────────────────────────────────────────
  type ServiceSort = 'date' | 'price_asc' | 'price_desc' | 'rating';
  const [sortMode, setSortMode] = useState<ServiceSort>('date');
  const [sortOpen, setSortOpen] = useState(false);
  const [locationFilter, setLocationFilter] = useState<string[]>([]); // applied cities
  const [priceMin, setPriceMin] = useState<string>('');               // applied
  const [priceMax, setPriceMax] = useState<string>('');               // applied
  const [deadlineMaxF, setDeadlineMaxF] = useState<string>('');       // applied: срок ≤ N дней
  const [serviceVerified, setServiceVerified] = useState(false);      // applied: верифицированный исполнитель
  const [ratingMinF, setRatingMinF] = useState<string>('');           // applied: оценка исполнителя от N

  // Draft values edited inside the filters modal (committed on "Применить").
  const [tempLocation, setTempLocation] = useState<string[]>([]);
  const [tempPriceMin, setTempPriceMin] = useState<string>('');
  const [tempPriceMax, setTempPriceMax] = useState<string>('');
  const [tempDeadlineMax, setTempDeadlineMax] = useState<string>('');
  const [tempServiceVerified, setTempServiceVerified] = useState(false);
  const [tempRatingMin, setTempRatingMin] = useState<string>('');
  const [cityQuery, setCityQuery] = useState('');
  const [debouncedCityQuery, setDebouncedCityQuery] = useState('');

  // Предиктивные подсказки под строкой поиска (все вкладки).
  const [searchFocused, setSearchFocused] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SORT_OPTIONS: { value: ServiceSort; label: string }[] = [
    { value: 'date', label: 'По дате добавления' },
    { value: 'price_asc', label: 'По стоимости (возр.)' },
    { value: 'price_desc', label: 'По стоимости (убыв.)' },
    { value: 'rating', label: 'По оценке исполнителя' },
  ];

  // ── Artists tab state ──────────────────────────────────────────────────────
  const [artistQuery, setArtistQuery] = useState('');
  const [debouncedArtistQuery, setDebouncedArtistQuery] = useState('');
  // Type is single-select among the 3 types ('' = «Все»). Genres combine on top.
  const [artistTypeFilter, setArtistTypeFilter] = useState<string>('');
  const [artistGenreFilter, setArtistGenreFilter] = useState<string[]>([]);
  // Sort: 'date' (default, newest first) | 'alpha' (name A→Z) | 'listeners'.
  type ArtistSort = 'date' | 'alpha' | 'listeners';
  const [artistSort, setArtistSort] = useState<ArtistSort>('date');
  const [artistSortOpen, setArtistSortOpen] = useState(false);
  // Advanced filter (genres + cities) modal.
  const [artistFilterOpen, setArtistFilterOpen] = useState(false);
  const [tempArtistGenres, setTempArtistGenres] = useState<string[]>([]);
  const [artistCityFilter, setArtistCityFilter] = useState<string[]>([]); // applied
  const [tempArtistCities, setTempArtistCities] = useState<string[]>([]);
  const [artistCitySearch, setArtistCitySearch] = useState('');
  const [debouncedArtistCitySearch, setDebouncedArtistCitySearch] = useState('');

  const ARTIST_SORT_OPTIONS: { value: ArtistSort; label: string }[] = [
    { value: 'date', label: 'По дате добавления' },
    { value: 'alpha', label: 'По алфавиту' },
    { value: 'listeners', label: 'По слушателям' },
  ];

  // ── People tab state ───────────────────────────────────────────────────────
  const [peopleQuery, setPeopleQuery] = useState('');
  const [debouncedPeopleQuery, setDebouncedPeopleQuery] = useState('');

  // Applied filters (committed): location names, profession ids, occupancy values.
  const [peopleLocation, setPeopleLocation] = useState<string[]>([]);
  const [peopleProfession, setPeopleProfession] = useState<string[]>([]);
  const [peopleOccupancy, setPeopleOccupancy] = useState<string[]>([]);
  const [peopleVerified, setPeopleVerified] = useState(false);      // только верифицированные
  const [peopleWithReviews, setPeopleWithReviews] = useState(false); // только с отзывами
  // Sort: date (default) | rating | connections | alpha. Alpha has a direction.
  type PeopleSort = 'date' | 'rating' | 'connections' | 'alpha';
  const [peopleSort, setPeopleSort] = useState<PeopleSort>('date');
  const [peopleAlphaDir, setPeopleAlphaDir] = useState<'asc' | 'desc'>('asc');
  const [peopleSortOpen, setPeopleSortOpen] = useState(false);

  // Filter panel (draft values committed on "Применить").
  const [peopleFilterOpen, setPeopleFilterOpen] = useState(false);
  const [tempPeopleLocation, setTempPeopleLocation] = useState<string[]>([]);
  const [tempPeopleProfession, setTempPeopleProfession] = useState<string[]>([]);
  const [tempPeopleOccupancy, setTempPeopleOccupancy] = useState<string[]>([]);
  const [tempPeopleVerified, setTempPeopleVerified] = useState(false);
  const [tempPeopleWithReviews, setTempPeopleWithReviews] = useState(false);
  // Per-checklist search boxes.
  const [peopleLocSearch, setPeopleLocSearch] = useState('');
  const [debouncedPeopleLocSearch, setDebouncedPeopleLocSearch] = useState('');
  const [peopleProfSearch, setPeopleProfSearch] = useState('');

  const PEOPLE_SORT_OPTIONS: { value: PeopleSort; label: string }[] = [
    { value: 'date', label: 'По дате регистрации' },
    { value: 'rating', label: 'По оценке' },
    { value: 'connections', label: 'По количеству связей' },
    { value: 'alpha', label: 'По алфавиту' },
  ];

  const OCCUPANCY_OPTIONS: { value: string; label: string }[] = [
    { value: 'open', label: 'Открыт для работы' },
    { value: 'considering', label: 'Рассматриваю предложения' },
    { value: 'closed', label: 'Занят' },
  ];

  // Lock body scroll while any full-screen filter modal is open (iOS jump fix).
  useScrollLock(filtersOpen || artistFilterOpen || peopleFilterOpen);

  // Single-select type ('' clears to «Все»; selecting the active type clears it).
  function selectType(value: string) {
    if (value === 'ALL') { setArtistTypeFilter(''); return; }
    setArtistTypeFilter(prev => (prev === value ? '' : value));
  }

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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCityQuery(cityQuery), 250);
    return () => clearTimeout(t);
  }, [cityQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPeopleLocSearch(peopleLocSearch), 250);
    return () => clearTimeout(t);
  }, [peopleLocSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedArtistCitySearch(artistCitySearch), 250);
    return () => clearTimeout(t);
  }, [artistCitySearch]);

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

  // City autocomplete for the location filter (only while the filters modal is open).
  const { data: cityOptions } = useQuery({
    queryKey: ['service-cities', debouncedCityQuery],
    queryFn: async () => {
      const { data } = await referenceAPI.getServiceCities(debouncedCityQuery || undefined);
      return (data as any[]).map((c) => c.name as string);
    },
    enabled: activeTab === 'services' && filtersOpen,
  });

  // ── Service-card results (searchServiceCards) ───────────────────────────────
  const serviceSearchParams = {
    serviceId: selectedService?.id,
    sectionId: selectedSection?.id && !selectedService ? selectedSection.id : undefined,
    customFilterValueIds: profFilterValues.length ? profFilterValues.join(',') : undefined,
    query: debouncedServiceQuery || undefined,
    location: locationFilter.length ? locationFilter.join(',') : undefined,
    priceMin: priceMin !== '' ? Number(priceMin) : undefined,
    priceMax: priceMax !== '' ? Number(priceMax) : undefined,
    deadlineMax: deadlineMaxF !== '' ? Number(deadlineMaxF) : undefined,
    verifiedOnly: serviceVerified ? '1' : undefined,
    ratingMin: ratingMinF !== '' ? Number(ratingMinF) : undefined,
    sort: sortMode,
  };

  const { data: serviceCards, isLoading: catalogLoading } = useQuery({
    queryKey: ['service-card-search', serviceSearchParams],
    queryFn: async () => {
      const { data } = await referenceAPI.searchServiceCards(serviceSearchParams);
      // Catalog of services — show all created offerings, including the user's own.
      return ((data as any)?.results ?? []) as any[];
    },
    enabled: activeTab === 'services',
  });

  // ── Artists ────────────────────────────────────────────────────────────────
  // Verified artists only (server-enforced). Search + type + genres + sort are
  // all applied server-side; type is single-select, genres combine with it.
  const { data: artists, isLoading: artistsLoading } = useQuery({
    queryKey: ['catalog-artists', debouncedArtistQuery, artistTypeFilter, artistGenreFilter, artistCityFilter, artistSort],
    queryFn: async () => {
      const { data } = await referenceAPI.getArtists({
        search: debouncedArtistQuery || undefined,
        type: artistTypeFilter || undefined,
        genre: artistGenreFilter.length ? artistGenreFilter.join(',') : undefined,
        city: artistCityFilter.length ? artistCityFilter.join(',') : undefined,
        sort: artistSort,
      });
      return data as any[];
    },
    enabled: activeTab === 'artists',
  });

  // Artist city autocomplete (only while the artists filter modal is open).
  const { data: artistCityOptions } = useQuery({
    queryKey: ['artist-cities', debouncedArtistCitySearch],
    queryFn: async () => {
      const { data } = await referenceAPI.getArtistCities(debouncedArtistCitySearch || undefined);
      return (data as any[]).map((c) => c.name as string);
    },
    enabled: activeTab === 'artists' && artistFilterOpen,
  });

  // ── People ────────────────────────────────────────────────────────────────
  const { data: peopleUsers, isLoading: peopleLoading } = useQuery({
    queryKey: ['catalog-people', debouncedPeopleQuery, peopleLocation, peopleProfession, peopleOccupancy, peopleVerified, peopleWithReviews, peopleSort, peopleAlphaDir],
    queryFn: async () => {
      const { data } = await userAPI.catalog({
        query: debouncedPeopleQuery || undefined,
        location: peopleLocation.length ? peopleLocation.join(',') : undefined,
        profession: peopleProfession.length ? peopleProfession.join(',') : undefined,
        occupancy: peopleOccupancy.length ? peopleOccupancy.join(',') : undefined,
        verifiedOnly: peopleVerified ? '1' : undefined,
        withReviews: peopleWithReviews ? '1' : undefined,
        sort: peopleSort,
        alphaDir: peopleSort === 'alpha' ? peopleAlphaDir : undefined,
      });
      return (data as any[]).filter((u: any) => u.id !== currentUser?.id);
    },
    enabled: activeTab === 'people',
  });

  // People filter reference data (only while the People tab is active).
  const { data: peopleLocationOptions } = useQuery({
    queryKey: ['people-locations', debouncedPeopleLocSearch],
    queryFn: async () => {
      const { data } = await referenceAPI.getPeopleLocations(debouncedPeopleLocSearch || undefined);
      return (data as any[]).map((c) => c.name as string);
    },
    enabled: activeTab === 'people' && peopleFilterOpen,
  });

  const { data: peopleProfessionOptions } = useQuery({
    queryKey: ['people-professions'],
    queryFn: async () => {
      const { data } = await referenceAPI.getProfessions();
      return (data as any[]).map((p) => ({ id: p.id as string, name: p.name as string }));
    },
    enabled: activeTab === 'people' && peopleFilterOpen,
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

  // ── Избранное: подписки на артистов + избранные пользователи ────────────────
  const { data: favArtists, isLoading: favArtistsLoading } = useQuery({
    queryKey: ['catalog-fav-artists'],
    queryFn: async () => {
      const { data } = await artistAPI.getFollowing();
      return data as any[];
    },
    enabled: showFavorites && activeTab === 'artists' && !!currentUser,
  });
  const { data: favPeople, isLoading: favPeopleLoading } = useQuery({
    queryKey: ['catalog-fav-people'],
    queryFn: async () => {
      const { data } = await favoriteAPI.list();
      return (data as any[]).map((f) => f.user).filter(Boolean);
    },
    enabled: showFavorites && activeTab === 'people' && !!currentUser,
  });

  // Источник для вкладок с учётом звёздочки «Избранное»
  const displayArtists = showFavorites ? (favArtists ?? []) : (artists ?? []);
  const displayArtistsLoading = showFavorites ? favArtistsLoading : artistsLoading;
  const displayPeople = showFavorites ? (favPeople ?? []) : (peopleUsers ?? []);
  const displayPeopleLoading = showFavorites ? favPeopleLoading : peopleLoading;

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

  // Services of the currently opened section (sections mode).
  const sectionServices: any[] = selectedSection
    ? ((sections ?? []).find((s: any) => s.id === selectedSection.id)?.services ?? [])
    : [];

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-3 space-y-3">

          {/* Title */}
          <div className="flex items-center gap-2">
            <Search size={20} className="text-primary-400 flex-shrink-0" />
            <h2 className="text-lg font-bold text-white">Каталог</h2>
            {activeTab !== 'services' && (
              <button
                onClick={() => setShowFavorites((s) => !s)}
                className={`ml-auto flex items-center px-2.5 py-1.5 rounded-xl transition-colors ${showFavorites ? 'text-amber-300 bg-amber-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title={showFavorites ? 'Показаны избранные' : 'Избранное'}
                aria-label="Избранное"
              >
                <Star size={18} fill={showFavorites ? 'currentColor' : 'none'} />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
            {[
              { id: 'services' as const, label: 'Услуги' },
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
            // ── Предиктивные подсказки: каталог (локально) + живые результаты ──
            const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
            const q = norm(value.trim());
            const showSuggest = searchFocused && q.length >= 2;
            let suggestContent: any = null;
            if (showSuggest) {
              if (activeTab === 'services') {
                // Совпадения по каталогу услуг — мгновенно, из уже загруженных разделов.
                const catalogMatches: { svc: any; section: any }[] = [];
                for (const section of sections ?? []) {
                  for (const svc of section.services ?? []) {
                    if (norm(svc.name).includes(q)) catalogMatches.push({ svc, section });
                    if (catalogMatches.length >= 4) break;
                  }
                  if (catalogMatches.length >= 4) break;
                }
                const cards = (serviceCards ?? []).slice(0, 4);
                suggestContent = (catalogMatches.length || cards.length) ? (
                  <>
                    {catalogMatches.map(({ svc, section }) => (
                      <button
                        key={`cat-${svc.id}`}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          handleSectionClick(section);
                          handleServiceClick(svc);
                          setServiceQuery('');
                          setSearchFocused(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-800/60 transition-colors"
                      >
                        <Search size={13} className="text-primary-400 flex-shrink-0" />
                        <span className="text-sm text-white truncate">{svc.name}</span>
                        <span className="text-xs text-slate-500 truncate ml-auto flex-shrink-0">{section.name}</span>
                      </button>
                    ))}
                    {cards.map((card: any) => (
                      <button
                        key={`card-${card.id}`}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setSearchFocused(false); handleNavigateToServiceCard(card); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-800/60 transition-colors"
                      >
                        <AvatarComponent src={card.user?.avatar} name={`${card.user?.firstName ?? ''} ${card.user?.lastName ?? ''}`} size={24} className="rounded-lg flex-shrink-0" />
                        <span className="text-sm text-white truncate">{card.name || card.service?.name}</span>
                        <span className="text-xs text-slate-500 truncate ml-auto flex-shrink-0">{card.user?.firstName} {card.user?.lastName}</span>
                      </button>
                    ))}
                  </>
                ) : (
                  <p className="px-3 py-2.5 text-xs text-slate-500">{catalogLoading ? 'Ищем…' : 'Ничего не найдено'}</p>
                );
              } else if (activeTab === 'artists') {
                // Локальный дофильтр: сервер ищет по имени с дебаунсом, а избранные
                // приходят вовсе без поиска — фильтруем по текущему вводу сразу.
                const list = (displayArtists ?? []).filter((a: any) => norm(a.name ?? '').includes(q)).slice(0, 6);
                suggestContent = list.length ? list.map((a: any) => (
                  <button
                    key={a.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setSearchFocused(false); handleNavigateToArtist(a.id); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-800/60 transition-colors"
                  >
                    <AvatarComponent src={a.avatar} name={a.name} size={24} className="rounded-lg flex-shrink-0" />
                    <span className="text-sm text-white truncate">{a.name}</span>
                    <span className="text-xs text-slate-500 truncate ml-auto flex-shrink-0">
                      {a.type === 'SOLO' ? 'Соло' : a.type === 'GROUP' ? 'Группа' : a.type === 'COVER_GROUP' ? 'Кавербэнд' : ''}
                    </span>
                  </button>
                )) : (
                  <p className="px-3 py-2.5 text-xs text-slate-500">{displayArtistsLoading ? 'Ищем…' : 'Ничего не найдено'}</p>
                );
              } else {
                // Серверный поиск людей шире имени (bio, профессии) — локально дофильтровываем
                // только избранных, которых сервер по query не фильтрует вовсе.
                const peoplePool = showFavorites
                  ? (displayPeople ?? []).filter((u: any) => norm(`${u.lastName ?? ''} ${u.firstName ?? ''} ${u.nickname ?? ''}`).includes(q))
                  : (displayPeople ?? []);
                const list = peoplePool.slice(0, 6);
                suggestContent = list.length ? list.map((u: any) => (
                  <button
                    key={u.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setSearchFocused(false); handleNavigateToProfile(u.id); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-800/60 transition-colors"
                  >
                    <AvatarComponent src={u.avatar} name={`${u.lastName ?? ''} ${u.firstName ?? ''}`} size={24} className="rounded-lg flex-shrink-0" />
                    <span className="text-sm text-white truncate">{u.lastName} {u.firstName}</span>
                    <span className="text-xs text-slate-500 truncate ml-auto flex-shrink-0">
                      {u.userServices?.[0]?.profession?.name ?? u.city ?? ''}
                    </span>
                  </button>
                )) : (
                  <p className="px-3 py-2.5 text-xs text-slate-500">{displayPeopleLoading ? 'Ищем…' : 'Ничего не найдено'}</p>
                );
              }
            }
            return (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  onFocus={() => {
                    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                    setSearchFocused(true);
                  }}
                  onBlur={() => { blurTimerRef.current = setTimeout(() => setSearchFocused(false), 150); }}
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
                {showSuggest && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-[57] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-800/50">
                    {suggestContent}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Sort + filters — одинаковая строка контролов на всех вкладках */}
          {activeTab === 'artists' && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setArtistSortOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
                >
                  <ArrowDownUp size={14} />
                  {ARTIST_SORT_OPTIONS.find(o => o.value === artistSort)?.label}
                  <ChevronDown size={13} className={`transition-transform ${artistSortOpen ? 'rotate-180' : ''}`} />
                </button>
                {artistSortOpen && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setArtistSortOpen(false)} />
                    <div className="absolute left-0 mt-1.5 z-[56] w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden py-1">
                      {ARTIST_SORT_OPTIONS.map(o => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => { setArtistSort(o.value); setArtistSortOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                            artistSort === o.value ? 'bg-primary-600/20 text-primary-300 font-medium' : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setTempArtistGenres(artistGenreFilter);
                  setTempArtistCities(artistCityFilter);
                  setArtistCitySearch('');
                  setArtistFilterOpen(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
              >
                <SlidersHorizontal size={14} />
                Фильтры
                {(artistGenreFilter.length + artistCityFilter.length) > 0 && (
                  <span className="bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                    {artistGenreFilter.length + artistCityFilter.length}
                  </span>
                )}
              </button>
            </div>
          )}
          {activeTab === 'people' && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPeopleSortOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
                  title="Сортировка"
                >
                  <ArrowDownUp size={14} />
                  {PEOPLE_SORT_OPTIONS.find(o => o.value === peopleSort)?.label}
                  <ChevronDown size={13} className={`transition-transform ${peopleSortOpen ? 'rotate-180' : ''}`} />
                </button>
                {peopleSortOpen && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setPeopleSortOpen(false)} />
                    <div className="absolute left-0 mt-1.5 z-[56] w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden py-1">
                      {PEOPLE_SORT_OPTIONS.map(o => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => {
                            if (o.value === 'alpha' && peopleSort === 'alpha') {
                              setPeopleAlphaDir(d => (d === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setPeopleSort(o.value);
                              if (o.value === 'alpha') setPeopleAlphaDir('asc');
                            }
                            if (o.value !== 'alpha') setPeopleSortOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${
                            peopleSort === o.value ? 'bg-primary-600/20 text-primary-300 font-medium' : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span>{o.label}</span>
                          {o.value === 'alpha' && peopleSort === 'alpha' && (
                            <span className="text-[10px] text-primary-400">{peopleAlphaDir === 'asc' ? 'А→Я' : 'Я→А'}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setTempPeopleLocation(peopleLocation);
                  setTempPeopleProfession(peopleProfession);
                  setTempPeopleOccupancy(peopleOccupancy);
                  setTempPeopleVerified(peopleVerified);
                  setTempPeopleWithReviews(peopleWithReviews);
                  setPeopleLocSearch('');
                  setPeopleProfSearch('');
                  setPeopleFilterOpen(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
              >
                <SlidersHorizontal size={14} />
                Фильтры
                {(() => {
                  const n = peopleLocation.length + peopleProfession.length + peopleOccupancy.length
                    + (peopleVerified ? 1 : 0) + (peopleWithReviews ? 1 : 0);
                  return n > 0 ? (
                    <span className="bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">{n}</span>
                  ) : null;
                })()}
              </button>
            </div>
          )}
          {activeTab === 'services' && (() => {
            const activeFilterCount =
              profFilterValues.length + locationFilter.length + (priceMin !== '' || priceMax !== '' ? 1 : 0)
              + (deadlineMaxF !== '' ? 1 : 0) + (serviceVerified ? 1 : 0) + (ratingMinF !== '' ? 1 : 0);
            return (
              <div className="flex items-center gap-2">
                {/* Sort */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSortOpen(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
                  >
                    <ArrowDownUp size={14} />
                    {SORT_OPTIONS.find(o => o.value === sortMode)?.label}
                    <ChevronDown size={13} className={`transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {sortOpen && (
                    <>
                      <div className="fixed inset-0 z-[55]" onClick={() => setSortOpen(false)} />
                      <div className="absolute left-0 mt-1.5 z-[56] w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden py-1">
                        {SORT_OPTIONS.map(o => (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => { setSortMode(o.value); setSortOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                              sortMode === o.value ? 'bg-primary-600/20 text-primary-300 font-medium' : 'text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Filters (location + price + service attributes) */}
                <button
                  type="button"
                  onClick={() => {
                    setTempFilters(profFilterValues);
                    setTempLocation(locationFilter);
                    setTempPriceMin(priceMin);
                    setTempPriceMax(priceMax);
                    setTempDeadlineMax(deadlineMaxF);
                    setTempServiceVerified(serviceVerified);
                    setTempRatingMin(ratingMinF);
                    setCityQuery('');
                    setFiltersOpen(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
                >
                  <SlidersHorizontal size={14} />
                  Фильтры
                  {activeFilterCount > 0 && (
                    <span className="bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-4xl mx-auto px-4 pb-28">

        {/* ══ УСЛУГИ TAB ══ */}
        {activeTab === 'services' && (
          <>
            {/* ── Browse: разделы → услуги раздела (спокойные чипсы, оба уровня видны) ── */}
            <div className="mt-4 mb-6 space-y-2.5">
              {sectionsLoading ? (
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="h-8 w-28 bg-slate-800/50 rounded-full animate-pulse" />
                  ))}
                </div>
              ) : (sections ?? []).length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Chip label="Все" active={!selectedSection} onClick={goBack} />
                    {(sections ?? []).map((section: any) => (
                      <Chip
                        key={section.id}
                        label={section.name}
                        active={selectedSection?.id === section.id}
                        onClick={() => (selectedSection?.id === section.id ? goBack() : handleSectionClick(section))}
                      />
                    ))}
                  </div>
                  {selectedSection && (
                    sectionServices.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-2.5 border-t border-slate-800/60">
                        {sectionServices.map((svc: any) => (
                          <Chip
                            key={svc.id}
                            label={svc.name}
                            active={selectedService?.id === svc.id}
                            onClick={() => handleServiceClick(svc)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">В этом разделе нет услуг</p>
                    )
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-sm">Разделы не найдены</p>
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
              </div>

              {catalogLoading ? (
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
              ) : serviceCards && serviceCards.length > 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/50">
                  {/* Компактные строки — та же анатомия, что у Артистов/Людей */}
                  {serviceCards.map((card: any) => {
                    const cardUser = card.user ?? {};
                    const title = (card.name && String(card.name).trim()) || card.service?.name || 'Услуга';
                    const rating = cardUser.rating && cardUser.rating.count > 0 ? cardUser.rating : null;
                    let priceLabel = 'Договорная';
                    if (card.priceFrom != null && card.priceTo != null) {
                      priceLabel = `${Number(card.priceFrom).toLocaleString('ru-RU')}–${Number(card.priceTo).toLocaleString('ru-RU')} ₽`;
                    } else if (card.priceFrom != null) {
                      priceLabel = `от ${Number(card.priceFrom).toLocaleString('ru-RU')} ₽`;
                    } else if (card.priceTo != null) {
                      priceLabel = `до ${Number(card.priceTo).toLocaleString('ru-RU')} ₽`;
                    }
                    return (
                      <button
                        key={card.id}
                        onClick={() => handleNavigateToServiceCard(card)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left"
                      >
                        <AvatarComponent
                          src={cardUser.avatar}
                          name={`${cardUser.firstName ?? ''} ${cardUser.lastName ?? ''}`}
                          size={44}
                          className="rounded-xl flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-white truncate">{title}</span>
                            {card.service?.section?.name && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-primary-500/20 text-primary-300 rounded-md flex-shrink-0">
                                {card.service.section.name}
                              </span>
                            )}
                            {cardUser.isPremium && <span title="Premium"><Crown size={12} className="text-amber-400 flex-shrink-0" /></span>}
                            {cardUser.isVerified && <span title="Верифицирован"><BadgeCheck size={12} className="text-sky-400 flex-shrink-0" /></span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-slate-500 truncate">{cardUser.firstName} {cardUser.lastName}</span>
                            {cardUser.city && <span className="text-xs text-slate-600">· {cardUser.city}</span>}
                            {rating && (
                              <span className="flex items-center gap-0.5 text-xs text-amber-400 font-medium">
                                · <Star size={11} fill="currentColor" />{Number(rating.avg).toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-primary-300 flex-shrink-0 whitespace-nowrap">{priceLabel}</span>
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
                  <p className="text-slate-400 text-sm">Такая услуга не найдена</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ ARTISTS TAB ══ */}

        {activeTab === 'artists' && (
          <>
            {/* Тип артиста — спокойные чипсы; жанры — в модалке «Фильтры» */}
            <div className="mt-4 mb-4 flex flex-wrap gap-2">
              {ARTIST_TYPES.map(type => (
                <Chip
                  key={type.value}
                  label={type.label}
                  active={type.value === 'ALL' ? artistTypeFilter === '' : artistTypeFilter === type.value}
                  onClick={() => selectType(type.value)}
                />
              ))}
              {/* Активные фильтры (жанры+города) — краткое напоминание с быстрым сбросом */}
              {(artistGenreFilter.length + artistCityFilter.length) > 0 && (
                <button
                  onClick={() => { setArtistGenreFilter([]); setArtistCityFilter([]); }}
                  className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border bg-primary-500/10 border-primary-500/40 text-primary-300 hover:text-white transition-all"
                  title="Сбросить фильтры"
                >
                  Фильтры: {artistGenreFilter.length + artistCityFilter.length}
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Artist list */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Все артисты</p>
                {displayArtistsLoading && <Loader2 size={12} className="text-primary-400 animate-spin" />}
              </div>

              {displayArtistsLoading ? (
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
              ) : displayArtists.length > 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/50">
                  {displayArtists.map((artist: any) => {
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
                  <p className="text-slate-400 text-sm">Такой артист не найден</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ PEOPLE TAB ══ */}
        {activeTab === 'people' && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Все участники</p>
              {displayPeopleLoading && <Loader2 size={12} className="text-primary-400 animate-spin" />}
            </div>

            {displayPeopleLoading ? (
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
            ) : displayPeople.length > 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                {displayPeople.map((user: any) => (
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
                <p className="text-slate-400 text-sm">Такой пользователь не найден</p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Attribute filters modal */}
      {filtersOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setFiltersOpen(false)} />
          <div className="relative w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-primary-400" />
                <h3 className="text-base font-semibold text-white">Фильтры</h3>
                {(() => {
                  const n = tempFilters.length + tempLocation.length + (tempPriceMin !== '' || tempPriceMax !== '' ? 1 : 0)
                    + (tempDeadlineMax !== '' ? 1 : 0) + (tempServiceVerified ? 1 : 0) + (tempRatingMin !== '' ? 1 : 0);
                  return n > 0 ? (
                    <span className="bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">{n}</span>
                  ) : null;
                })()}
              </div>
              <button onClick={() => setFiltersOpen(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-5 overflow-y-auto">
              {/* Location — multiselect with city autocomplete */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Локация</p>
                {tempLocation.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tempLocation.map(city => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => setTempLocation(prev => prev.filter(c => c !== city))}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary-600 text-white"
                      >
                        {city}
                        <X size={12} />
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="text"
                    value={cityQuery}
                    onChange={e => setCityQuery(e.target.value)}
                    placeholder="Город..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600"
                  />
                </div>
                {(cityOptions ?? []).filter(c => !tempLocation.includes(c)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(cityOptions ?? []).filter(c => !tempLocation.includes(c)).slice(0, 12).map(city => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => { setTempLocation(prev => [...prev, city]); setCityQuery(''); }}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium border bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Price range */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Стоимость, ₽</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={tempPriceMin}
                    onChange={e => setTempPriceMin(e.target.value)}
                    placeholder="от"
                    className="flex-1 min-w-0 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600"
                  />
                  <span className="text-slate-600">–</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={tempPriceMax}
                    onChange={e => setTempPriceMax(e.target.value)}
                    placeholder="до"
                    className="flex-1 min-w-0 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600"
                  />
                </div>
              </div>

              {/* Срок выполнения */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Срок выполнения</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">до</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={tempDeadlineMax}
                    onChange={e => setTempDeadlineMax(e.target.value)}
                    placeholder="—"
                    className="w-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600"
                  />
                  <span className="text-sm text-slate-400">дней</span>
                </div>
                {tempDeadlineMax !== '' && (
                  <p className="text-[11px] text-slate-500 mt-1.5">Услуги без указанного срока будут скрыты.</p>
                )}
              </div>

              {/* Исполнитель */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Исполнитель</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTempServiceVerified(v => !v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      tempServiceVerified ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    Верифицированный
                  </button>
                  {['7', '8', '9'].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setTempRatingMin(prev => (prev === r ? '' : r))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                        tempRatingMin === r ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600'
                      }`}
                    >
                      Оценка {r}+
                    </button>
                  ))}
                </div>
              </div>

              {/* Service-specific attribute filters (only when a service is selected) */}
              {!selectedService && (
                <p className="text-[11px] text-slate-500">
                  Выберите конкретную услугу в каталоге над списком — здесь появятся её характеристики (опыт, жанры, оборудование и т.д.).
                </p>
              )}
              {(activeFilters ?? []).map((group: any) => (
                <div key={group.id}>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{group.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.values?.map((val: any) => {
                      const isActive = tempFilters.includes(String(val.id));
                      return (
                        <button
                          key={val.id}
                          type="button"
                          onClick={() => setTempFilters(prev => prev.includes(String(val.id)) ? prev.filter(x => x !== String(val.id)) : [...prev, String(val.id)])}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                            isActive ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600'
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

            <div className="px-5 pb-5 pt-4 border-t border-slate-800 flex gap-2.5 flex-shrink-0">
              <button
                onClick={() => {
                  setTempFilters([]); setTempLocation([]); setTempPriceMin(''); setTempPriceMax(''); setCityQuery('');
                  setTempDeadlineMax(''); setTempServiceVerified(false); setTempRatingMin('');
                  setProfFilterValues([]); setLocationFilter([]); setPriceMin(''); setPriceMax('');
                  setDeadlineMaxF(''); setServiceVerified(false); setRatingMinF('');
                  setFiltersOpen(false);
                }}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
              >
                Сбросить
              </button>
              <button
                onClick={() => {
                  setProfFilterValues(tempFilters);
                  setLocationFilter(tempLocation);
                  setPriceMin(tempPriceMin);
                  setPriceMax(tempPriceMax);
                  setDeadlineMaxF(tempDeadlineMax);
                  setServiceVerified(tempServiceVerified);
                  setRatingMinF(tempRatingMin);
                  setFiltersOpen(false);
                }}
                className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Применить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Artist advanced filter modal — full genre multiselect */}
      {artistFilterOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setArtistFilterOpen(false)} />
          <div className="relative w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-primary-400" />
                <h3 className="text-base font-semibold text-white">Фильтры</h3>
                {(tempArtistGenres.length + tempArtistCities.length) > 0 && (
                  <span className="bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">{tempArtistGenres.length + tempArtistCities.length}</span>
                )}
              </div>
              <button onClick={() => setArtistFilterOpen(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-5 overflow-y-auto">
              {/* Город — multiselect with autocomplete */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Город</p>
                {tempArtistCities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tempArtistCities.map(city => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => setTempArtistCities(prev => prev.filter(c => c !== city))}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary-600 text-white"
                      >
                        {city}
                        <X size={12} />
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="text"
                    value={artistCitySearch}
                    onChange={e => setArtistCitySearch(e.target.value)}
                    placeholder="Город..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600"
                  />
                </div>
                {(artistCityOptions ?? []).filter(c => !tempArtistCities.includes(c)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(artistCityOptions ?? []).filter(c => !tempArtistCities.includes(c)).slice(0, 12).map(city => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => { setTempArtistCities(prev => [...prev, city]); setArtistCitySearch(''); }}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium border bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Жанры</p>
              {(genresList ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {(genresList ?? []).map((genre: any) => {
                    const isActive = tempArtistGenres.includes(genre.id);
                    return (
                      <button
                        key={genre.id}
                        type="button"
                        onClick={() => setTempArtistGenres(prev => prev.includes(genre.id) ? prev.filter(x => x !== genre.id) : [...prev, genre.id])}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                          isActive ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        {genre.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Жанры не найдены</p>
              )}
              </div>
            </div>

            <div className="px-5 pb-5 pt-4 border-t border-slate-800 flex gap-2.5 flex-shrink-0">
              <button
                onClick={() => {
                  setTempArtistGenres([]); setTempArtistCities([]); setArtistCitySearch('');
                  setArtistGenreFilter([]); setArtistCityFilter([]);
                  setArtistFilterOpen(false);
                }}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
              >
                Сбросить
              </button>
              <button
                onClick={() => {
                  setArtistGenreFilter(tempArtistGenres);
                  setArtistCityFilter(tempArtistCities);
                  setArtistFilterOpen(false);
                }}
                className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Применить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* People filter modal — 3 checklist filters (location / profession / occupancy) */}
      {peopleFilterOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPeopleFilterOpen(false)} />
          <div className="relative w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-primary-400" />
                <h3 className="text-base font-semibold text-white">Фильтры</h3>
                {(() => {
                  const n = tempPeopleLocation.length + tempPeopleProfession.length + tempPeopleOccupancy.length
                    + (tempPeopleVerified ? 1 : 0) + (tempPeopleWithReviews ? 1 : 0);
                  return n > 0 ? (
                    <span className="bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">{n}</span>
                  ) : null;
                })()}
              </div>
              <button onClick={() => setPeopleFilterOpen(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-6 overflow-y-auto">
              {/* Локация — searchable checklist, chosen pinned as tags */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Локация</p>
                {tempPeopleLocation.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tempPeopleLocation.map(loc => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => setTempPeopleLocation(prev => prev.filter(c => c !== loc))}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary-600 text-white"
                      >
                        {loc}
                        <X size={12} />
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="text"
                    value={peopleLocSearch}
                    onChange={e => setPeopleLocSearch(e.target.value)}
                    placeholder="Город или страна..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/60">
                  {(peopleLocationOptions ?? []).filter(c => !tempPeopleLocation.includes(c)).length > 0 ? (
                    (peopleLocationOptions ?? []).filter(c => !tempPeopleLocation.includes(c)).map(loc => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => { setTempPeopleLocation(prev => [...prev, loc]); }}
                        className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60 transition-colors"
                      >
                        {loc}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-xs text-slate-600">Ничего не найдено</p>
                  )}
                </div>
              </div>

              {/* Профессия — searchable checklist over professions catalog */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Профессия</p>
                {tempPeopleProfession.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tempPeopleProfession.map(pid => {
                      const p = (peopleProfessionOptions ?? []).find(o => o.id === pid);
                      return (
                        <button
                          key={pid}
                          type="button"
                          onClick={() => setTempPeopleProfession(prev => prev.filter(x => x !== pid))}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary-600 text-white"
                        >
                          {p?.name ?? '…'}
                          <X size={12} />
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="text"
                    value={peopleProfSearch}
                    onChange={e => setPeopleProfSearch(e.target.value)}
                    placeholder="Профессия..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/60">
                  {(() => {
                    const qn = peopleProfSearch.trim().toLowerCase();
                    const list = (peopleProfessionOptions ?? [])
                      .filter(p => !tempPeopleProfession.includes(p.id))
                      .filter(p => !qn || p.name.toLowerCase().includes(qn));
                    return list.length > 0 ? (
                      list.slice(0, 100).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setTempPeopleProfession(prev => [...prev, p.id])}
                          className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60 transition-colors"
                        >
                          {p.name}
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-xs text-slate-600">Ничего не найдено</p>
                    );
                  })()}
                </div>
              </div>

              {/* Статус занятости — small fixed checklist */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Статус занятости</p>
                <div className="flex flex-wrap gap-1.5">
                  {OCCUPANCY_OPTIONS.map(opt => {
                    const isActive = tempPeopleOccupancy.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTempPeopleOccupancy(prev => prev.includes(opt.value) ? prev.filter(x => x !== opt.value) : [...prev, opt.value])}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                          isActive ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Дополнительно — надёжность участника */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Дополнительно</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTempPeopleVerified(v => !v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      tempPeopleVerified ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    Только верифицированные
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempPeopleWithReviews(v => !v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      tempPeopleWithReviews ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    С отзывами
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 pt-4 border-t border-slate-800 flex gap-2.5 flex-shrink-0">
              <button
                onClick={() => {
                  setTempPeopleLocation([]); setTempPeopleProfession([]); setTempPeopleOccupancy([]);
                  setTempPeopleVerified(false); setTempPeopleWithReviews(false);
                  setPeopleLocSearch(''); setPeopleProfSearch('');
                  setPeopleLocation([]); setPeopleProfession([]); setPeopleOccupancy([]);
                  setPeopleVerified(false); setPeopleWithReviews(false);
                  setPeopleFilterOpen(false);
                }}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
              >
                Сбросить
              </button>
              <button
                onClick={() => {
                  setPeopleLocation(tempPeopleLocation);
                  setPeopleProfession(tempPeopleProfession);
                  setPeopleOccupancy(tempPeopleOccupancy);
                  setPeopleVerified(tempPeopleVerified);
                  setPeopleWithReviews(tempPeopleWithReviews);
                  setPeopleFilterOpen(false);
                }}
                className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Применить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
