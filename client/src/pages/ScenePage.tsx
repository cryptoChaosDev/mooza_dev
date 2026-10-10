import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  Ticket, MapPin, ChevronRight, Loader2, RefreshCw, Search, BadgeCheck, CalendarDays, Music2, Clock,
  SlidersHorizontal, ArrowUpDown, X,
} from 'lucide-react';
import HorizontalScroller from '../components/HorizontalScroller';
import AvatarComponent from '../components/Avatar';
import BottomSheet from '../components/BottomSheet';
import { referenceAPI } from '../lib/api';
import { lineupAPI } from '../lib/lineups';
import { getApiError } from '../lib/apiError';
import { useAuthStore } from '../stores/authStore';
import { useSeo, seoTitle, ROBOTS_INDEX, ROBOTS_NOINDEX_FOLLOW } from '../lib/seo';
import { plural } from '../lib/plural';
import { artistHref } from '../lib/artistUtils';
import { reachGoal } from '../lib/metrika';
import {
  sceneAPI, SCENE_PERIODS, SCENE_PRICES, SCENE_SORTS, SCENE_TYPES, SOURCE_LABEL, concertDate, concertDayKey, concertTime,
  dayHeading, priceLabel,
  type SceneCity, type SceneConcert, type ScenePeriod, type SceneSort, type SceneSuggestions,
} from '../lib/scene';

const PERIOD_IDS = SCENE_PERIODS.map(([id]) => id);
const LAST_CITY_KEY = 'mooza_scene_city';
/** Явный выбор «Все города» — не перебрасывать на город профиля / последний. */
const ALL_CITIES = 'all';
const cityKey = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

/**
 * /scene и /scene/:city — «Сцена»: концерты и живая музыка по городам.
 * Афиша — концерты артистов Moooza (Яндекс Музыка, добавленные вручную) и Qtickets.
 * Город по умолчанию — из профиля (если там есть концерты) или последний выбранный.
 */
