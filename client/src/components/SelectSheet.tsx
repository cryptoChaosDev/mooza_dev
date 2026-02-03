import { useState, useMemo } from 'react';
import BottomSheet from './BottomSheet';
import { Search, Check, Circle, CheckCircle2 } from 'lucide-react';

interface SelectOption {
  id: string;
  name: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

interface SelectSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: SelectOption[];
  selectedIds: string | string[];
  onSelect: (ids: string | string[]) => void;
  mode?: 'single' | 'multiple';
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  height?: 'auto' | 'half' | 'full';
  showConfirm?: boolean;
}

export default function SelectSheet({
  isOpen,
  onClose,
  title,
  options,
  selectedIds,
  onSelect,
  mode = 'single',
  searchable = true,
  searchPlaceholder = 'Поиск...',
  emptyText = 'Ничего не найдено',
  height = 'half',
  showConfirm = false,
}: SelectSheetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [tempSelected, setTempSelected] = useState<string | string[]>(selectedIds);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(opt =>
      opt.name.toLowerCase().includes(query) ||
      opt.subtitle?.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  const handleSelect = (id: string) => {
    if (mode === 'single') {
      if (showConfirm) {
        setTempSelected(id);
      } else {
        onSelect(id);
        onClose();
      }
    } else {
      const currentIds = Array.isArray(tempSelected) ? tempSelected : [];
      const newIds = currentIds.includes(id)
        ? currentIds.filter(i => i !== id)
        : [...currentIds, id];

      if (showConfirm) {
        setTempSelected(newIds);
      } else {
        onSelect(newIds);
      }
    }
  };

  const handleConfirm = () => {
    onSelect(tempSelected);
    onClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    setTempSelected(selectedIds);
    onClose();
  };

  const isSelected = (id: string): boolean => {
    if (mode === 'single') {
      return showConfirm ? tempSelected === id : selectedIds === id;
    }
    const ids = showConfirm ? tempSelected : selectedIds;
    return Array.isArray(ids) && ids.includes(id);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title={title} height={height}>
      <div className="px-6 py-4 space-y-4">
        {/* Search */}
        {searchable && (
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-700/50 border border-slate-600/50 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              autoFocus
            />
          </div>
        )}

        {/* Options List */}
        <div className="space-y-2 pb-4">
          {filteredOptions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400 text-sm">{emptyText}</p>
            </div>
          ) : (
            filteredOptions.map((option) => {
              const selected = isSelected(option.id);
              return (
                <button
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all active:scale-[0.98] ${
                    selected
                      ? 'bg-primary-500/20 border-2 border-primary-500/50'
                      : 'bg-slate-700/30 border-2 border-transparent hover:bg-slate-700/50'
                  }`}
                >
                  {/* Icon/Indicator */}
                  <div className="flex-shrink-0">
                    {mode === 'single' ? (
                      selected ? (
                        <CheckCircle2 size={24} className="text-primary-400" />
                      ) : (
                        <Circle size={24} className="text-slate-500" />
                      )
                    ) : (
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                        selected
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-slate-500'
                      }`}>
                        {selected && <Check size={16} className="text-white" />}
                      </div>
                    )}
                  </div>

                  {/* Custom Icon */}
                  {option.icon && (
                    <div className="flex-shrink-0 text-slate-400">
                      {option.icon}
                    </div>
                  )}

                  {/* Text */}
                  <div className="flex-1 text-left">
                    <div className={`font-medium ${selected ? 'text-white' : 'text-slate-200'}`}>
                      {option.name}
                    </div>
                    {option.subtitle && (
                      <div className="text-sm text-slate-400 mt-0.5">{option.subtitle}</div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Confirm Button (for multiple selection) */}
        {showConfirm && (
          <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-slate-900 via-slate-900">
            <button
              onClick={handleConfirm}
              className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-4 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-primary-500/30"
            >
              Применить
              {mode === 'multiple' && Array.isArray(tempSelected) && tempSelected.length > 0 && (
                <span className="ml-2">({tempSelected.length})</span>
              )}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
