import { useState, useRef, useEffect } from 'react';
import { Search, Loader2, X, MapPin } from 'lucide-react';

interface CityResult {
  city: string;
  country: string;
  displayName: string;
}

interface Props {
  city: string;
  country: string;
  onChange: (city: string, country: string) => void;
}

async function searchCities(query: string): Promise<CityResult[]> {
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
  const results: CityResult[] = [];

  for (const item of data) {
    const addr = item.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    const country = addr.country || '';
    if (!city || !country) continue;

    const key = `${city}|${country}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ city, country, displayName: `${city}, ${country}` });
    if (results.length >= 6) break;
  }

  return results;
}

export default function CityPicker({ city, country, onChange }: Props) {
  const [query, setQuery] = useState(city ? `${city}${country ? `, ${country}` : ''}` : '');
  const [results, setResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(!!city);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync query if city changes externally (e.g. geolocation)
  useEffect(() => {
    if (city) {
      setQuery(country ? `${city}, ${country}` : city);
      setSelected(true);
    }
  }, [city, country]);

  useEffect(() => {
    if (selected) return; // don't search when a value is already selected
    const q = query.trim();
    if (q.length < 2) { setResults([]); setOpen(false); return; }

    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const found = await searchCities(q);
        setResults(found);
        setOpen(found.length > 0);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 400);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, selected]);

  // Close dropdown on outside click
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

  const pick = (r: CityResult) => {
    setQuery(r.displayName);
    setSelected(true);
    setOpen(false);
    onChange(r.city, r.country);
  };

  const clear = () => {
    setQuery('');
    setSelected(false);
    setResults([]);
    setOpen(false);
    onChange('', '');
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className={`flex items-center gap-2 bg-slate-800/70 border rounded-2xl px-4 py-3.5 transition-all ${
          open ? 'border-primary-500/50 ring-2 ring-primary-500/20' : 'border-slate-700/60'
        }`}>
          {loading
            ? <Loader2 size={16} className="text-slate-500 flex-shrink-0 animate-spin" />
            : selected
              ? <MapPin size={16} className="text-primary-400 flex-shrink-0" />
              : <Search size={16} className="text-slate-500 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(false); }}
            onFocus={() => results.length > 0 && !selected && setOpen(true)}
            placeholder="Начните вводить город..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={clear} className="text-slate-500 hover:text-white transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        {open && results.length > 0 && (
          <div ref={dropdownRef} className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={e => { e.preventDefault(); pick(r); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700/50 transition-colors text-left"
              >
                <MapPin size={14} className="text-slate-500 flex-shrink-0" />
                <div>
                  <span className="text-sm text-white font-medium">{r.city}</span>
                  <span className="text-xs text-slate-500 ml-2">{r.country}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 flex items-start gap-1.5">
        <span className="text-slate-600 mt-0.5">ℹ</span>
        Если не нашли свой город — выберите ближайший крупный
      </p>
    </div>
  );
}
