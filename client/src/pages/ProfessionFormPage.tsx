import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GraduationCap, Search, Loader2, Save, ChevronDown, Check } from 'lucide-react';
import { userAPI, referenceAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import ProfessionNotFound from '../components/ProfessionNotFound';

/**
 * Страница создания/редактирования Профессии — /professions/new и
 * /professions/edit/:professionId. Заменяет модалку-редактор из профиля:
 * единая механика «карточка = страница» (как Услуги и Заказы).
 *
 * Сохранение — тем же контрактом, что и модалка: PUT /users/me с полным списком
 * userProfessions [{professionId, features, selectedCustomFilterValueIds}].
 */
export default function ProfessionFormPage() {
  const { professionId: editId } = useParams<{ professionId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!editId;

  // Полный профиль — источник текущего списка профессий (и их выбранных значений)
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['profession-form-me'],
    queryFn: async () => { const { data } = await userAPI.getMe(); return data as any; },
  });

  // Выбранная профессия (edit: из URL; new: из поиска)
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Характеристики
  const [filters, setFilters] = useState<any[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [selections, setSelections] = useState<string[]>([]);      // valueIds
  const [features, setFeatures] = useState<string[]>([]);          // feature NAMES
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: allFeatures = [] } = useQuery<any[]>({
    queryKey: ['profession-features'],
    queryFn: async () => { const { data } = await referenceAPI.getProfessionFeatures(); return data as any[]; },
  });

  // Edit-инициализация из профиля
  useEffect(() => {
    if (!isEdit || !me) return;
    const up = (me.userProfessions ?? []).find((u: any) => u.professionId === editId);
    if (!up) return;
    setChosen({ id: up.professionId, name: up.profession?.name || '' });
    setSelections((up.selectedCustomFilterValues ?? []).map((v: any) => v.id));
    setFeatures(up.features ?? []);
  }, [isEdit, me, editId]);

  // Загрузка фильтров выбранной профессии
  useEffect(() => {
    if (!chosen) { setFilters([]); return; }
    setFiltersLoading(true);
    referenceAPI.getProfessionFilters(chosen.id)
      .then(r => setFilters(r.data as any[]))
      .catch(() => setFilters([]))
      .finally(() => setFiltersLoading(false));
  }, [chosen?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Поиск профессии (new-режим), без уже добавленных
  useEffect(() => {
    if (isEdit || !search.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      setSearching(true);
      referenceAPI.getProfessions({ search: search.trim(), all: true })
        .then(r => {
          const existing = new Set((me?.userProfessions ?? []).map((u: any) => u.professionId));
          setResults((r.data as any[]).filter((p: any) => !existing.has(p.id)));
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, isEdit, me]);

  const toggleValue = (valueId: string) =>
    setSelections(prev => prev.includes(valueId) ? prev.filter(v => v !== valueId) : [...prev, valueId]);
  const toggleFeature = (name: string) =>
    setFeatures(prev => prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]);
  const toggleSection = (id: string) =>
    setOpenSections(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const handleSave = async () => {
    if (!chosen || !me) return;
    setSaving(true);
    try {
      const others = (me.userProfessions ?? [])
        .filter((u: any) => u.professionId !== chosen.id)
        .map((u: any) => ({
          professionId: u.professionId,
          features: u.features || [],
          selectedCustomFilterValueIds: (u.selectedCustomFilterValues ?? []).map((v: any) => v.id),
        }));
      await userAPI.updateMe({
        userProfessions: [...others, { professionId: chosen.id, features, selectedCustomFilterValueIds: selections }],
      });
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['profession-form-me'] });
      toast.success(isEdit ? 'Профессия обновлена' : 'Профессия добавлена');
      if (isEdit) navigate(-1); else navigate('/profile');
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось сохранить профессию'));
    } finally {
      setSaving(false);
    }
  };

  if (meLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-fuchsia-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      <div className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <GraduationCap size={16} className="text-fuchsia-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">
            {isEdit ? `Редактирование: ${chosen?.name ?? 'профессия'}` : 'Новая профессия'}
          </h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Выбор профессии (только new) */}
        {!isEdit && !chosen && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Найдите профессию</p>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск профессии..."
                className="w-full pl-8 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
              />
              {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
            </div>
            {search.trim() && !searching && results.length === 0 && (
              <ProfessionNotFound initialQuery={search} compact />
            )}
            {results.length > 0 && (
              <div className="max-h-64 overflow-y-auto flex flex-wrap gap-1.5">
                {results.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setChosen({ id: p.id, name: p.name }); setSearch(''); setResults([]); }}
                    className="px-3 py-1.5 rounded-lg border bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-fuchsia-500/10 hover:border-fuchsia-500/40 hover:text-fuchsia-300 transition-all text-xs font-medium"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Выбранная профессия + характеристики */}
        {chosen && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-white flex-1 min-w-0 truncate">{chosen.name}</p>
              {!isEdit && (
                <button onClick={() => { setChosen(null); setSelections([]); setFeatures([]); }} className="text-xs text-slate-500 hover:text-white transition-colors flex-shrink-0">
                  Выбрать другую
                </button>
              )}
            </div>

            {filtersLoading && <p className="text-xs text-slate-500">Загрузка параметров…</p>}

            {/* Аккордеоны фильтров */}
            {filters.map((filter: any) => {
              const open = openSections.has(filter.id);
              const selCount = filter.values.filter((v: any) => selections.includes(v.id)).length;
              return (
                <div key={filter.id} className="border border-slate-800 rounded-xl overflow-hidden">
                  <button onClick={() => toggleSection(filter.id)} className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-800/40 hover:bg-slate-800/70 transition-colors text-left">
                    <span className="text-sm text-slate-300 flex-1 min-w-0 truncate">{filter.name}</span>
                    {selCount > 0 && <span className="px-1.5 py-0.5 bg-fuchsia-600/80 text-white text-[10px] font-semibold rounded-full flex-shrink-0">{selCount}</span>}
                    <ChevronDown size={13} className={`text-slate-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div className="p-2.5 flex flex-wrap gap-1.5">
                      {filter.values.map((v: any) => {
                        const on = selections.includes(v.id);
                        return (
                          <button key={v.id} onClick={() => toggleValue(v.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${on ? 'bg-fuchsia-600/20 border-fuchsia-500/50 text-fuchsia-300' : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'}`}>
                            {on && <Check size={10} className="inline mr-1" />}{v.value}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Особенности */}
            {allFeatures.length > 0 && (
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <button onClick={() => toggleSection('__features__')} className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-800/40 hover:bg-slate-800/70 transition-colors text-left">
                  <span className="text-sm text-slate-300 flex-1">Особенности</span>
                  {features.length > 0 && <span className="px-1.5 py-0.5 bg-fuchsia-600/80 text-white text-[10px] font-semibold rounded-full">{features.length}</span>}
                  <ChevronDown size={13} className={`text-slate-500 transition-transform ${openSections.has('__features__') ? 'rotate-180' : ''}`} />
                </button>
                {openSections.has('__features__') && (
                  <div className="p-2.5 flex flex-wrap gap-1.5">
                    {allFeatures.map((f: any) => {
                      const on = features.includes(f.name);
                      return (
                        <button key={f.id} onClick={() => toggleFeature(f.name)}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${on ? 'bg-fuchsia-600/20 border-fuchsia-500/50 text-fuchsia-300' : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'}`}>
                          {on && <Check size={10} className="inline mr-1" />}{f.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Действия — липнут к низу как на регистрации */}
        <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-2 bg-slate-950/95 border-t border-slate-800/60 flex gap-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}>
          <button onClick={() => navigate(-1)} className="flex-1 py-3 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-2xl transition-colors">
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!chosen || saving}
            className="flex-1 py-3 text-sm bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