export default function ScenePage() {
  const { city: citySlug } = useParams<{ city?: string }>();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const rawPeriod = sp.get('period') as ScenePeriod | null;
  const period: ScenePeriod = rawPeriod && PERIOD_IDS.includes(rawPeriod) ? rawPeriod : 'all';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Фильтры и сортировка — в адресе (ссылкой можно поделиться).
  const fq = sp.get('q')?.trim() || '';
  const fTypes = (sp.get('type') ?? '').split(',').filter((t) => (SCENE_TYPES as readonly string[]).includes(t));
  const fPrice = Number(sp.get('price')) || 0;
  const fMoooza = sp.get('moooza') === '1';
  const rawSort = sp.get('sort') as SceneSort | null;
  const sort: SceneSort = rawSort && SCENE_SORTS.some(([id]) => id === rawSort) ? rawSort : 'date';
  const activeFilters = (fTypes.length ? 1 : 0) + (fPrice ? 1 : 0) + (fMoooza ? 1 : 0);
  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setSp(next, { replace: true });
  };

  const citiesQ = useQuery({ queryKey: ['scene', 'cities'], queryFn: sceneAPI.cities, staleTime: 5 * 60_000 });
  const cities = citiesQ.data ?? [];

  // Без города в адресе — последний выбранный город (или город профиля), если там есть
  // концерты. Явный выбор «Все города» (кнопка или запомненный) — оставляем всю страну.
  useEffect(() => {
    if (citySlug || !citiesQ.data) return;
    if ((location.state as { allCities?: boolean } | null)?.allCities) return;
    let remembered: string | null = null;
    try { remembered = localStorage.getItem(LAST_CITY_KEY); } catch { /* приватный режим */ }
    if (remembered === ALL_CITIES) return;
    const profile = user?.city ? citiesQ.data.find((c) => cityKey(c.name) === cityKey(user.city!)) : undefined;
    const target = citiesQ.data.find((c) => c.slug === remembered) ?? profile;
    if (target) navigate(`/scene/${target.slug}${sp.toString() ? `?${sp}` : ''}`, { replace: true });
  }, [citySlug, citiesQ.data, user?.city]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!citySlug) return;
    try { localStorage.setItem(LAST_CITY_KEY, citySlug); } catch { /* приватный режим */ }
  }, [citySlug]);

  const concertsQ = useInfiniteQuery({
    queryKey: ['scene', 'concerts', citySlug ?? '', period, fq, fTypes.join(','), fPrice, fMoooza, sort],
    queryFn: ({ pageParam }) => sceneAPI.concerts({
      city: citySlug, period, page: pageParam, limit: 20,
      q: fq || undefined, type: fTypes.join(',') || undefined, priceMax: fPrice || undefined,
      moooza: fMoooza ? '1' : undefined, sort: sort !== 'date' ? sort : undefined,
    }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    retry: (count, e: any) => e?.response?.status !== 404 && count < 1,
  });
  const first = concertsQ.data?.pages[0];
  const items = useMemo(() => concertsQ.data?.pages.flatMap((p) => p.items) ?? [], [concertsQ.data]);
  const notFound = (concertsQ.error as any)?.response?.status === 404;
  const cityName = first?.city?.name ?? cities.find((c) => c.slug === citySlug)?.name ?? null;

  useSeo({
    title: seoTitle(cityName ? `Концерты — ${cityName}` : 'Сцена', cityName ? 'афиша Сцены' : 'концерты по городам'),
    description: cityName
      ? `Концерты и живая музыка — ${cityName}: даты, площадки и билеты на Сцене Moooza.`
      : 'Сцена Moooza: концерты и живая музыка по городам России — кто играет сегодня, на выходных и в этом месяце.',
    canonical: citySlug ? `/scene/${citySlug}` : '/scene',
    robots: period === 'all' && !activeFilters && !fq && sort === 'date' ? ROBOTS_INDEX : ROBOTS_NOINDEX_FOLLOW,
  });

  const setPeriod = (p: ScenePeriod) => {
    const next = new URLSearchParams(sp);
    if (p === 'all') next.delete('period'); else next.set('period', p);
    setSp(next, { replace: true });
  };
  const goCity = (slug: string | null) => {
    setPickerOpen(false);
    if (!slug) {
      try { localStorage.setItem(LAST_CITY_KEY, ALL_CITIES); } catch { /* приватный режим */ }
    }
    // Период, фильтры и сортировка сохраняются при смене города.
    const qs = sp.toString();
    navigate(`${slug ? `/scene/${slug}` : '/scene'}${qs ? `?${qs}` : ''}`, { state: slug ? null : { allCities: true } });
  };

  // Лента по дням (местное время города концерта).
  const days = useMemo(() => {
    const out: Array<{ key: string; items: SceneConcert[] }> = [];
    for (const c of items) {
      const key = concertDayKey(c);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(c); else out.push({ key, items: [c] });
    }
    return out;
  }, [items]);

  const topCities = cities.slice(0, 20);
  const currentInTop = !citySlug || topCities.some((c) => c.slug === citySlug);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 pb-28">
      <div className="max-w-2xl mx-auto">
        {/* Шапка: при прокрутке закреплены только заголовок и поиск */}
        <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
            <Ticket size={20} className="text-primary-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-white leading-tight truncate">
                Сцена{cityName ? <span className="text-slate-400 font-semibold"> · {cityName}</span> : null}
              </h1>
              <p className="text-[11px] text-slate-500 leading-tight truncate">Концерты и живая музыка по городам</p>
            </div>
          </div>
          <div className="px-4 pb-3">
            <SceneSearch
              key={citySlug ?? 'all'}
              value={fq}
              citySlug={citySlug}
              onSearch={(text) => setParams({ q: text.trim() || null })}
              onPickCity={(slug) => goCity(slug)}
            />
          </div>
        </div>
        <div className="pt-3 border-b border-slate-800/60">
          {/* Города: лента листается свайпом, колесом, мышью и стрелками */}
          <HorizontalScroller className="mx-4 mb-2">
            <CityChip active={false} onClick={() => setPickerOpen(true)}>
              <Search size={14} /> <span className="sr-only sm:not-sr-only">Найти город</span>
            </CityChip>
            <CityChip active={!citySlug} onClick={() => goCity(null)}>Все города</CityChip>
            {!currentInTop && cityName && citySlug && (
              <CityChip active onClick={() => goCity(citySlug)}>{cityName}</CityChip>
            )}
            {topCities.map((c) => (
              <CityChip key={c.slug} active={c.slug === citySlug} onClick={() => goCity(c.slug)}>
                {c.name} <span className="opacity-60 tabular-nums">{c.upcoming}</span>
              </CityChip>
            ))}
            {cities.length > topCities.length && (
              <CityChip active={false} onClick={() => setPickerOpen(true)}>
                Ещё {cities.length - topCities.length} {plural(cities.length - topCities.length, 'город', 'города', 'городов')}
              </CityChip>
            )}
          </HorizontalScroller>
          {/* Периоды — своим рядом (на телефоне не сжимаются кнопками) */}
          <HorizontalScroller className="mx-4 mb-2">
            {SCENE_PERIODS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPeriod(id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  period === id ? 'bg-primary-500/15 text-primary-300 border border-primary-500/30' : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </HorizontalScroller>
          {/* Фильтры, сортировка и активные фильтры (чипы с крестиком) */}
          <div className="px-4 pb-2.5 flex items-center gap-2">
            <button
              onClick={() => setFiltersOpen(true)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl text-sm font-medium border transition-colors ${
                activeFilters ? 'bg-primary-500/15 text-primary-300 border-primary-500/30' : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:text-white'
              }`}
            >
              <SlidersHorizontal size={15} />
              Фильтры
              {activeFilters > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 bg-primary-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{activeFilters}</span>
              )}
            </button>
            <label className="relative flex-shrink-0 inline-flex items-center min-h-[36px] rounded-xl bg-slate-900/60 border border-slate-800 text-sm text-slate-300 hover:text-white">
              <ArrowUpDown size={14} className="absolute left-2.5 pointer-events-none" />
              <span className="sr-only">Сортировка</span>
              <select
                value={sort}
                onChange={(e) => setParams({ sort: e.target.value === 'date' ? null : e.target.value })}
                className="appearance-none bg-transparent pl-8 pr-3 py-1.5 rounded-xl text-sm focus:outline-none cursor-pointer"
              >
                {SCENE_SORTS.map(([id, label]) => <option key={id} value={id} className="bg-slate-900">{label}</option>)}
              </select>
            </label>
            {activeFilters > 0 && (
              <HorizontalScroller className="flex-1 min-w-0">
                {fTypes.length > 0 && <FilterChip onClear={() => setParams({ type: null })}>{fTypes.join(', ')}</FilterChip>}
                {fPrice > 0 && <FilterChip onClear={() => setParams({ price: null })}>{SCENE_PRICES.find(([v]) => v === fPrice)?.[1] ?? `до ${fPrice} ₽`}</FilterChip>}
                {fMoooza && <FilterChip onClear={() => setParams({ moooza: null })}>Артисты Moooza</FilterChip>}
              </HorizontalScroller>
            )}
          </div>
        </div>

        <div className="px-4 pt-4 space-y-4">
          {cityName && <CityExtras cityName={cityName} />}

          {notFound ? (
            <EmptyState title="Город не найден" text="Выберите город из списка выше." />
          ) : concertsQ.isError && items.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center">
              <p className="text-white font-semibold mb-1">Не удалось загрузить афишу</p>
              <p className="text-slate-500 text-sm mb-4">{getApiError(concertsQ.error, 'Проверьте подключение к сети')}</p>
              <button onClick={() => concertsQ.refetch()} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium">
                <RefreshCw size={15} /> Повторить
              </button>
            </div>
          ) : concertsQ.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-slate-900/60 border border-slate-800/60 rounded-2xl animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title={activeFilters ? 'Ничего не нашлось' : period === 'all' ? 'Пока нет концертов' : 'В эти дни концертов нет'}
              text={activeFilters
                ? 'Попробуйте ослабить фильтры или выбрать другие даты.'
                : period === 'all'
                  ? 'Афиша обновляется каждую ночь. Артисты Moooza могут добавить свои концерты на странице артиста.'
                  : 'Посмотрите другие даты — например, «Скоро».'}
            />
          ) : (
            <>
              {first?.fuzzy && fq && (
                <p className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                  Точных совпадений по «{fq}» нет — показаны похожие.
                </p>
              )}
              {first && (
                <p className="text-xs text-slate-500">
                  {first.total} {plural(first.total, 'концерт', 'концерта', 'концертов')}
                </p>
              )}
              {sort === 'date' ? days.map((d) => (
                <Fragment key={d.key}>
                  <h2 className="pt-1 text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-primary-400" /> {dayHeading(d.key)}
                  </h2>
                  <div className="space-y-2">
                    {d.items.map((c) => <ConcertCard key={c.id} c={c} showCity={!citySlug} />)}
                  </div>
                </Fragment>
              )) : (
                // Сортировка по цене / новизне — дни перемешаны: без заголовков, дата в карточке.
                <div className="space-y-2">
                  {items.map((c) => <ConcertCard key={c.id} c={c} showCity={!citySlug} showDate />)}
                </div>
              )}
              {concertsQ.hasNextPage && (
                <button
                  onClick={() => concertsQ.fetchNextPage()}
                  disabled={concertsQ.isFetchingNextPage}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-slate-900/60 border border-slate-800/60 text-sm text-slate-300 hover:text-white disabled:opacity-60"
                >
                  {concertsQ.isFetchingNextPage ? <Loader2 size={15} className="animate-spin" /> : null} Показать ещё
                </button>
              )}
            </>
          )}

          <p className="pt-2 text-[11px] text-slate-600 leading-relaxed">
            Афиша: Qtickets, Яндекс Афиша и артисты Moooza. Время — местное для города концерта.
          </p>
        </div>
      </div>

      <BottomSheet isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Город" height="full">
        <CityList cities={cities} current={citySlug} onPick={goCity} />
      </BottomSheet>
      <BottomSheet isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры" height="auto">
        <FiltersForm
          initial={{ types: fTypes, price: fPrice, moooza: fMoooza }}
          onApply={(f) => {
            setParams({
              type: f.types.length ? f.types.join(',') : null,
              price: f.price ? String(f.price) : null,
              moooza: f.moooza ? '1' : null,
            });
            setFiltersOpen(false);
          }}
        />
      </BottomSheet>
    </div>
  );
}

function CityChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl text-sm font-medium border transition-colors ${
        active ? 'bg-white text-slate-950 border-white' : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Поиск «Сцены» по мере набора: лента обновляется через 0,3 с после ввода, под полем —
 * подсказки (события, артисты, площадки, города). Регистр, «ё», раскладка, транслит и
 * опечатки сервер прощает (GET /api/scene/suggest).
 */
function SceneSearch({ value, citySlug, onSearch, onPickCity }: {
  value: string;
  citySlug?: string;
  onSearch: (text: string) => void;
  onPickCity: (slug: string) => void;
}) {
  const navigate = useNavigate();
  const [text, setText] = useState(value);
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Ввод → через 300 мс: подсказки и лента.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 300);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    if (debounced.trim() !== value) onSearch(debounced);
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Клик мимо — закрыть подсказки.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = debounced.trim();
  const sugQ = useQuery({
    queryKey: ['scene', 'suggest', q, citySlug ?? ''],
    queryFn: () => sceneAPI.suggest(q, citySlug),
    enabled: open && q.length >= 2,
    staleTime: 30_000,
  });
  const s: SceneSuggestions | undefined = sugQ.data;
  const hasAny = !!s && (s.events.length + s.artists.length + s.venues.length + s.cities.length) > 0;

  const pick = (fn: () => void) => { setOpen(false); fn(); };
  const searchFor = (t: string) => pick(() => { setText(t); setDebounced(t); onSearch(t); });

  return (
    <div ref={boxRef} className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      <input
        type="search"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter') { e.preventDefault(); searchFor(text.trim()); }
        }}
        maxLength={100}
        placeholder="Артист, событие, площадка или город"
        enterKeyHint="search"
        className="w-full pl-9 pr-9 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          onClick={() => searchFor('')}
          aria-label="Очистить поиск"
          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-white"
        >
          <X size={15} />
        </button>
      )}
      {open && q.length >= 2 && (hasAny || sugQ.isFetching) && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-[60vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl py-1.5">
          {!hasAny && sugQ.isFetching && (
            <p className="px-4 py-3 text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Ищем…</p>
          )}
          {s?.fuzzy && <p className="px-4 pt-1.5 pb-1 text-[11px] text-amber-300/90">Похожие варианты</p>}
          {s && s.cities.length > 0 && (
            <SuggestGroup title="Города">
              {s.cities.map((c) => (
                <SuggestRow key={c.slug} onClick={() => pick(() => { setText(''); onPickCity(c.slug); })} icon={<MapPin size={15} />}
                  title={c.name} sub={`${c.upcoming} ${plural(c.upcoming, 'концерт', 'концерта', 'концертов')}`} />
              ))}
            </SuggestGroup>
          )}
          {s && s.artists.length > 0 && (
            <SuggestGroup title="Артисты Moooza">
              {s.artists.map((a) => (
                <SuggestRow key={a.id} onClick={() => searchFor(a.name)}
                  icon={<AvatarComponent src={a.avatar} name={a.name} size={28} />} title={a.name} sub="Концерты артиста" />
              ))}
            </SuggestGroup>
          )}
          {s && s.events.length > 0 && (
            <SuggestGroup title="События">
              {s.events.map((e) => {
                const t = concertTime(e);
                return (
                  <SuggestRow key={e.id} onClick={() => pick(() => navigate(`/concerts/${e.id}`))}
                    icon={e.imageUrl ? <img src={e.imageUrl} alt="" className="w-7 h-7 rounded-lg object-cover" /> : <Music2 size={15} />}
                    title={e.title} sub={[`${concertDate(e)}${t ? `, ${t}` : ''}`, e.venue, e.cityName].filter(Boolean).join(' · ')} />
                );
              })}
            </SuggestGroup>
          )}
          {s && s.venues.length > 0 && (
            <SuggestGroup title="Площадки">
              {s.venues.map((v) => (
                <SuggestRow key={`${v.name}|${v.cityName}`} onClick={() => searchFor(v.name)} icon={<MapPin size={15} />}
                  title={v.name} sub={`${v.cityName} · ${v.count} ${plural(v.count, 'событие', 'события', 'событий')}`} />
              ))}
            </SuggestGroup>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-4 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function SuggestRow({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-800/70 active:bg-slate-800">
      <span className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 overflow-hidden">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-white truncate">{title}</span>
        {sub && <span className="block text-[11px] text-slate-500 truncate">{sub}</span>}
      </span>
    </button>
  );
}

function FilterChip({ onClear, children }: { onClear: () => void; children: React.ReactNode }) {
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-1 min-h-[32px] pl-3 pr-1 rounded-xl bg-primary-500/10 border border-primary-500/25 text-xs text-primary-200">
      {children}
      <button onClick={onClear} aria-label="Убрать фильтр" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-primary-500/20">
        <X size={13} />
      </button>
    </span>
  );
}

interface FiltersValue { types: string[]; price: number; moooza: boolean }

function FiltersForm({ initial, onApply }: { initial: FiltersValue; onApply: (f: FiltersValue) => void }) {
  const [f, setF] = useState<FiltersValue>(initial);
  const pill = (active: boolean) =>
    `min-h-[40px] px-3.5 rounded-xl text-sm font-medium border transition-colors ${
      active ? 'bg-primary-500/15 text-primary-300 border-primary-500/40' : 'bg-slate-800/60 text-slate-300 border-slate-700/50 hover:text-white'
    }`;
  return (
    <form className="p-4 space-y-4" onSubmit={(e) => { e.preventDefault(); onApply(f); }}>
      <div>
        <p className="text-xs text-slate-500 mb-1.5">Что</p>
        <div className="flex flex-wrap gap-2">
          {SCENE_TYPES.map((t) => {
            const on = f.types.includes(t);
            return (
              <button key={t} type="button" onClick={() => setF({ ...f, types: on ? f.types.filter((x) => x !== t) : [...f.types, t] })} className={pill(on)}>
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-xs text-slate-500 mb-1.5">Цена билета</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setF({ ...f, price: 0 })} className={pill(!f.price)}>Любая</button>
          {SCENE_PRICES.map(([v, label]) => (
            <button key={v} type="button" onClick={() => setF({ ...f, price: v })} className={pill(f.price === v)}>{label}</button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-3 min-h-[44px] px-3 rounded-xl bg-slate-800/40 border border-slate-700/50 cursor-pointer">
        <span className="text-sm text-slate-200">Только артисты Moooza</span>
        <input type="checkbox" checked={f.moooza} onChange={(e) => setF({ ...f, moooza: e.target.checked })} className="w-5 h-5 accent-primary-500" />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => onApply({ types: [], price: 0, moooza: false })} className="flex-1 min-h-[48px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold">
          Сбросить
        </button>
        <button type="submit" className="flex-[2] min-h-[48px] rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold">
          Показать
        </button>
      </div>
    </form>
  );
}

function CityList({ cities, current, onPick }: { cities: SceneCity[]; current?: string; onPick: (slug: string) => void }) {
  const [q, setQ] = useState('');
  const shown = cities.filter((c) => cityKey(c.name).includes(cityKey(q)));
  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти город"
          className="w-full pl-9 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <ul className="divide-y divide-slate-800/60">
        {shown.map((c) => (
          <li key={c.slug}>
            <button
              onClick={() => onPick(c.slug)}
              className={`w-full min-h-[48px] flex items-center justify-between text-left text-[15px] ${c.slug === current ? 'text-primary-300' : 'text-white'}`}
            >
              {c.name}
              <span className="text-xs text-slate-500 tabular-nums">{c.upcoming} {plural(c.upcoming, 'концерт', 'концерта', 'концертов')}</span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="py-6 text-center text-sm text-slate-500">Ничего не нашлось</li>}
      </ul>
    </div>
  );
}

function ConcertCard({ c, showCity, showDate = false }: { c: SceneConcert; showCity: boolean; showDate?: boolean }) {
  const time = [showDate ? concertDate(c, { day: 'numeric', month: 'short' }) : null, concertTime(c)].filter(Boolean).join(', ') || null;
  const price = priceLabel(c.priceFrom);
  const where = [c.venue, showCity ? c.cityName : null].filter(Boolean).join(' · ');
  return (
    <article className="flex gap-3 p-3 bg-slate-900/60 border border-slate-800/60 rounded-2xl">
      <Link to={`/concerts/${c.id}`} aria-hidden tabIndex={-1} className="w-[72px] h-[72px] flex-shrink-0 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center">
        {c.imageUrl ? (
          <img src={c.imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : c.artist?.avatar ? (
          <AvatarComponent src={c.artist.avatar} name={c.artist.name} size={72} className="!rounded-none" />
        ) : (
          <Music2 size={24} className="text-slate-600" />
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-semibold text-white leading-snug line-clamp-2">
          <Link to={`/concerts/${c.id}`} className="hover:text-primary-200">{c.title}</Link>
        </h3>
        {c.artist && (
          <Link to={artistHref(c.artist)} className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary-300 hover:text-primary-200">
            {c.artist.verified && <BadgeCheck size={12} />} {c.artist.name} на Moooza <ChevronRight size={12} />
          </Link>
        )}
        <p className="mt-1 text-xs text-slate-400 flex items-center gap-1 min-w-0">
          {time && <><Clock size={11} className="flex-shrink-0" /> <span className="tabular-nums whitespace-nowrap">{time}</span></>}
          {where && <><MapPin size={11} className="flex-shrink-0 ml-1" /> <span className="truncate">{where}</span></>}
        </p>
        <div className="mt-2 flex items-center gap-2">
          {c.ticketUrl && (
            <a
              href={c.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => reachGoal('scene_ticket_click', { source: c.source })}
              className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-sm font-semibold inline-flex items-center gap-1.5 transition-all"
            >
              <Ticket size={14} /> Билеты
            </a>
          )}
          {price && <span className="text-xs text-slate-300 whitespace-nowrap">{price}</span>}
          <Link to={`/concerts/${c.id}`} className="h-9 px-2.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 inline-flex items-center">
            Подробнее
          </Link>
          <span className="ml-auto hidden sm:inline text-[10px] text-slate-600">{SOURCE_LABEL[c.source]}</span>
        </div>
      </div>
    </article>
  );
}

/** Город: лайнапы («ищут артистов») и местные артисты — чтобы страница жила и без концертов. */
function CityExtras({ cityName }: { cityName: string }) {
  const lineupsQ = useQuery({
    queryKey: ['scene', 'lineups', cityName],
    queryFn: () => lineupAPI.list({ city: cityName, sort: 'date', limit: 3 }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const artistsQ = useQuery({
    queryKey: ['scene', 'local-artists', cityName],
    queryFn: () => referenceAPI.getArtists({ city: cityName, sort: 'listeners' }).then((r) => (r.data as any[]).slice(0, 10)),
    staleTime: 5 * 60_000,
  });
  const lineups = lineupsQ.data?.items ?? [];
  const artists = artistsQ.data ?? [];
  if (!lineups.length && !artists.length) return null;
  return (
    <div className="space-y-3">
      {lineups.length > 0 && (
        <Link
          to="/lineups"
          className="flex items-center gap-3 p-3 rounded-2xl bg-primary-500/10 border border-primary-500/25 hover:border-primary-500/40 transition-colors"
        >
          <CalendarDays size={18} className="text-primary-300 flex-shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-white">Ищут артистов на концерты</span>
            <span className="block text-xs text-slate-400 truncate">{lineups.map((l) => l.title).join(' · ')}</span>
          </span>
          <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
        </Link>
      )}
      {artists.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-300 mb-2">Местная сцена</h2>
          <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
            {artists.map((a: any) => (
              <Link key={a.id} to={artistHref(a)} className="flex-shrink-0 w-[72px] text-center">
                <AvatarComponent src={a.avatar} name={a.name} size={56} className="mx-auto" />
                <span className="mt-1 block text-[11px] text-slate-300 leading-tight line-clamp-2">{a.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center py-14 text-center px-6">
      <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Ticket size={30} className="text-slate-600" /></div>
      <p className="text-white font-semibold mb-1">{title}</p>
      <p className="text-slate-500 text-sm">{text}</p>
    </div>
  );
}
