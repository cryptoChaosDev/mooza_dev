import { X, Briefcase, Music, MapPin, Globe, Calendar, Wallet, LayoutGrid, Clock } from 'lucide-react';
import type { RequestChip, RequestChipKind } from '../../lib/requestsApi';

const ICONS: Record<RequestChipKind, typeof X> = {
  profession: Briefcase,
  genre: Music,
  city: MapPin,
  remote: Globe,
  date: Calendar,
  dateHint: Clock,
  budget: Wallet,
  service: LayoutGrid,
};

/**
 * Чипы разбора: «Профессия: Барабанщик ✕», «Город: Самара ✕» … ✕ убирает
 * распознанное (правка уходит на сервер), «Раздел» — по тапу смена раздела.
 */
export default function RequestChips({
  chips,
  onRemove,
  onServiceClick,
}: {
  chips: RequestChip[];
  onRemove: (chip: RequestChip) => void;
  onServiceClick?: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => {
        const Icon = ICONS[chip.kind] ?? Briefcase;
        const accent = chip.kind === 'profession'
          ? 'bg-primary-500/15 border-primary-500/30 text-primary-100'
          : 'bg-slate-800/80 border-slate-700 text-slate-200';
        const clickable = chip.kind === 'service' && !!onServiceClick;
        const content = (
          <>
            <Icon size={13} className="flex-shrink-0 opacity-70" />
            <span className="truncate">{chip.label}</span>
          </>
        );
        return (
          <span
            key={`${chip.kind}:${chip.id ?? chip.label}`}
            className={`inline-flex items-center gap-1.5 max-w-full pl-2.5 ${chip.removable ? 'pr-1' : 'pr-2.5'} py-1 rounded-full border text-xs ${accent}`}
          >
            {clickable ? (
              <button type="button" onClick={onServiceClick} className="inline-flex items-center gap-1.5 min-w-0 underline decoration-dotted underline-offset-2">
                {content}
              </button>
            ) : content}
            {chip.removable && (
              <button
                type="button"
                onClick={() => onRemove(chip)}
                aria-label={`Убрать: ${chip.label}`}
                className="p-0.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors flex-shrink-0"
              >
                <X size={13} />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
