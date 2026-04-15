import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Check, Loader2, Search, ChevronRight, ArrowLeft } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connectionAPI, referenceAPI } from '../lib/api';
import AvatarComponent from './Avatar';

interface Props {
  targetUser: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  onClose: () => void;
}

type Level = 'fields' | 'directions' | 'services';

export default function ConnectionRequestModal({ targetUser, onClose }: Props) {
  const queryClient = useQueryClient();

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<Level>('fields');
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState('');
  const [directionId, setDirectionId] = useState<string | null>(null);
  const [directionName, setDirectionName] = useState('');

  // Data loading
  const { data: fields = [], isLoading: fieldsLoading } = useQuery({
    queryKey: ['ref-fields'],
    queryFn: async () => { const { data } = await referenceAPI.getFieldsOfActivity({ all: true }); return data as { id: string; name: string }[]; },
  });

  const { data: directions = [], isLoading: directionsLoading } = useQuery({
    queryKey: ['ref-directions', fieldId],
    queryFn: async () => { const { data } = await referenceAPI.getDirections({ fieldOfActivityId: fieldId!, all: true }); return data as { id: string; name: string }[]; },
    enabled: !!fieldId,
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['ref-services', directionId],
    queryFn: async () => { const { data } = await referenceAPI.getServices({ directionId: directionId! }); return data as { id: string; name: string }[]; },
    enabled: !!directionId,
  });

  // All services for search (loaded once when user starts typing)
  const { data: allRefs } = useQuery({
    queryKey: ['ref-all'],
    queryFn: async () => { const { data } = await referenceAPI.getAllReferences(); return data; },
    enabled: search.length > 0,
  });

  const searchResults = useMemo(() => {
    if (!search.trim() || !allRefs?.services) return [];
    const q = search.toLowerCase();
    return (allRefs.services as { id: string; name: string; directions?: { name: string }[] }[])
      .filter(s => s.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [search, allRefs]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const goToDirections = (fId: string, fName: string) => {
    setFieldId(fId);
    setFieldName(fName);
    setLevel('directions');
  };

  const goToServices = (dId: string, dName: string) => {
    setDirectionId(dId);
    setDirectionName(dName);
    setLevel('services');
  };

  const goBack = () => {
    if (level === 'directions') { setLevel('fields'); setFieldId(null); }
    if (level === 'services') { setLevel('directions'); setDirectionId(null); }
  };

  const sendMutation = useMutation({
    mutationFn: () => connectionAPI.send(targetUser.id, [...selected]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-with', targetUser.id] });
      queryClient.invalidateQueries({ queryKey: ['connections-sent'] });
      onClose();
    },
  });

  const isSearching = search.trim().length > 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/10 rounded-xl">
              <Link2 size={16} className="text-primary-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Запрос связи</h3>
              <p className="text-xs text-slate-500">{targetUser.firstName} {targetUser.lastName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Target user */}
        <div className="px-5 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <AvatarComponent src={targetUser.avatar} name={`${targetUser.firstName} ${targetUser.lastName}`} size={36} />
            <p className="text-sm text-slate-400">Выберите услуги для профессионального сотрудничества</p>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск услуги..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Breadcrumb / Back button */}
        {!isSearching && level !== 'fields' && (
          <div className="px-5 pb-2 flex-shrink-0">
            <button onClick={goBack} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
              <ArrowLeft size={13} />
              {level === 'directions' ? 'Сферы деятельности' : fieldName}
            </button>
            <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
              {fieldName && <span>{fieldName}</span>}
              {directionName && level === 'services' && <><ChevronRight size={11} /><span>{directionName}</span></>}
            </div>
          </div>
        )}

        {/* List area */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── Search results ── */}
          {isSearching && (
            <div>
              {!allRefs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-slate-500" />
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">Ничего не найдено</div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {searchResults.map(s => {
                    const isOn = selected.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggle(s.id)}
                        className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${isOn ? 'bg-primary-500/10' : 'hover:bg-slate-800/50'}`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isOn ? 'bg-primary-500 border-primary-500' : 'border-slate-600'}`}>
                          {isOn && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{s.name}</p>
                          {s.directions?.[0]?.name && <p className="text-[11px] text-slate-500 truncate">{s.directions[0].name}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Fields level ── */}
          {!isSearching && level === 'fields' && (
            <div>
              {fieldsLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
              ) : fields.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">Нет данных</div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {fields.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => goToDirections(f.id, f.name)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="flex-1 text-sm font-medium text-slate-200">{f.name}</span>
                      <ChevronRight size={15} className="text-slate-500 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Directions level ── */}
          {!isSearching && level === 'directions' && (
            <div>
              {directionsLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
              ) : directions.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">Нет направлений</div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {directions.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => goToServices(d.id, d.name)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="flex-1 text-sm font-medium text-slate-200">{d.name}</span>
                      <ChevronRight size={15} className="text-slate-500 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Services level ── */}
          {!isSearching && level === 'services' && (
            <div>
              {servicesLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
              ) : services.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">Нет услуг</div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {services.map(s => {
                    const isOn = selected.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggle(s.id)}
                        className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${isOn ? 'bg-primary-500/10' : 'hover:bg-slate-800/50'}`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isOn ? 'bg-primary-500 border-primary-500' : 'border-slate-600'}`}>
                          {isOn && <Check size={12} className="text-white" />}
                        </div>
                        <span className={`flex-1 text-sm font-medium truncate ${isOn ? 'text-primary-300' : 'text-slate-200'}`}>{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected chips */}
        {selected.size > 0 && (
          <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-900/80 flex-shrink-0">
            <p className="text-[11px] text-slate-500 mb-1.5">Выбрано ({selected.size}):</p>
            <div className="flex flex-wrap gap-1.5">
              {[...selected].map(id => {
                const label = (() => {
                  const fromServices = services.find(s => s.id === id);
                  if (fromServices) return fromServices.name;
                  const fromAll = allRefs?.services?.find((s: any) => s.id === id);
                  if (fromAll) return fromAll.name;
                  return id;
                })();
                return (
                  <span key={id} className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-primary-500/15 border border-primary-500/30 text-primary-300 rounded-lg text-xs">
                    {label}
                    <button onClick={() => toggle(id)} className="text-primary-400/70 hover:text-primary-300 ml-0.5">
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex gap-2.5 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => sendMutation.mutate()}
            disabled={selected.size === 0 || sendMutation.isPending}
            className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 disabled:shadow-none"
          >
            {sendMutation.isPending && <Loader2 size={15} className="animate-spin" />}
            {selected.size > 0 ? `Отправить (${selected.size})` : 'Выберите услуги'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
