import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, MapPin } from 'lucide-react';
import { referenceAPI } from '../lib/api';

interface City {
  id: string;
  name: string;
  country: string;
}

interface Props {
  city: string;
  country: string;
  onChange: (city: string, country: string) => void;
}

// The catalog is static — cache it across mounts so the picker is instant.
let cachedCities: City[] | null = null;

export default function CityPicker({ city, country: _country, onChange }: Props) {
  const [catalog, setCatalog] = useState<City[]>(cachedCities ?? []);
  const [query, setQuery] = useState(city || '');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(!!city);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cachedCities) return;
    referenceAPI.getCities()
      .then((r) => { cachedCities = r.data; setCatalog(r.data); })
      .catch(() => {});
  }, []);

  // Reflect an externally-set city (e.g. loaded profile).
  useEffect(() => {
    if (city) { setQuery(city); setSelected(true); }
  }, [city]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 40);
    return catalog.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 40);
  }, [query, catalog]);

  // Close dropdown on outside click.
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

  const pick = (c: City) => {
    setQuery(c.name);
    setSelected(true);
    setOpen(false);
    onChange(c.name, c.country);
  };

  const clear = () => {
    setQuery('');
    setSelected(false);
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
          {selected
            ? <MapPin size={16} className="text-primary-400 flex-shrink-0" />
            : <Search size={16} className="text-slate-500 flex-shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(false); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Начните вводить город..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={clear} className="text-slate-500 hover:text-white transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        {open && (
          <div ref={dropdownRef} className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
            {results.length > 0 ? results.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700/50 transition-colors text-left"
              >
                <MapPin size={14} className="text-slate-500 flex-shrink-0" />
                <span className="text-sm text-white font-medium">{c.name}</span>
                <span className="text-xs text-slate-500 ml-auto">{c.country}</span>
              </button>
            )) : (
              <p className="px-4 py-3 text-xs text-slate-500">Город не найден в каталоге</p>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 flex items-start gap-1.5">
        <span className="text-slate-600 mt-0.5">ℹ</span>
        Выберите город из списка. Если вашего нет — выберите ближайший крупный.
      </p>
    </div>
  );
}
