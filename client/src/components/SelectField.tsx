import { ChevronRight } from 'lucide-react';

interface SelectFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  badge?: number;
}

export default function SelectField({
  label,
  value,
  placeholder = 'Выберите...',
  icon,
  onClick,
  disabled = false,
  badge,
}: SelectFieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1 text-slate-400 flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all ${
          disabled
            ? 'bg-slate-700/30 border-slate-600/30 cursor-not-allowed opacity-60'
            : 'bg-slate-700/30 border-slate-600/50 hover:border-slate-600 hover:bg-slate-700/50 active:scale-[0.99]'
        }`}
      >
        <span className={`text-sm truncate ${value ? 'text-white font-medium' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {badge !== undefined && badge > 0 && (
            <span className="bg-primary-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
              {badge}
            </span>
          )}
          <ChevronRight size={16} className="text-slate-400" />
        </div>
      </button>
    </div>
  );
}
