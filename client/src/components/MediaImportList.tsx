import { useState, useEffect } from 'react';
import { Plus, Check, Loader2 } from 'lucide-react';

export type ImportItem = {
  url: string;
  title: string;
  coverUrl?: string | null;
  releaseDate?: string | null;
};

// A pick-list of releases/clips found on Apple Music, with checkboxes and an import
// button. Manages its own selection; the parent supplies `items` and an `onImport`
// that creates the cards (and clears `items` so the block disappears).
export default function MediaImportList({
  title,
  items,
  onImport,
}: {
  title: string;
  items: ImportItem[];
  onImport: (selected: ImportItem[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => { setSelected(new Set(items.map(i => i.url))); }, [items]);

  if (items.length === 0) return null;

  const toggle = (url: string) => setSelected(prev => {
    const n = new Set(prev); if (n.has(url)) n.delete(url); else n.add(url); return n;
  });

  const doImport = async () => {
    if (selected.size === 0 || importing) return;
    setImporting(true);
    try { await onImport(items.filter(i => selected.has(i.url))); }
    finally { setImporting(false); }
  };

  return (
    <div className="rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-emerald-300">{title} ({items.length})</p>
      <div className="max-h-52 overflow-y-auto space-y-1">
        {items.map(it => {
          const sel = selected.has(it.url);
          return (
            <button
              key={it.url}
              type="button"
              onClick={() => toggle(it.url)}
              className={`w-full flex items-center gap-2.5 p-1.5 rounded-lg text-left transition-colors ${sel ? 'bg-emerald-600/20' : 'bg-slate-800/40 hover:bg-slate-800'}`}
            >
              {it.coverUrl
                ? <img src={it.coverUrl} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                : <div className="w-9 h-9 rounded bg-slate-700 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{it.title}</p>
                {it.releaseDate && <p className="text-[10px] text-slate-500">{new Date(it.releaseDate).getFullYear()}</p>}
              </div>
              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                {sel && <Check size={12} className="text-white" />}
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={doImport}
        disabled={importing || selected.size === 0}
        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
      >
        {importing ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        Импортировать выбранные ({selected.size})
      </button>
    </div>
  );
}
