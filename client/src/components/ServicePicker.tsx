import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Search, ChevronRight, ArrowLeft, Loader2, Check } from 'lucide-react';
import { referenceAPI } from '../lib/api';
import { yoIncludes } from '../lib/search';
import { useScrollLock } from '../lib/scrollLock';

export interface PickedService {
  sectionId: string;
  sectionName: string;
  serviceId: string;
  serviceName: string;
}

interface Section {
  id: string;
  name: string;
  sortOrder?: number;
  services: { id: string; name: string; sortOrder?: number }[];
}

interface Props {
  onSelect: (service: PickedService) => void;
  onClose: () => void;
  excludeServiceIds?: string[];
}

type Level = 'section' | 'service';

export default function ServicePicker({ onSelect, onClose, excludeServiceIds = [] }: Props) {
  const [level, setLevel] = useState<Level>('section');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<Section | null>(null);
  useScrollLock(true);

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['ref-sections'],
    queryFn: async () => { const { data } = await referenceAPI.getSections(); return data as Section[]; },
    staleTime: 300_000,
  });

  const currentItems: { id: string; name: string }[] = useMemo(() => {
    let items: { id: string; name: string }[] = [];
    if (level === 'section') {
      items = sections;
    } else if (section) {
      items = (section.services || []).filter(s => !excludeServiceIds.includes(s.id));
    }
    if (!search) return items;
    return items.filter(i => yoIncludes(i.name, search));
  }, [level, sections, section, search, excludeServiceIds]);

  const levelLabel: Record<Level, string> = {
    section: 'Выберите раздел',
    service: 'Выберите услугу',
  };

  const handleBack = () => {
    setSearch('');
    if (level === 'service') {
      setSection(null);
      setLevel('section');
    } else {
      onClose();
    }
  };

  const handleSelect = (item: { id: string; name: string }) => {
    setSearch('');
    if (level === 'section') {
      setSection(item as Section);
      setLevel('service');
    } else if (section) {
      onSelect({
        sectionId: section.id,
        sectionName: section.name,
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
          {level === 'service' && section && (
            <div className="flex items-center gap-1 flex-wrap mt-0.5">
              <button
                onClick={() => { setSection(null); setLevel('section'); setSearch(''); }}
                className="text-[11px] text-primary-400 hover:text-primary-300 transition-colors truncate max-w-[160px]"
              >
                {section.name}
              </button>
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
        {isLoading ? (
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
