import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Crown, BadgeCheck, Ban, Users, Music2, Loader2, X,
  BookOpen, Link2, ShieldCheck, Star, MessageCircle, HandshakeIcon, SlidersHorizontal,
  ArrowDownUp,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { usePresenceStore } from '../stores/presenceStore';
import { referenceAPI, userAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';
import DealCreateModal from '../components/DealCreateModal';
import { DEALS_ENABLED } from '../lib/features';
import { useAuthGate } from '../components/AuthGateModal';
import { plural } from '../lib/plural';
import { useScrollLock } from '../lib/scrollLock';

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


// ─── ServiceCardItem ─────────────────────────────────────────────────────────
// Renders a single service offering (UserService) — a "service card", not a person.
function ServiceCardItem({ card, currentUserId, onNavigate, onMessage, onDeal, ensureAuth }: {
  card: any;
  currentUserId?: string;
  onNavigate: (card: any) => void;
  onMessage: (userId: string) => void;
  onDeal: (card: any) => void;
  // Runs the action when signed in; otherwise opens the auth-gate modal.
  ensureAuth: (action: () => void) => boolean;
}) {
  const user = card.user ?? {};
  const isOwn = !!currentUserId && user.id === currentUserId;
  const title = (card.name && String(card.name).trim()) || card.service?.name || 'Услуга';
  const rating = user.rating && user.rating.count > 0 ? user.rating : null;
  const priceItems: Array<{ name: string; price: string }> = Array.isArray(card.priceItems) ? card.priceItems : [];

  // Price range label
  let priceLabel = 'Цена договорная';
  if (card.priceFrom != null && card.priceTo != null) {
    priceLabel = `${Number(card.priceFrom).toLocaleString('ru-RU')} – ${Number(card.priceTo).toLocaleString('ru-RU')} ₽`;
  } else if (card.priceFrom != null) {
    priceLabel = `От ${Number(card.priceFrom).toLocaleString('ru-RU')} ₽`;
  } else if (card.priceTo != null) {
    priceLabel = `До ${Number(card.priceTo).toLocaleString('ru-RU')} ₽`;
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-primary-600/60 transition-all">
      {/* Provider: avatar + name + rating */}
      <button onClick={() => onNavigate(card)} className="w-full flex items-center gap-2.5 text-left">
        <AvatarComponent
          src={user.avatar}
          name={`${user.firstName ?? ''} ${user.lastName ?? ''}`}
          size={40}
          className="rounded-xl flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">{user.firstName} {user.lastName}</span>
            {user.isPremium && <span title="Premium"><Crown size={12} className="text-amber-400 flex-shrink-0" /></span>}
            {user.isVerified && <span title="Верифицирован"><BadgeCheck size={12} className="text-sky-400 flex-shrink-0" /></span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {rating && (
              <span className="flex items-center gap-0.5 text-[11px] text-amber-400 font-medium">
                <Star size={11} fill="currentColor" />
                {Number(rating.avg).toFixed(1)}
              </span>
            )}
            {user.city && <span className="text-[11px] text-slate-600 truncate">{user.city}</span>}
          </div>
        </div>
        {card.service?.section?.name && (
          <span className="flex-shrink-0 self-start text-[10px] px-2 py-0.5 bg-primary-500/15 text-primary-300 rounded-md uppercase tracking-wide">
            {card.service.section.name}
          </span>
        )}
      </button>

      {/* Service title (free-form name) */}
      <button onClick={() => onNavigate(card)} className="block w-full text-left mt-3">
        <p className="text-sm font-semibold text-white leading-snug break-words [overflow-wrap:anywhere]">{title}</p>
        {card.service?.name && title !== card.service.name && (
          <p className="text-[11px] text-slate-500 mt-0.5">{card.service.name}</p>
        )}
      </button>

      {/* Price range + first 2-3 price-list positions */}
      <div className="mt-2.5">
        <p className="text-sm font-semibold text-primary-300">{priceLabel}</p>
        {priceItems.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {priceItems.slice(0, 3).map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-400 truncate min-w-0">{it.name}</span>
                <span className="text-slate-300 flex-shrink-0">{it.price ? `${it.price} ₽` : '—'}</span>
              </div>
            ))}
            {priceItems.length > 3 && (
              <p className="text-[11px] text-slate-600">ещё {priceItems.length - 3} поз.</p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isOwn && (
        <div className="flex gap-2 mt-3.5">
          <button
            onClick={() => ensureAuth(() => onMessage(user.id))}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium rounded-xl transition-colors"
          >
            <MessageCircle size={14} /> Написать
          </button>
          {DEALS_ENABLED && (
            <button
              onClick={() => ensureAuth(() => onDeal(card))}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-colors"
            >
              <HandshakeIcon size={14} /> Оформить сделку
            </button>
          )}
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
  // Auth gate for guest "Написать" / "Оформить сделку" (default modal text).
  const { ensureAuth, authGateModal } = useAuthGate();

  const [activeTab, setActiveTab] = useState<CatalogTab>('services');
  const [dealCard, setDealCard] = useState<any>(null);

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

  // Draft values edited inside the filters modal (committed on "Применить").
  const [tempLocation, setTempLocation] = useState<string[]>([]);
  const [tempPriceMin, setTempPriceMin] = useState<string>('');
  const [tempPriceMax, setTempPriceMax] = useState<string>('');
  const [cityQuery, setCityQuery] = useState('');
  const [debouncedCityQuery, setDebouncedCityQuery] = useState('');

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
  // Sort: 'date' (default, newest first) | 'alpha' (name A→Z).
  const [artistSort, setArtistSort] = useState<'date' | 'alpha'>('date');
  const [artistSortOpen, setArtistSortOpen] = useState(false);
  // Advanced filter (genre multiselect) modal.
  const [artistFilterOpen, setArtistFilterOpen] = useState(false);
  const [tempArtistGenres, setTempArtistGenres] = useState<string[]>([]);

  const ARTIST_SORT_OPTIONS: { value: 'date' | 'alpha'; label: string }[] = [
    { value: 'date', label: 'По дате добавления' },
    { value: 'alpha', label: 'По алфавиту' },
  ];

  // ── People tab state ───────────────────────────────────────────────────────
  const [peopleQuery, setPeopleQuery] = useState('');
  const [debouncedPeopleQuery, setDebouncedPeopleQuery] = useState('');

  // Applied filters (committed): location names, profession ids, occupancy values.
  const [peopleLocation, setPeopleLocation] = useState<string[]>([]);
  const [peopleProfession, setPeopleProfession] = useState<string[]>([]);
  const [peopleOccupancy, setPeopleOccupancy] = useState<string[]>([]);
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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCityQuery(cityQuery), 250);
    return () => clearTimeout(t);
  }, [cityQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPeopleLocSearch(peopleLocSearch), 250);
    return () => clearTimeout(t);
  }, [peopleLocSearch]);

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
    queryKey: ['catalog-artists', debouncedArtistQuery, artistTypeFilter, artistGenreFilter, artistSort],
    queryFn: async () => {
      const { data } = await referenceAPI.getArtists({
        search: debouncedArtistQuery || undefined,
        type: artistTypeFilter || undefined,
        genre: artistGenreFilter.length ? artistGenreFilter.join(',') : undefined,
        sort: artistSort,
      });
      return data as any[];
    },
    enabled: activeTab === 'artists',
  });

  // ── People ────────────────────────────────────────────────────────────────
  const { data: peopleUsers, isLoading: peopleLoading } = useQuery({
    queryKey: ['catalog-people', debouncedPeopleQuery, peopleLocation, peopleProfession, peopleOccupancy, peopleSort, peopleAlphaDir],
    queryFn: async () => {
      const { data } = await userAPI.catalog({
        query: debouncedPeopleQuery || undefined,
        location: peopleLocation.length ? peopleLocation.join(',') : undefined,
        profession: peopleProfession.length ? peopleProfession.join(',') : undefined,
        occupancy: peopleOccupancy.length ? peopleOccupancy.join(',') : undefined,
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

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950">

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

          {/* Sort + filters controls (services tab) */}
          {activeTab === 'services' && (() => {
            const activeFilterCount =
              profFilterValues.length + locationFilter.length + (priceMin !== '' || priceMax !== '' ? 1 : 0);
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
            {/* ── Browse: Sections → Services ── */}
            <div className="mt-4 mb-6">
              {/* Section grid (no section opened yet) */}
              {!selectedSection && (
                  sectionsLoading ? (
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="h-10 w-28 bg-slate-800/50 rounded-xl animate-pulse" />
                      ))}
                    </div>
                  ) : (sections ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(sections ?? []).map((section: any, i: number) => (
                        <button
                          key={section.id}
                          onClick={() => handleSectionClick(section)}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 shadow-md transition-all hover:scale-[1.03] active:scale-[0.97] bg-gradient-to-br ${TILE_GRADIENTS[i % TILE_GRADIENTS.length]}`}
                        >
                          <span className="text-white font-semibold text-xs whitespace-nowrap">{section.name}</span>
                          <ChevronRight size={13} className="text-white/70 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">Разделы не найдены</p>
                  )
                )}

                {/* Services of the opened section — tiles (fixed height, width by text) */}
                {selectedSection && (
                  sectionServices.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {sectionServices.map((svc: any, i: number) => {
                        const isActive = selectedService?.id === svc.id;
                        return (
                          <button
                            key={svc.id}
                            onClick={() => handleServiceClick(svc)}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 shadow-md transition-all hover:scale-[1.03] active:scale-[0.97] bg-gradient-to-br ${TILE_GRADIENTS[i % TILE_GRADIENTS.length]} ${isActive ? 'ring-2 ring-white/80' : ''}`}
                          >
                            <span className="text-white font-semibold text-xs whitespace-nowrap">{svc.name}</span>
                            {isActive
                              ? <X size={13} className="text-white flex-shrink-0" />
                              : <ChevronRight size={13} className="text-white/70 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">В этом разделе нет услуг</p>
                  )
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
                      currentUserId={currentUser?.id}
                      onNavigate={handleNavigateToServiceCard}
                      onMessage={(uid) => navigate(`/messages/${uid}`)}
                      onDeal={(c) => setDealCard(c)}
                      ensureAuth={ensureAuth}
                    />
                  ))}
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
            {/* Artist type filter */}
            <div className="mt-4 mb-4">
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {ARTIST_TYPES.map(type => {
                  const Icon = type.icon;
                  const isActive = type.value === 'ALL'
                    ? artistTypeFilter === ''
                    : artistTypeFilter === type.value;
                  return (
                    <button
                      key={type.value}
                      onClick={() => selectType(type.value)}
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

            {/* Sort + advanced filter controls */}
            <div className="flex items-center gap-2 mb-4">
              {/* Sort */}
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

              {/* Advanced filter (full genre multiselect) */}
              <button
                type="button"
                onClick={() => { setTempArtistGenres(artistGenreFilter); setArtistFilterOpen(true); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
              >
                <SlidersHorizontal size={14} />
                Фильтр
                {artistGenreFilter.length > 0 && (
                  <span className="bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                    {artistGenreFilter.length}
                  </span>
                )}
              </button>
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
                  <div className="flex flex-wrap gap-2" style={{ maxHeight: showAllGenres ? undefined : '4.5rem', overflow: showAllGenres ? undefined : 'hidden', maskImage: showAllGenres ? undefined : 'linear-gradient(to bottom, #000 68%, transparent)', WebkitMaskImage: showAllGenres ? undefined : 'linear-gradient(to bottom, #000 68%, transparent)' }}>
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
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {artistSort === 'alpha' ? 'Все артисты · от А до Я' : 'Все артисты · сначала новые'}
                </p>
                {artistsLoading && <Loader2 size={12} className="text-primary-400 animate-spin" />}
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
                  <p className="text-slate-400 text-sm">Такой артист не найден</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ PEOPLE TAB ══ */}
        {activeTab === 'people' && (
          <div className="mt-4">
            {/* Filters control */}
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setTempPeopleLocation(peopleLocation);
                  setTempPeopleProfession(peopleProfession);
                  setTempPeopleOccupancy(peopleOccupancy);
                  setPeopleLocSearch('');
                  setPeopleProfSearch('');
                  setPeopleFilterOpen(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
              >
                <SlidersHorizontal size={14} />
                Фильтры
                {(() => {
                  const n = peopleLocation.length + peopleProfession.length + peopleOccupancy.length;
                  return n > 0 ? (
                    <span className="bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">{n}</span>
                  ) : null;
                })()}
              </button>
            </div>

            {/* "Все участники" + sort (no participant count) */}
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Все участники</p>
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
              {peopleLoading && <Loader2 size={12} className="text-primary-400 animate-spin" />}
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
                <p className="text-slate-400 text-sm">Такой пользователь не найден</p>
              </div>
            )}
          </div>
        )}

      </div>

      {dealCard && dealCard.user && (
        <DealCreateModal
          executorId={dealCard.user.id}
          executorName={`${dealCard.user.firstName ?? ''} ${dealCard.user.lastName ?? ''}`.trim()}
          serviceId={dealCard.service?.id}
          userServiceId={dealCard.id}
          serviceName={(dealCard.name && String(dealCard.name).trim()) || dealCard.service?.name}
          onClose={() => setDealCard(null)}
        />
      )}

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
                  const n = tempFilters.length + tempLocation.length + (tempPriceMin !== '' || tempPriceMax !== '' ? 1 : 0);
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

              {/* Service-specific attribute filters (only when a service is selected) */}
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
                  setProfFilterValues([]); setLocationFilter([]); setPriceMin(''); setPriceMax('');
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
                <h3 className="text-base font-semibold text-white">Жанры</h3>
                {tempArtistGenres.length > 0 && (
                  <span className="bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">{tempArtistGenres.length}</span>
                )}
              </div>
              <button onClick={() => setArtistFilterOpen(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 overflow-y-auto">
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

            <div className="px-5 pb-5 pt-4 border-t border-slate-800 flex gap-2.5 flex-shrink-0">
              <button
                onClick={() => { setTempArtistGenres([]); setArtistGenreFilter([]); setArtistFilterOpen(false); }}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
              >
                Сбросить
              </button>
              <button
                onClick={() => { setArtistGenreFilter(tempArtistGenres); setArtistFilterOpen(false); }}
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
                  const n = tempPeopleLocation.length + tempPeopleProfession.length + tempPeopleOccupancy.length;
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
            </div>

            <div className="px-5 pb-5 pt-4 border-t border-slate-800 flex gap-2.5 flex-shrink-0">
              <button
                onClick={() => {
                  setTempPeopleLocation([]); setTempPeopleProfession([]); setTempPeopleOccupancy([]);
                  setPeopleLocSearch(''); setPeopleProfSearch('');
                  setPeopleLocation([]); setPeopleProfession([]); setPeopleOccupancy([]);
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

      {/* Guest auth-gate for "Написать" / "Оформить сделку" */}
      {authGateModal}
    </div>
  );
}
