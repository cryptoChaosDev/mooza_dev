import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Search, ChevronRight, ArrowLeft, Loader2, Check } from 'lucide-react';
import { referenceAPI } from '../lib/api';

export interface PickedService {
  fieldId: string;
  fieldName: string;
  directionId: string;
  directionName: string;
  professionId: string;
  professionName: string;
  serviceId: string;
  serviceName: string;
}

interface Props {
  onSelect: (service: PickedService) => void;
  onClose: () => void;
  excludeServiceIds?: string[];
}

type Level = 'field' | 'direction' | 'profession' | 'service';

export default function ServicePicker({ onSelect, onClose, excludeServiceIds = [] }: Props) {
  const [level, setLevel] = useState<Level>('field');
  const [search, setSearch] = useState('');
  const [field, setField]       = useState<{ id: string; name: string } | null>(null);
  const [direction, setDirection] = useState<{ id: string; name: string } | null>(null);
  const [profession, setProfession] = useState<{ id: string; name: string } | null>(null);

  const { data: fields = [], isLoading: loadingFields } = useQuery({
    queryKey: ['ref-fields-all'],
    queryFn: async () => { const { data } = await referenceAPI.getFieldsOfActivity({ all: true }); return data; },
    staleTime: 300_000,
  });

  const { data: directions = [], isLoading: loadingDirs } = useQuery({
    queryKey: ['ref-dirs', field?.id],
    queryFn: async () => { const { data } = await referenceAPI.getDirections({ fieldOfActivityId: field!.id, all: true }); return data; },
    enabled: !!field,
    staleTime: 300_000,
  });

  const { data: professions = [], isLoading: loadingProfs } = useQuery({
    queryKey: ['ref-profs', direction?.id],
    queryFn: async () => { const { data } = await referenceAPI.getProfessions({ directionId: direction!.id, all: true }); return data; },
    enabled: !!direction,
    staleTime: 300_000,
  });

  const { data: services = [], isLoading: loadingServices } = useQuery({
    queryKey: ['ref-services', profession?.id],
    queryFn: async () => { const { data } = await referenceAPI.getServices({ professionId: profession!.id }); return data; },
    enabled: !!profession,
    staleTime: 300_000,
  });

  const loading = loadingFields || loadingDirs || loadingProfs || loadingServices;

  const currentItems: { id: string; name: string }[] = useMemo(() => {
    let items: { id: string; name: string }[] = [];
    if (level === 'field') items = fields;
    if (level === 'direction') items = directions;
    if (level === 'profession') items = professions;
    if (level === 'service') items = (services as any[]).filter(s => !excludeServiceIds.includes(s.id));
    if (!search) return items;
    return items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  }, [level, fields, directions, professions, services, search, excludeServiceIds]);

  const breadcrumb = [
    field && { label: field.name, onClick: () => { setDirection(null); setProfession(null); setLevel('field'); setSearch(''); } },
    direction && { label: direction.name, onClick: () => { setProfession(null); setLevel('direction'); setSearch(''); } },
    profession && { label: profession.name, onClick: () => setLevel('profession') },
  ].filter(Boolean) as { label: string; onClick: () => void }[];

  const levelLabel: Record<Level, string> = {
    field: 'Выберите сферу',
    direction: 'Выберите направление',
    profession: 'Выберите профессию',
    service: 'Выберите услугу',
  };

  const handleBack = () => {
    setSearch('');
    if (level === 'service') { setLevel('profession'); }
    else if (level === 'profession') { setProfession(null); setLevel('direction'); }
    else if (level === 'direction') { setDirection(null); setLevel('field'); }
    else { onClose(); }
  };

  const handleSelect = (item: { id: string; name: string }) => {
    setSearch('');
    if (level === 'field') {
      setField(item);
      setLevel('direction');
    } else if (level === 'direction') {
      setDirection(item);
      setLevel('profession');
    } else if (level === 'profession') {
      setProfession(item);
      setLevel('service');
    } else {
      onSelect({
        fieldId: field!.id,
        fieldName: field!.name,
        directionId: direction!.id,
        directionName: direction!.name,
        professionId: profession!.id,
        professionName: profession!.name,
        serviceId: item.id,
        serviceName: item.name,
      });
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-slate-900 flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 flex-shrink-0">
        <button onClick={handleBack} className="p-2 -ml-1 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white">{levelLabel[level]}</p>
          {breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-0.5">
              {breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={10} className="text-slate-600" />}
                  <button onClick={b.onClick} className="text-[11px] text-primary-400 hover:text-primary-300 transition-colors truncate max-w-[100px]">
                    {b.label}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-slate-800/60 flex-shrink-0">
        <div className="flex items-center gap-2 bg-slate-800 rounded-2xl px-3 py-2.5">
          <Search size={16} className="text-slate-500 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {search && <button onClick={() => setSearch('')} className="text-slate-500 hover:text-white transition-colors"><X size={14} /></button>}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-400" /></div>
        ) : currentItems.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            {search ? 'Ничего не найдено' : 'Нет вариантов'}
          </div>
        ) : (
          currentItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl hover:bg-slate-800 transition-colors text-left group"
            >
              <span className="text-sm text-slate-200 group-hover:text-white transition-colors">{item.name}</span>
              {level === 'service'
                ? <Check size={16} className="text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                : <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
              }
            </button>
          ))
        )}
      </div>
    </div>,
    document.body
  );
}
