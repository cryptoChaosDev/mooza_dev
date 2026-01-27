import { useState, useMemo } from 'react';
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

  // Фильтруем профессии по поисковому запросу
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

  const handleSave = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="relative p-6 border-b border-slate-700/50">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10"></div>
          <div className="relative flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Выбор профессий
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Выбрано: {selectedProfessions.length}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700/50 rounded-xl transition-all hover:scale-110"
            >
              <X size={24} className="text-slate-300" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-slate-700/50">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск профессии..."
              className="w-full pl-12 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* Selected Professions */}
        {selectedProfessions.length > 0 && (
          <div className="px-6 pt-4 pb-2 border-b border-slate-700/50">
            <p className="text-sm font-semibold text-slate-300 mb-3">Выбранные профессии:</p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {selectedProfessions.map((profession) => (
                <button
                  key={profession}
                  onClick={() => toggleProfession(profession)}
                  className="group inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-primary-500/20 to-primary-600/20 text-primary-300 rounded-lg text-sm font-medium border border-primary-500/30 hover:border-primary-500/50 transition-all hover:scale-105"
                >
                  {profession}
                  <X size={14} className="text-primary-400 group-hover:text-primary-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Professions List */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredProfessions.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredProfessions.map((profession) => {
                const isSelected = selectedProfessions.includes(profession);
                return (
                  <button
                    key={profession}
                    onClick={() => toggleProfession(profession)}
                    className={`group flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isSelected
                        ? 'bg-gradient-to-r from-primary-500/30 to-primary-600/30 text-white border border-primary-500/50 scale-[0.98]'
                        : 'bg-slate-700/30 text-slate-300 hover:bg-slate-700/50 border border-slate-600/30 hover:border-slate-500/50 hover:scale-105'
                    }`}
                  >
                    <span className="truncate">{profession}</span>
                    {isSelected ? (
                      <Check size={18} className="text-primary-400 flex-shrink-0 ml-2" />
                    ) : (
                      <Plus size={18} className="text-slate-400 group-hover:text-slate-300 flex-shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-700/30 rounded-2xl flex items-center justify-center">
                <Search size={32} className="text-slate-500" />
              </div>
              <p className="text-slate-400">
                Профессии не найдены
              </p>
              <p className="text-slate-500 text-sm mt-1">
                Попробуйте изменить запрос
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700/50">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-700/50 hover:bg-slate-700/70 text-white rounded-xl font-semibold transition-all hover:scale-105"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-xl font-semibold transition-all hover:scale-105 shadow-lg shadow-primary-500/30"
            >
              Сохранить ({selectedProfessions.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
