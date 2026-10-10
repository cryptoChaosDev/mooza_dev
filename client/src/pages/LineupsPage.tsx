import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, Plus, SlidersHorizontal, X, Loader2, Calendar, Inbox, Mic2, ChevronDown, Undo2, RefreshCw,
} from 'lucide-react';
import LineupCard from '../components/LineupCard';
import CityPicker from '../components/CityPicker';
import AvatarComponent from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import { referenceAPI } from '../lib/api';
import { getApiError } from '../lib/apiError';
import { toast } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { useAuthGate } from '../components/AuthGateModal';
import { maskDateInput, parseMaskedDate } from '../lib/mskDate';
import { useSeo, seoTitle, ROBOTS_INDEX, ROBOTS_NOINDEX } from '../lib/seo';
import { plural } from '../lib/plural';
import { artistHref } from '../lib/artistUtils';
import {
  lineupAPI, type Lineup, type LineupPage, type MyLineupResponse, RESPONSE_STATUS_CLASS, RESPONSE_STATUS_LABEL,
  formatEventDateTime, feeLabel, slotTypeLabel,
} from '../lib/lineups';

type Tab = 'feed' | 'mine' | 'responses';

interface Filters { city: string; genre: string; dateFrom: string; dateTo: string; sort: 'new' | 'date' }
const EMPTY_FILTERS: Filters = { city: '', genre: '', dateFrom: '', dateTo: '', sort: 'new' };

const inputCls = 'w-full pl-8 pr-3 py-2.5 bg-slate-800/60 border rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition';

/**
 * /lineups — «Биржа лайнапов»: лента запросов на выступление (фильтры город /
 * жанр / даты), «Мои запросы» и «Мои отклики» (для админов артистов).
 */
