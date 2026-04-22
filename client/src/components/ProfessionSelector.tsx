import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Check } from 'lucide-react';
import { SORTED_PROFESSIONS } from '../constants/professions';

interface ProfessionSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProfessions: string[];
  onUpdate: (professions: string[]) => void;
}

export default function ProfessionSelector({
  isOpen,
  onClose,
  selectedProfessions,
  onUpdate,
}: ProfessionSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProfessions = useMemo(() => {
    if (!searchQuery.trim()) return SORTED_PROFESSIONS;
    const query = searchQuery.toLowerCase();
    return SORTED_PROFESSIONS.filter(profession =>
      profession.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const toggleProfession = (profession: string) => {
    if (selectedProfessions.includes(profession)) {
      onUpdate(selectedProfessions.filter(p => p !== profession));
    } else {
      onUpdate([...selectedProfessions, profession]);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-900 flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800 flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">Выбор профессий</h2>
          <p className="text-xs text-slate-400 mt-0.5">Выбрано: {selectedProfessions.length}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-all">
          <X size={20} className="text-slate-400" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-slate-800/60 flex-shrink-0">
        <div className="flex items-center gap-2 bg-slate-800 rounded-2xl px-3 py-2.5">
          <Search size={16} className="text-slate-500 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск профессии..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-white transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Selected chips */}
      {selectedProfessions.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-800/60 flex-shrink-0">
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {selectedProfessions.map((profession) => (
              <button
                key={profession}
                onClick={() => toggleProfession(profession)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/20 text-primary-300 rounded-xl text-xs font-medium border border-primary-500/30 hover:border-primary-500/60 transition-all"
              >
                {profession}
                <X size={12} className="text-primary-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        {filteredProfessions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 px-2">
            {filteredProfessions.map((profession) => {
              const isSelected = selectedProfessions.includes(profession);
              return (
                <button
                  key={profession}
                  onClick={() => toggleProfession(profession)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                    isSelected
                      ? 'bg-primary-500/20 text-white border border-primary-500/50'
                      : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/40'
                  }`}
                >
                  <span className="truncate">{profession}</span>
                  {isSelected
                    ? <Check size={16} className="text-primary-400 flex-shrink-0 ml-2" />
                    : <Plus size={16} className="text-slate-500 flex-shrink-0 ml-2" />
                  }
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-500 text-sm">Профессии не найдены</div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-800 flex-shrink-0">
        <button
          onClick={onClose}
          className="w-full py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-2xl transition-colors"
        >
          Готово ({selectedProfessions.length})
        </button>
      </div>
    </div>,
    document.body
  );
}
