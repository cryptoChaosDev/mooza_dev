import { useState, useMemo, useEffect } from 'react';
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

  // Existing connection (if any)
  const [existingConnId, setExistingConnId] = useState<string | null>(null);
  const [existingServices, setExistingServices] = useState<Set<string>>(new Set());

  useEffect(() => {
    connectionAPI.getWith(targetUser.id).then(({ data }: any) => {
      if (data?.id) {
        setExistingConnId(data.id);
        setExistingServices(new Set((data.services ?? []).map((s: any) => s.id)));
      }
    }).catch(() => {});
  }, [targetUser.id]);

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

  const goToDirections = (fId: string, fName: string) => { setFieldId(fId); setFieldName(fName); setLevel('directions'); };
  const goToServices   = (dId: string, dName: string) => { setDirectionId(dId); setDirectionName(dName); setLevel('services'); };
  const goBack = () => {
    if (level === 'directions') { setLevel('fields'); setFieldId(null); }
    if (level === 'services')   { setLevel('directions'); setDirectionId(null); }
  };

  const isEditMode = !!existingConnId;

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (isEditMode) {
        await connectionAPI.addServices(existingConnId!, [...selected]);
      } else {
        await connectionAPI.send(targetUser.id, [...selected]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-with', targetUser.id] });
      queryClient.invalidateQueries({ queryKey: ['connections-sent'] });
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      onClose();
    },
  });

  const isSearching = search.trim().length > 0;
  const fullName = `${targetUser.firstName} ${targetUser.lastName}`.trim();

  // Available services to select (exclude already linked ones in edit mode)
  const isSelectable = (id: string) => !existingServices.has(id);

  const getServiceLabel = (id: string) => {
    const fromServices = services.find(s => s.id === id);
    if (fromServices) return fromServices.name;
    const fromAll = allRefs?.services?.find((s: any) => s.id === id);
    if (fromAll) return (fromAll as any).name;
    return id;
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 flex-shrink-0 bg-slate-900/80 backdrop-blur">
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-base font-semibold text-white flex-1">
          {isEditMode ? 'Добавить услуги к связи' : 'Установить связь'}
        </h2>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* ── Profile block ── */}
      <div className="px-5 py-5 border-b border-slate-800/60 flex-shrink-0">
        <div className="flex items-center gap-4 mb-4">
          <AvatarComponent src={targetUser.avatar} name={fullName} size={52} className="rounded-2xl ring-2 ring-slate-700/50 flex-shrink-0" />
          <div>
            <p className="text-lg font-bold text-white leading-tight">{fullName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Link2 size={12} className="text-primary-400" />
              <p className="text-xs text-primary-400">{isEditMode ? 'Добавление услуги к связи' : 'Новая профессиональная связь'}</p>
            </div>
          </div>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          {isEditMode
            ? 'Выберите дополнительные услуги, которые вы хотите добавить к существующей связи.'
            : 'Профессиональные связи помогают находить партнёров для совместной работы. Выберите услуги, в рамках которых вы хотите сотрудничать.'}
        </p>
        {isEditMode && existingServices.size > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <p className="w-full text-[11px] text-slate-500 mb-0.5">Уже добавлено:</p>
            {[...existingServices].map(id => (
              <span key={id} className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 rounded-lg text-xs">
                {getServiceLabel(id)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Search bar ── */}
      <div className="px-4 py-3 border-b border-slate-800/60 flex-shrink-0 bg-slate-900/40">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск услуги..."
            className="w-full pl-9 pr-9 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Breadcrumb ── */}
      {!isSearching && level !== 'fields' && (
        <div className="px-4 py-2 flex items-center gap-2 flex-shrink-0 bg-slate-900/20">
          <button onClick={goBack} className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors">
            <ArrowLeft size={12} />
            {level === 'directions' ? 'Все сферы' : fieldName}
          </button>
          {directionName && level === 'services' && (
            <><ChevronRight size={11} className="text-slate-600" /><span className="text-xs text-slate-400">{directionName}</span></>
          )}
        </div>
      )}

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Search results */}
        {isSearching && (
          <div>
            {!allRefs ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-500" /></div>
            ) : searchResults.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">Ничего не найдено</div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {searchResults.map(s => {
                  const isOn = selected.has(s.id);
                  const alreadyLinked = existingServices.has(s.id);
                  return (
                    <button key={s.id} type="button" disabled={alreadyLinked}
                      onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${alreadyLinked ? 'opacity-40 cursor-not-allowed' : isOn ? 'bg-primary-500/10' : 'hover:bg-slate-800/50'}`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isOn ? 'bg-primary-500 border-primary-500' : 'border-slate-600'}`}>
                        {isOn && <Check size={12} className="text-white" />}
                        {alreadyLinked && <Check size={12} className="text-slate-500" />}
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

        {/* Fields */}
        {!isSearching && level === 'fields' && (
          fieldsLoading ? <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-500" /></div>
          : <div className="divide-y divide-slate-800/60">
            {fields.map(f => (
              <button key={f.id} type="button" onClick={() => goToDirections(f.id, f.name)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-800/50 transition-colors">
                <span className="flex-1 text-sm font-medium text-slate-200">{f.name}</span>
                <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Directions */}
        {!isSearching && level === 'directions' && (
          directionsLoading ? <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-500" /></div>
          : <div className="divide-y divide-slate-800/60">
            {directions.map(d => (
              <button key={d.id} type="button" onClick={() => goToServices(d.id, d.name)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-800/50 transition-colors">
                <span className="flex-1 text-sm font-medium text-slate-200">{d.name}</span>
                <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Services */}
        {!isSearching && level === 'services' && (
          servicesLoading ? <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-500" /></div>
          : <div className="divide-y divide-slate-800/60">
            {services.map(s => {
              const isOn = selected.has(s.id);
              const alreadyLinked = existingServices.has(s.id);
              return (
                <button key={s.id} type="button" disabled={alreadyLinked}
                  onClick={() => toggle(s.id)}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${alreadyLinked ? 'opacity-40 cursor-not-allowed' : isOn ? 'bg-primary-500/10' : 'hover:bg-slate-800/50'}`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isOn ? 'bg-primary-500 border-primary-500' : alreadyLinked ? 'border-slate-600 bg-slate-700' : 'border-slate-600'}`}>
                    {(isOn || alreadyLinked) && <Check size={12} className="text-white" />}
                  </div>
                  <span className={`flex-1 text-sm font-medium truncate ${isOn ? 'text-primary-300' : 'text-slate-200'}`}>{s.name}</span>
                  {alreadyLinked && <span className="text-[10px] text-slate-500 flex-shrink-0">уже в связи</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Selected chips ── */}
      {selected.size > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/80 flex-shrink-0">
          <p className="text-[11px] text-slate-500 mb-1.5">Выбрано ({selected.size}):</p>
          <div className="flex flex-wrap gap-1.5">
            {[...selected].map(id => (
              <span key={id} className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-primary-500/15 border border-primary-500/30 text-primary-300 rounded-lg text-xs">
                {getServiceLabel(id)}
                <button onClick={() => toggle(id)} className="text-primary-400/70 hover:text-primary-300 ml-0.5"><X size={11} /></button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="px-4 py-4 border-t border-slate-800 flex gap-3 flex-shrink-0 bg-slate-900/80"
           style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        <button onClick={onClose}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
          Отмена
        </button>
        <button onClick={() => sendMutation.mutate()}
          disabled={selected.size === 0 || sendMutation.isPending}
          className="flex-1 py-3 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 disabled:shadow-none">
          {sendMutation.isPending && <Loader2 size={15} className="animate-spin" />}
          {selected.size > 0
            ? (isEditMode ? `Добавить (${selected.size})` : `Отправить запрос (${selected.size})`)
            : 'Выберите услуги'}
        </button>
      </div>
    </div>,
    document.body
  );
}
