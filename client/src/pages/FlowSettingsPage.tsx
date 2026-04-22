import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';

export interface FlowFilters {
  postType: string;
  period: string;
}

export const FLOW_FILTERS_KEY = 'mooza_flow_filters';

export const DEFAULT_FILTERS: FlowFilters = {
  postType: 'all',
  period: 'all',
};

export function loadFilters(): FlowFilters {
  try {
    const raw = localStorage.getItem(FLOW_FILTERS_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 border-b border-slate-800/60">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
        active
          ? 'bg-primary-600 text-white shadow-sm'
          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );
}


const POST_TYPES = [
  { id: 'all', label: 'Все' },
  { id: 'blog', label: 'Блог' },
  { id: 'service', label: 'Услуга' },
];

const PERIODS = [
  { id: 'all', label: 'За всё время' },
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
];


export default function FlowSettingsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FlowFilters>(loadFilters);

  const set = (key: keyof FlowFilters, value: string) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(FLOW_FILTERS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    localStorage.setItem(FLOW_FILTERS_KEY, JSON.stringify(DEFAULT_FILTERS));
  };

  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-primary-400" />
              <h2 className="text-lg font-bold text-white">Настроить Поток</h2>
            </div>
          </div>
          {!isDefault && (
            <button onClick={reset} className="text-sm text-slate-400 hover:text-white transition-colors">
              Сбросить
            </button>
          )}
        </div>

        <div className="pb-44 lg:pb-24">
          <Section title="Тип поста">
            {POST_TYPES.map(t => (
              <Chip key={t.id} label={t.label} active={filters.postType === t.id} onClick={() => set('postType', t.id)} />
            ))}
          </Section>

          <Section title="Период">
            {PERIODS.map(t => (
              <Chip key={t.id} label={t.label} active={filters.period === t.id} onClick={() => set('period', t.id)} />
            ))}
          </Section>

        </div>

        {/* Apply button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+56px)] lg:pb-4 bg-slate-950/95 border-t border-slate-800 backdrop-blur">
          <button
            onClick={() => navigate(-1)}
            className="w-full max-w-2xl mx-auto block py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-2xl transition-colors"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
