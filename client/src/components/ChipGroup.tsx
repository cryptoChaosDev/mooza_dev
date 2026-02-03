import { X } from 'lucide-react';

interface Chip {
  id: string;
  label: string;
  icon?: React.ReactNode;
  color?: 'primary' | 'purple' | 'green' | 'blue' | 'orange';
}

interface ChipGroupProps {
  chips: Chip[];
  onRemove?: (id: string) => void;
  editable?: boolean;
  emptyText?: string;
}

const colorClasses = {
  primary: 'bg-primary-500/20 text-primary-300 border-primary-500/30',
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  green: 'bg-green-500/20 text-green-300 border-green-500/30',
  blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  orange: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

export default function ChipGroup({ chips, onRemove, editable = false, emptyText = 'Не выбрано' }: ChipGroupProps) {
  if (chips.length === 0) {
    return (
      <div className="text-slate-400 text-sm py-2">{emptyText}</div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <div
          key={chip.id}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border font-medium text-sm transition-all ${
            colorClasses[chip.color || 'primary']
          } ${editable ? 'pr-2' : ''}`}
        >
          {chip.icon && <span className="flex-shrink-0">{chip.icon}</span>}
          <span>{chip.label}</span>
          {editable && onRemove && (
            <button
              onClick={() => onRemove(chip.id)}
              className="ml-1 p-1 hover:bg-white/10 rounded-lg transition-all active:scale-90"
              aria-label={`Удалить ${chip.label}`}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
