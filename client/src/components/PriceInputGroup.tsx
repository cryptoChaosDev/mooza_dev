import { DollarSign, Clock } from 'lucide-react';

interface PriceInputGroupProps {
  pricePerHour: string;
  pricePerEvent: string;
  onPricePerHourChange: (value: string) => void;
  onPricePerEventChange: (value: string) => void;
  disabled?: boolean;
}

export default function PriceInputGroup({
  pricePerHour,
  pricePerEvent,
  onPricePerHourChange,
  onPricePerEventChange,
  disabled = false,
}: PriceInputGroupProps) {
  const formatNumber = (value: string): string => {
    // Удалить все нецифровые символы
    const digits = value.replace(/\D/g, '');
    // Добавить пробелы для разделения тысяч
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  const handlePriceChange = (
    value: string,
    setter: (value: string) => void
  ) => {
    const digits = value.replace(/\D/g, '');
    setter(digits);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Price per hour */}
      <div>
        <label className="block text-sm font-semibold mb-2 text-slate-300 flex items-center gap-2">
          <DollarSign size={14} className="text-green-400" />
          Цена за час
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={formatNumber(pricePerHour)}
            onChange={(e) => handlePriceChange(e.target.value, onPricePerHourChange)}
            disabled={disabled}
            placeholder="0"
            className="w-full pl-4 pr-12 py-3.5 bg-slate-700/50 border-2 border-slate-600/50 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-lg font-semibold"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
            ₽
          </div>
        </div>
        {pricePerHour && Number(pricePerHour) > 0 && (
          <p className="text-xs text-slate-400 mt-2">
            ~{formatNumber(String(Number(pricePerHour) * 8))} ₽ за рабочий день (8ч)
          </p>
        )}
      </div>

      {/* Price per event */}
      <div>
        <label className="block text-sm font-semibold mb-2 text-slate-300 flex items-center gap-2">
          <Clock size={14} className="text-green-400" />
          Цена за выступление
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={formatNumber(pricePerEvent)}
            onChange={(e) => handlePriceChange(e.target.value, onPricePerEventChange)}
            disabled={disabled}
            placeholder="0"
            className="w-full pl-4 pr-12 py-3.5 bg-slate-700/50 border-2 border-slate-600/50 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-lg font-semibold"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
            ₽
          </div>
        </div>
        {pricePerEvent && Number(pricePerEvent) > 0 && (
          <p className="text-xs text-green-400 mt-2 font-medium">
            {formatNumber(pricePerEvent)} ₽
          </p>
        )}
      </div>
    </div>
  );
}
