import { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { artistAPI } from '../lib/api';

// «Найти артиста» — debounced search against external catalogs (Deezer + Apple Music)
// that returns candidates with name/type/genre/photo/links. The parent decides what to
// do with the picked candidate via onApply (e.g. fill the create form or the edit form).
export default function ArtistLookup({
  onApply,
  applying = false,
}: {
  onApply: (candidate: any) => void | Promise<void>;
  applying?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await artistAPI.lookup(q);
        setResults(data.candidates || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="rounded-xl border border-dashed border-primary-500/40 bg-primary-500/5 p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-primary-300">
        <Search size={13} /> Найти артиста (автозаполнение)
      </p>
      <div className="relative">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Название артиста на Яндекс.Музыке / Deezer / Apple…"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        {(loading || applying) && <Loader2 size={14} className="absolute right-3 top-2.5 text-slate-400 animate-spin" />}
      </div>
      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((c: any, i: number) => (
            <button
              key={i}
              type="button"
              disabled={applying}
              onClick={async () => { await onApply(c); setResults([]); setQuery(''); }}
              className="w-full flex items-center gap-2.5 p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-left transition-colors disabled:opacity-50"
            >
              {c.imageUrl
                ? <img src={c.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                : <div className="w-9 h-9 rounded-lg bg-slate-700 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{c.name}</p>
                <p className="text-[10px] text-slate-500 truncate">
                  {(c.genres || []).slice(0, 2).join(', ') || (c.sources || []).join(', ')}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-500">Подставит название, жанр, фото и ссылки — потом можно поправить.</p>
    </div>
  );
}
