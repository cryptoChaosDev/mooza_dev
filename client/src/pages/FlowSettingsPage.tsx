import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, SlidersHorizontal, Search, Loader2, X, MapPin, Bookmark, Plus, Trash2, Crown } from 'lucide-react';
import { feedPresetAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { isProActive, limitsFor } from '../lib/proLimits';

export interface FlowFilters {
  postType: string;
  authorKind: string;
  sort: string;        // new | popular | discussed
  period: string;
  cities: string[];
  // Contextual filters (E4)
  employment: string;  // all | open | considering | closed
  artistType: string;  // all | SOLO | GROUP | COVER_GROUP
  genre: string;       // all | <genre name>
}

export const FLOW_FILTERS_KEY = 'mooza_flow_filters';

export const DEFAULT_FILTERS: FlowFilters = {
  postType: 'all',
  authorKind: 'all',
  sort: 'new',
  period: 'all',
  cities: [],
  employment: 'all',
  artistType: 'all',
  genre: 'all',
};

export function loadFilters(): FlowFilters {
  try {
    const raw = localStorage.getItem(FLOW_FILTERS_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 border-b border-slate-800/60">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
        active
          ? 'bg-primary-600 text-white shadow-sm'
          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );
}


const POST_TYPES = [
  { id: 'all', label: 'Все' },
  { id: 'blog', label: 'Блог' },
  { id: 'service', label: 'Услуга' },
  { id: 'order', label: 'Заказ' },
  { id: 'vacancy', label: 'Вакансия' },
];

const PERIODS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'yesterday', label: 'Вчера' },
  { id: '3days', label: 'За 3 дня' },
  { id: 'week', label: 'За неделю' },
  { id: 'month', label: 'За месяц' },
  { id: '3months', label: 'За 3 месяца' },
  { id: 'year', label: 'За год' },
  { id: 'all', label: 'За всё время' },
];

// ── Contextual filter values (E4) ───────────────────────────────────────────
const EMPLOYMENT_STATUSES = [
  { id: 'all', label: 'Все' },
  { id: 'open', label: 'Открыт' },
  { id: 'considering', label: 'Рассматриваю' },
  { id: 'closed', label: 'Закрыт' },
];

const ARTIST_TYPES = [
  { id: 'all', label: 'Все' },
  { id: 'SOLO', label: 'Соло-артист' },
  { id: 'GROUP', label: 'Группа' },
  { id: 'COVER_GROUP', label: 'Кавер-группа' },
];

const GENRES = [
  'Поп', 'Рок', 'Метал', 'Панк', 'Хип-Хоп', 'R&B', 'Соул', 'Фанк',
  'Электронная музыка', 'Джаз', 'Классическая музыка', 'Фолк', 'Этно',
  'Шансон', 'Латино', 'Регги', 'Блюз', 'Кантри', 'K-pop', 'J-pop',
  'Аниме-музыка', 'Инди', 'Детская музыка', 'Религиозная', 'Госпел',
  'Опера', 'Мюзикл', 'Экспериментальная музыка', 'Open format', 'Любой жанр',
];

// ─── City multiselect ───────────────────────────────────────────────────────
async function searchCityNames(query: string): Promise<string[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '8');
  url.searchParams.set('accept-language', 'ru');
  url.searchParams.set('featuretype', 'city');
  url.searchParams.set('dedupe', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Moooza/1.0 (moooza.ru)' },
  });
  const data: any[] = await res.json();

  const seen = new Set<string>();
  const results: string[] = [];
  for (const item of data) {
    const addr = item.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    if (!city || seen.has(city)) continue;
    seen.add(city);
    results.push(city);
    if (results.length >= 6) break;
  }
  return results;
}

