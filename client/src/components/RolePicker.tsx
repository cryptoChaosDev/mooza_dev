import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2 } from 'lucide-react';
import { roleAPI } from '../lib/api';

interface RoleItem { id: string; name: string }
interface RoleCategory { category: string; roles: RoleItem[] }

interface RolePickerProps {
  context: 'collective' | 'release' | 'clip';
  value: string[];
  onSave: (roleIds: string[]) => void;
  onClose: () => void;
  title?: string;
}

// Two-step role picker modal:
//   Step 1 — pick a category (pills row at top); selected chips shown above.
//   Step 2 — multi-select roles within the active category (checkbox rows).
// Switching category never resets selections in other categories.
export default function RolePicker({ context, value, onSave, onClose, title }: RolePickerProps) {
  const [categories, setCategories] = useState<RoleCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(value));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    roleAPI.list(context)
      .then((res) => {
        if (!alive) return;
        const data: RoleCategory[] = res.data || [];
        setCategories(data);
        setActiveCategory(data.length > 0 ? data[0].category : null);
      })
      .catch((e) => console.error('Load roles error:', e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [context]);

  // Flat id → name map for rendering selected chips regardless of active category.
  const roleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) for (const r of c.roles) m.set(r.id, r.name);
    return m;
  }, [categories]);

  const activeRoles = useMemo(
    () => categories.find((c) => c.category === activeCategory)?.roles ?? [],
    [categories, activeCategory]
  );

  const selectedInActive = activeRoles.filter((r) => selected.has(r.id)).length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedList = [...selected];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
          <h3 className="text-base font-semibold text-white">{title || 'Выбор ролей'}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={26} className="animate-spin text-slate-500" />
          </div>
        ) : (
          <>
            <div className="px-5 pt-4 space-y-3 overflow-y-auto">
              {/* Selected chips */}
              {selectedList.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedList.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 bg-primary-500/15 border border-primary-500/30 text-primary-300 rounded-full text-xs">
                      {roleById.get(id) || id}
                      <button
                        onClick={() => toggle(id)}
                        className="p-0.5 hover:bg-primary-500/30 rounded-full transition-colors"
                        aria-label="Убрать роль"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Category pills */}
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c.category}
                    onClick={() => setActiveCategory(c.category)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      c.category === activeCategory
                        ? 'bg-primary-500 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {c.category}
                  </button>
                ))}
              </div>

              {/* Per-category counter */}
              {selectedInActive > 0 && (
                <p className="text-xs text-slate-400">Выбрано в этой категории: {selectedInActive}</p>
              )}

              {/* Role list (step 2) */}
              <div className="space-y-1 pb-2">
                {activeRoles.map((r) => {
                  const isSel = selected.has(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggle(r.id)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${
                        isSel ? 'bg-primary-500/10 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{r.name}</span>
                      <span className={`flex items-center justify-center w-5 h-5 rounded-md border ${
                        isSel ? 'bg-primary-500 border-primary-500' : 'border-slate-600'
                      }`}>
                        {isSel && <Check size={13} className="text-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 py-4 border-t border-slate-800">
              <button onClick={onClose} className="flex-1 py-2.5 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">
                Отмена
              </button>
              <button
                onClick={() => { onSave([...selected]); onClose(); }}
                className="flex-1 py-2.5 text-sm bg-primary-500 hover:bg-primary-400 text-white font-semibold rounded-xl transition-colors"
              >
                Сохранить
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