export default function LineupsPage() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const isGuest = !useAuthStore((s) => s.token);
  const gate = useAuthGate();
  const rawTab = sp.get('tab');
  const tab: Tab = !isGuest && (rawTab === 'mine' || rawTab === 'responses') ? rawTab : 'feed';
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(sp);
    if (t === 'feed') next.delete('tab'); else next.set('tab', t);
    setSp(next, { replace: true });
  };

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  useSeo({
    title: seoTitle('Лайнапы — биржа выступлений'),
    description: 'Организаторы и клубы ищут артистов на концерты: разогрев, хедлайнеры, гонорар. Админы артистов откликаются от имени артиста.',
    canonical: '/lineups',
    robots: tab === 'feed' ? ROBOTS_INDEX : ROBOTS_NOINDEX,
  });

  const openNew = () => gate.ensure('create', { type: 'lineup' }, () => navigate('/lineups/new'));

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 pb-28">
      <div className="max-w-2xl mx-auto">
        {/* Шапка */}
        <div className="sticky top-app z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 py-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CalendarDays size={20} className="text-primary-400 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white leading-tight">Лайнапы</h1>
                <p className="text-[11px] text-slate-500 leading-tight truncate">Организаторы ищут артистов на концерты</p>
              </div>
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 flex-shrink-0 px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus size={16} /> <span className="hidden sm:inline">Разместить запрос</span><span className="sm:hidden">Запрос</span>
            </button>
          </div>
          {!isGuest && (
            <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
              {([
                ['feed', 'Лента'],
                ['mine', 'Мои запросы'],
                ['responses', 'Мои отклики'],
              ] as Array<[Tab, string]>).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                    tab === id ? 'bg-primary-500/15 text-primary-300 border border-primary-500/30' : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === 'feed' && (
          <FeedTab filters={filters} setFilters={setFilters} showFilters={showFilters} setShowFilters={setShowFilters} onCreate={openNew} />
        )}
        {tab === 'mine' && <MineTab onCreate={openNew} />}
        {tab === 'responses' && <ResponsesTab />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Лента
// ─────────────────────────────────────────────────────────────────────────────

function FeedTab({
  filters, setFilters, showFilters, setShowFilters, onCreate,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  onCreate: () => void;
}) {
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: async () => (await referenceAPI.getGenres()).data as Array<{ id: string; name: string }>,
    staleTime: 10 * 60 * 1000,
  });

  // В запрос уходят только корректные даты (маска допускает промежуточный ввод).
  const params = useMemo(() => ({
    city: filters.city || undefined,
    genre: filters.genre || undefined,
    dateFrom: parseMaskedDate(filters.dateFrom) ? filters.dateFrom : undefined,
    dateTo: parseMaskedDate(filters.dateTo) ? filters.dateTo : undefined,
    sort: filters.sort,
  }), [filters]);

  const activeCount = [params.city, params.genre, params.dateFrom, params.dateTo].filter(Boolean).length;
  const dateFromBad = filters.dateFrom.length === 10 && !parseMaskedDate(filters.dateFrom);
  const dateToBad = filters.dateTo.length === 10 && !parseMaskedDate(filters.dateTo);

  const q = useInfiniteQuery({
    queryKey: ['lineups', 'feed', params],
    queryFn: async ({ pageParam }) => (await lineupAPI.list({ ...params, page: pageParam, limit: 20 })).data as LineupPage,
    initialPageParam: 1,
    getNextPageParam: (last) => (last?.hasMore ? last.page + 1 : undefined),
  });
  const items: Lineup[] = (q.data?.pages ?? []).flatMap((p) => p?.items ?? []);

  return (
    <div className="px-4 pt-3 space-y-3">
      {/* Фильтры */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 transition-colors"
        >
          <SlidersHorizontal size={15} /> Фильтры
          {activeCount > 0 && (
            <span className="ml-0.5 min-w-[18px] h-[18px] px-1 bg-primary-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{activeCount}</span>
          )}
          <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
        <div className="ml-auto flex items-center gap-1 bg-slate-800/60 rounded-xl p-0.5">
          {([['new', 'Новые'], ['date', 'Ближайшие']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilters({ ...filters, sort: id })}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filters.sort === id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Город</label>
            {/* key: CityPicker не сбрасывает ввод при внешней очистке — пересоздаём */}
            <CityPicker key={filters.city ? 'set' : 'empty'} city={filters.city} country="" onChange={(c) => setFilters({ ...filters, city: c })} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Жанр</label>
            <select
              value={filters.genre}
              onChange={(e) => setFilters({ ...filters, genre: e.target.value })}
              className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Все жанры</option>
              {genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([['dateFrom', 'Дата с', dateFromBad], ['dateTo', 'Дата по', dateToBad]] as const).map(([key, label, bad]) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-1">{label}</label>
                <div className="relative">
                  <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="ДД.ММ.ГГГГ"
                    maxLength={10}
                    value={filters[key]}
                    onChange={(e) => setFilters({ ...filters, [key]: maskDateInput(e.target.value) })}
                    className={`${inputCls} ${bad ? 'border-red-500/60' : 'border-slate-700/50'}`}
                  />
                </div>
              </div>
            ))}
          </div>
          {(dateFromBad || dateToBad) && <p className="text-[11px] text-red-400">Введите существующую дату в формате ДД.ММ.ГГГГ</p>}
          {activeCount > 0 && (
            <button onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white">
              <X size={13} /> Сбросить фильтры
            </button>
          )}
        </div>
      )}

      {q.isError && items.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <p className="text-white font-semibold mb-1">Не удалось загрузить запросы</p>
          <p className="text-slate-500 text-sm mb-4">{getApiError(q.error, 'Проверьте подключение к сети')}</p>
          <button onClick={() => q.refetch()} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium">
            <RefreshCw size={15} /> Повторить
          </button>
        </div>
      ) : q.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-slate-900/60 border border-slate-800/60 rounded-2xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center px-6">
          <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><CalendarDays size={30} className="text-slate-600" /></div>
          <p className="text-white font-semibold mb-1">{activeCount ? 'Ничего не нашлось' : 'Пока нет открытых запросов'}</p>
          <p className="text-slate-500 text-sm mb-4">
            {activeCount ? 'Попробуйте изменить фильтры' : 'Ищете артиста на концерт? Разместите запрос — подходящие артисты получат уведомление.'}
          </p>
          <button onClick={onCreate} className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold">
            <Plus size={15} /> Разместить запрос
          </button>
        </div>
      ) : (
        <>
          {items.map((l) => <LineupCard key={l.id} lineup={l} />)}
          {q.hasNextPage && (
            <button
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
              className="w-full py-3 flex items-center justify-center gap-2 text-sm text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 rounded-2xl transition-colors disabled:opacity-50"
            >
              {q.isFetchingNextPage ? <Loader2 size={15} className="animate-spin" /> : null} Показать ещё
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Мои запросы
// ─────────────────────────────────────────────────────────────────────────────

function MineTab({ onCreate }: { onCreate: () => void }) {
  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['lineups', 'mine'],
    queryFn: async () => (await lineupAPI.mine()).data as Lineup[],
  });

  if (isLoading) return <div className="flex justify-center py-14"><Loader2 size={24} className="animate-spin text-primary-400" /></div>;
  if (isError) {
    return (
      <div className="flex flex-col items-center py-14 text-center px-6">
        <p className="text-slate-400 text-sm mb-3">{getApiError(error, 'Не удалось загрузить ваши запросы')}</p>
        <button onClick={() => refetch()} className="text-primary-400 text-sm">Повторить</button>
      </div>
    );
  }
  if (!data.length) {
    return (
      <div className="flex flex-col items-center py-14 text-center px-6">
        <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Inbox size={30} className="text-slate-600" /></div>
        <p className="text-white font-semibold mb-1">Вы ещё не размещали запросов</p>
        <p className="text-slate-500 text-sm mb-4">Опишите событие — артисты откликнутся сами, с релизами и статистикой.</p>
        <button onClick={onCreate} className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold">
          <Plus size={15} /> Разместить запрос
        </button>
      </div>
    );
  }
  return (
    <div className="px-4 pt-3 space-y-3">
      {data.map((l) => <LineupCard key={l.id} lineup={l} showAuthor={false} />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Мои отклики (админ артиста)
// ─────────────────────────────────────────────────────────────────────────────

function ResponsesTab() {
  const qc = useQueryClient();
  const [withdrawId, setWithdrawId] = useState<string | null>(null);

  const artistsQ = useQuery({
    queryKey: ['lineups', 'my-artists'],
    queryFn: async () => (await lineupAPI.myArtists()).data,
  });
  const { data = [], isLoading } = useQuery({
    queryKey: ['lineups', 'my-responses'],
    queryFn: async () => (await lineupAPI.myResponses()).data as MyLineupResponse[],
  });

  const withdrawMut = useMutation({
    mutationFn: (id: string) => lineupAPI.withdraw(id),
    onSuccess: () => {
      toast.success('Отклик отозван');
      qc.invalidateQueries({ queryKey: ['lineups'] });
      qc.invalidateQueries({ queryKey: ['lineup'] });
    },
    onError: (e) => toast.error(getApiError(e, 'Не удалось отозвать отклик')),
  });

  if (isLoading || artistsQ.isLoading) return <div className="flex justify-center py-14"><Loader2 size={24} className="animate-spin text-primary-400" /></div>;

  if (!artistsQ.data?.length) {
    return (
      <div className="flex flex-col items-center py-14 text-center px-6">
        <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Mic2 size={30} className="text-slate-600" /></div>
        <p className="text-white font-semibold mb-1">Откликаются админы артистов</p>
        <p className="text-slate-500 text-sm mb-4">Создайте страницу артиста или попросите владельца сделать вас админом — и откликайтесь на запросы от имени артиста.</p>
        <Link to="/artist/create" className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold">Создать артиста</Link>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex flex-col items-center py-14 text-center px-6">
        <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Inbox size={30} className="text-slate-600" /></div>
        <p className="text-white font-semibold mb-1">Откликов пока нет</p>
        <p className="text-slate-500 text-sm">Выберите запрос в ленте и откликнитесь от имени своего артиста.</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-3 space-y-3">
      {data.map((r) => (
        <div key={r.id} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-2">
          <div className="flex items-start gap-2">
            <Link to={`/lineups/${r.request.id}`} className="flex-1 min-w-0 text-[15px] font-semibold text-white hover:text-primary-300 break-words [overflow-wrap:anywhere]">
              {r.request.title}
            </Link>
            <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-lg border font-medium ${RESPONSE_STATUS_CLASS[r.status]}`}>{RESPONSE_STATUS_LABEL[r.status]}</span>
          </div>
          <p className="text-xs text-slate-400">{formatEventDateTime(r.request.eventDate)} · {r.request.cityName}{r.request.venue ? ` · ${r.request.venue}` : ''}</p>
          <p className="text-xs text-slate-400">{slotTypeLabel(r.request.slotType)} · {feeLabel(r.request.feeType, r.request.feeAmount)} · {r.request.slots} {plural(r.request.slots, 'артист', 'артиста', 'артистов')}</p>
          {r.artist && (
            <Link to={artistHref(r.artist)} className="flex items-center gap-2 w-fit min-w-0 group">
              <AvatarComponent src={r.artist.avatar} name={r.artist.name} size={20} />
              <span className="text-xs text-slate-300 group-hover:text-white truncate">от имени «{r.artist.name}»</span>
            </Link>
          )}
          {r.request.status === 'closed' && <p className="text-[11px] text-slate-500">Запрос закрыт</p>}
          {(r.status === 'pending' || r.status === 'accepted') && (
            <button
              onClick={() => setWithdrawId(r.id)}
              disabled={withdrawMut.isPending}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-300 transition-colors disabled:opacity-50"
            >
              <Undo2 size={13} /> Отозвать отклик
            </button>
          )}
        </div>
      ))}
      <ConfirmDialog
        open={!!withdrawId}
        message="Отозвать отклик? Организатор больше не увидит его в списке."
        confirmLabel="Отозвать"
        onConfirm={() => { if (withdrawId) withdrawMut.mutate(withdrawId); }}
        onCancel={() => setWithdrawId(null)}
      />
    </div>
  );
}