function CityMultiSelect({ selected, onAdd, onRemove }: { selected: string[]; onAdd: (city: string) => void; onRemove: (city: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const found = await searchCityNames(q);
        setResults(found);
        setOpen(found.length > 0);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const add = (city: string) => {
    if (city && !selected.includes(city)) onAdd(city);
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="w-full space-y-2.5">
      <div className="relative">
        <div className={`flex items-center gap-2 bg-slate-800/70 border rounded-2xl px-4 py-3 transition-all ${
          open ? 'border-primary-500/50 ring-2 ring-primary-500/20' : 'border-slate-700/60'
        }`}>
          {loading
            ? <Loader2 size={16} className="text-slate-500 flex-shrink-0 animate-spin" />
            : <Search size={16} className="text-slate-500 flex-shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(query.trim()); } }}
            placeholder="Начните вводить город..."
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setResults([]); setOpen(false); }} className="text-slate-500 hover:text-white transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        {open && results.length > 0 && (
          <div ref={dropdownRef} className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden">
            {results.map((city, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={e => { e.preventDefault(); add(city); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700/50 transition-colors text-left"
              >
                <MapPin size={14} className="text-slate-500 flex-shrink-0" />
                <span className="text-sm text-white font-medium">{city}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map(city => (
            <span key={city} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-sm font-medium bg-primary-600/90 text-white">
              <MapPin size={12} />
              {city}
              <button type="button" onClick={() => onRemove(city)} className="hover:bg-white/20 rounded-full p-0.5 transition-colors">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}


interface FeedPreset {
  id: string;
  name: string;
  filters: FlowFilters;
}

export default function FlowSettingsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FlowFilters>(loadFilters);

  const user = useAuthStore(s => s.user);
  const presetCap = limitsFor(isProActive(user)).feedPresets;

  // ── Presets (server-persisted) ──
  const [presets, setPresets] = useState<FeedPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    feedPresetAPI.list()
      .then(res => { if (active) setPresets(res.data); })
      .catch(() => { if (active) setPresets([]); })
      .finally(() => { if (active) setPresetsLoading(false); });
    return () => { active = false; };
  }, []);

  const atCap = presets.length >= presetCap;

  const applyPreset = (preset: FeedPreset) => {
    const next = { ...DEFAULT_FILTERS, ...preset.filters };
    setFilters(next);
    localStorage.setItem(FLOW_FILTERS_KEY, JSON.stringify(next));
  };

  const saveCurrentAsPreset = async () => {
    if (atCap || savingPreset) return;
    const name = window.prompt('Название пресета')?.trim();
    if (!name) return;
    setSavingPreset(true);
    setPresetError(null);
    try {
      const res = await feedPresetAPI.create(name, filters as unknown as Record<string, unknown>);
      setPresets(prev => [...prev, res.data]);
    } catch (e: any) {
      setPresetError(e?.response?.data?.error || 'Не удалось сохранить пресет');
    } finally {
      setSavingPreset(false);
    }
  };

  const deletePreset = async (id: string) => {
    try {
      await feedPresetAPI.remove(id);
      setPresets(prev => prev.filter(p => p.id !== id));
    } catch (e: any) {
      setPresetError(e?.response?.data?.error || 'Не удалось удалить пресет');
    }
  };

  const set = (key: 'postType' | 'authorKind' | 'period' | 'employment' | 'artistType' | 'genre', value: string) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(FLOW_FILTERS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const setCities = (cities: string[]) => {
    setFilters(prev => {
      const next = { ...prev, cities };
      localStorage.setItem(FLOW_FILTERS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    localStorage.setItem(FLOW_FILTERS_KEY, JSON.stringify(DEFAULT_FILTERS));
  };

  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-4 flex items-center justify-between" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-primary-400" />
              <h2 className="text-lg font-bold text-white">Настроить Поток</h2>
            </div>
          </div>
          {!isDefault && (
            <button onClick={reset} className="text-sm text-slate-400 hover:text-white transition-colors">
              Сбросить
            </button>
          )}
        </div>

        <div className="pb-44 lg:pb-24">
          {/* ── Presets ── */}
          <div className="px-4 py-4 border-b border-slate-800/60">
            <div className="flex items-center gap-2 mb-3">
              <Bookmark size={14} className="text-primary-400" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Пресеты</p>
            </div>

            {presetsLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm py-1">
                <Loader2 size={14} className="animate-spin" /> Загрузка…
              </div>
            ) : (
              <>
                {presets.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {presets.map(preset => (
                      <div key={preset.id} className="flex items-center gap-2">
                        <button
                          onClick={() => applyPreset(preset)}
                          className="flex-1 text-left px-4 py-2.5 rounded-2xl bg-slate-800/70 hover:bg-slate-700 text-sm font-medium text-white transition-colors truncate"
                        >
                          {preset.name}
                        </button>
                        <button
                          onClick={() => deletePreset(preset.id)}
                          aria-label="Удалить пресет"
                          className="p-2.5 rounded-2xl bg-slate-800/70 text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors flex-shrink-0"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {presets.length === 0 && (
                  <p className="text-[13px] text-slate-500 mb-3">
                    Сохраните текущие фильтры как пресет, чтобы переключаться между ними в один тап.
                  </p>
                )}

                <button
                  onClick={saveCurrentAsPreset}
                  disabled={atCap || savingPreset}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${
                    atCap
                      ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                      : 'bg-slate-800 text-white hover:bg-slate-700'
                  }`}
                >
                  {savingPreset ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Сохранить текущие как пресет
                </button>

                {atCap && (
                  <button
                    onClick={() => navigate('/pro')}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-[13px] text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <Crown size={13} />
                    Несколько пресетов — в Pro
                  </button>
                )}

                {presetError && (
                  <p className="mt-2 text-[13px] text-red-400">{presetError}</p>
                )}
              </>
            )}
          </div>

          <Section title="Тип поста">
            {POST_TYPES.map(t => (
              <Chip key={t.id} label={t.label} active={filters.postType === t.id} onClick={() => set('postType', t.id)} />
            ))}
          </Section>

          <Section title="Автор">
            {[
              { id: 'all', label: 'Все' },
              { id: 'resident', label: 'Резидент' },
              { id: 'channel', label: 'Канал' },
              { id: 'artist', label: 'Артист' },
              { id: 'mine', label: 'Мои' },
            ].map(t => (
              <Chip key={t.id} label={t.label} active={filters.authorKind === t.id} onClick={() => set('authorKind', t.id)} />
            ))}
          </Section>

          <Section title="Период">
            {PERIODS.map(t => (
              <Chip key={t.id} label={t.label} active={filters.period === t.id} onClick={() => set('period', t.id)} />
            ))}
          </Section>

          <Section title="Город">
            <CityMultiSelect
              selected={filters.cities}
              onAdd={city => setCities([...filters.cities, city])}
              onRemove={city => setCities(filters.cities.filter(c => c !== city))}
            />
          </Section>

          {/* ── Contextual filters (E4) ── */}
          {(filters.authorKind === 'resident' || filters.postType === 'employment') && (
            <Section title="Статус занятости">
              {EMPLOYMENT_STATUSES.map(s => (
                <Chip key={s.id} label={s.label} active={filters.employment === s.id} onClick={() => set('employment', s.id)} />
              ))}
            </Section>
          )}

          {filters.authorKind === 'artist' && (
            <>
              <Section title="Тип артиста">
                {ARTIST_TYPES.map(t => (
                  <Chip key={t.id} label={t.label} active={filters.artistType === t.id} onClick={() => set('artistType', t.id)} />
                ))}
              </Section>
              <Section title="Жанр">
                <Chip label="Все" active={filters.genre === 'all'} onClick={() => set('genre', 'all')} />
                {GENRES.map(g => (
                  <Chip key={g} label={g} active={filters.genre === g} onClick={() => set('genre', g)} />
                ))}
              </Section>
            </>
          )}

          {/* Deferred contextual filters — require additional data model work */}
          {filters.authorKind === 'resident' && (
            <div className="px-4 py-3 border-b border-slate-800/60">
              <p className="text-[11px] text-slate-600">Фильтры «Сфера» и «Уровень автора» — скоро</p>
            </div>
          )}
          {filters.postType === 'service' && (
            <div className="px-4 py-3 border-b border-slate-800/60">
              <p className="text-[11px] text-slate-600">Фильтр «Тип услуги» — скоро</p>
            </div>
          )}

        </div>

        {/* Apply button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-950/95 border-t border-slate-800 backdrop-blur lg:pb-4" style={{ paddingBottom: 'calc(1rem + 56px + env(safe-area-inset-bottom, 0px))' }}>
          <button
            onClick={() => navigate(-1)}
            className="w-full max-w-2xl mx-auto block py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-2xl transition-colors"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
