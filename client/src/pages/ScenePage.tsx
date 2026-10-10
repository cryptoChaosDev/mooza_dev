import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  Ticket, MapPin, ChevronRight, Loader2, RefreshCw, Search, BadgeCheck, CalendarDays, Music2, Clock,
} from 'lucide-react';
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
  sceneAPI, SCENE_PERIODS, SOURCE_LABEL, concertDayKey, concertTime, dayHeading, priceLabel,
  type SceneCity, type SceneConcert, type ScenePeriod,
} from '../lib/scene';

const PERIOD_IDS = SCENE_PERIODS.map(([id]) => id);
const LAST_CITY_KEY = 'mooza_scene_city';
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
  const user = useAuthStore((s) => s.user);
  const rawPeriod = sp.get('period') as ScenePeriod | null;
  const period: ScenePeriod = rawPeriod && PERIOD_IDS.includes(rawPeriod) ? rawPeriod : 'all';
  const [pickerOpen, setPickerOpen] = useState(false);

  const citiesQ = useQuery({ queryKey: ['scene', 'cities'], queryFn: sceneAPI.cities, staleTime: 5 * 60_000 });
  const cities = citiesQ.data ?? [];

  // Без города в адресе — город профиля (или последний выбранный), если там есть концерты.
  useEffect(() => {
    if (citySlug || !citiesQ.data) return;
    let remembered: string | null = null;
    try { remembered = localStorage.getItem(LAST_CITY_KEY); } catch { /* приватный режим */ }
    const profile = user?.city ? citiesQ.data.find((c) => cityKey(c.name) === cityKey(user.city!)) : undefined;
    const target = profile ?? citiesQ.data.find((c) => c.slug === remembered);
    if (target) navigate(`/scene/${target.slug}${sp.toString() ? `?${sp}` : ''}`, { replace: true });
  }, [citySlug, citiesQ.data, user?.city]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!citySlug) return;
    try { localStorage.setItem(LAST_CITY_KEY, citySlug); } catch { /* приватный режим */ }
  }, [citySlug]);

  const concertsQ = useInfiniteQuery({
    queryKey: ['scene', 'concerts', citySlug ?? '', period],
    queryFn: ({ pageParam }) => sceneAPI.concerts({ city: citySlug, period, page: pageParam, limit: 20 }),
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
    robots: period === 'all' ? ROBOTS_INDEX : ROBOTS_NOINDEX_FOLLOW,
  });

  const setPeriod = (p: ScenePeriod) => {
    const next = new URLSearchParams(sp);
    if (p === 'all') next.delete('period'); else next.set('period', p);
    setSp(next, { replace: true });
  };
  const goCity = (slug: string | null) => {
    setPickerOpen(false);
    navigate(`${slug ? `/scene/${slug}` : '/scene'}${period !== 'all' ? `?period=${period}` : ''}`);
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

  const topCities = cities.slice(0, 8);
  const currentInTop = !citySlug || topCities.some((c) => c.slug === citySlug);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 pb-28">
      <div className="max-w-2xl mx-auto">
        {/* Шапка */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
            <Ticket size={20} className="text-primary-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-white leading-tight truncate">
                Сцена{cityName ? <span className="text-slate-400 font-semibold"> · {cityName}</span> : null}
              </h1>
              <p className="text-[11px] text-slate-500 leading-tight truncate">Концерты и живая музыка по городам</p>
            </div>
          </div>
          {/* Города */}
          <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
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
                <Search size={13} /> Другой город
              </CityChip>
            )}
          </div>
          {/* Периоды */}
          <div className="px-4 pb-2.5 flex gap-1 overflow-x-auto scrollbar-none">
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
              title={period === 'all' ? 'Пока нет концертов' : 'В эти дни концертов нет'}
              text={period === 'all'
                ? 'Афиша обновляется каждую ночь. Артисты Moooza могут добавить свои концерты на странице артиста.'
                : 'Посмотрите другие даты — например, «Скоро».'}
            />
          ) : (
            <>
              {first && (
                <p className="text-xs text-slate-500">
                  {first.total} {plural(first.total, 'концерт', 'концерта', 'концертов')}
                </p>
              )}
              {days.map((d) => (
                <Fragment key={d.key}>
                  <h2 className="pt-1 text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-primary-400" /> {dayHeading(d.key)}
                  </h2>
                  <div className="space-y-2">
                    {d.items.map((c) => <ConcertCard key={c.id} c={c} showCity={!citySlug} />)}
                  </div>
                </Fragment>
              ))}
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

function ConcertCard({ c, showCity }: { c: SceneConcert; showCity: boolean }) {
  const time = concertTime(c);
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
          {time && <><Clock size={11} className="flex-shrink-0" /> <span className="tabular-nums">{time}</span></>}
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
          {price && <span className="text-xs text-slate-300">{price}</span>}
          <Link to={`/concerts/${c.id}`} className="h-9 px-2.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 inline-flex items-center">
            Подробнее
          </Link>
          <span className="ml-auto text-[10px] text-slate-600">{SOURCE_LABEL[c.source]}</span>
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
