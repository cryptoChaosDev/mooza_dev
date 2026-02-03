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
      <label className="block text-sm font-semibold mb-2 text-slate-300 flex items-center gap-2">
        {icon}
        {label}
      </label>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-all ${
          disabled
            ? 'bg-slate-700/30 border-slate-600/30 cursor-not-allowed opacity-60'
            : 'bg-slate-700/30 border-slate-600/50 hover:border-slate-600 hover:bg-slate-700/50 active:scale-[0.99]'
        }`}
      >
        <span className={value ? 'text-white font-medium' : 'text-slate-400'}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-2">
          {badge !== undefined && badge > 0 && (
            <span className="bg-primary-500 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[24px] text-center">
              {badge}
            </span>
          )}
          <ChevronRight size={20} className="text-slate-400" />
        </div>
      </button>
    </div>
  );
}
