import React, { useState, useMemo } from "react";
import { INTEREST_CATEGORIES } from "./categories";
import { MOCK_USERS } from "./App";

interface InterestSelectorProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  profileInterests?: string[]; // для рекомендаций
  onModeChange?: (mode: 'popular' | 'manual' | 'mine') => void;
  disableMineMode?: boolean;
}

export const InterestSelector: React.FC<InterestSelectorProps> = ({ selected, onChange, profileInterests, onModeChange, disableMineMode }) => {
  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState<string>("");
  const [showAllPopular, setShowAllPopular] = useState(false);
  const [mode, setMode] = useState<'popular' | 'manual' | 'mine'>('popular');

  // Получить выбранную категорию и подкатегорию
  const catObj = INTEREST_CATEGORIES.find(c => c.category === category);
  const subObj = catObj?.subcategories.find(s => s.name === subcategory);

  // --- Популярные интересы (топ-10, с частотами) ---
  const popularTagsWithCounts = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    MOCK_USERS.forEach((u: { interests: string[] }) => u.interests.forEach((tag: string) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }));
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, []);

  // Сколько тегов показывать по умолчанию
  const POPULAR_VISIBLE = 5;
  const POPULAR_MAX = 15;
  const visiblePopularTags = showAllPopular ? popularTagsWithCounts.slice(0, POPULAR_MAX) : popularTagsWithCounts.slice(0, POPULAR_VISIBLE);

  // --- Рекомендации (топ-5, которых нет у пользователя, но есть у похожих) ---
  const recommendedTags = useMemo(() => {
    if (!profileInterests || profileInterests.length === 0) return [];
    // Найти пользователей с хотя бы одним совпадающим интересом
    const similarUsers = MOCK_USERS.filter((u: { interests: string[] }) => u.interests.some((tag: string) => profileInterests.includes(tag)));
    const tagCounts: Record<string, number> = {};
    similarUsers.forEach((u: { interests: string[] }) => u.interests.forEach((tag: string) => {
      if (!profileInterests.includes(tag) && !selected.includes(tag)) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }));
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
  }, [profileInterests, selected]);

  // Добавить интересы (теги)
  const handleAdd = () => {
    const newTags = selectedTags.filter(t => !selected.includes(t));
    if (newTags.length > 0) {
      onChange([...selected, ...newTags]);
      setCategory("");
      setSubcategory("");
      setSelectedTags([]);
      setTagSearch("");
    }
  };

  // Быстрое добавление одного тега (чипа)
  const handleQuickAdd = (tag: string) => {
    if (!selected.includes(tag)) {
      onChange([...selected, tag]);
    }
  };

  // Удалить интерес
  const handleRemove = (t: string) => {
    onChange(selected.filter(s => s !== t));
  };

  // Получить путь для отображения
  const getInterestPath = (tag: string) => {
    for (const cat of INTEREST_CATEGORIES) {
      for (const sub of cat.subcategories) {
        if (sub.tags.includes(tag)) {
          return `${cat.category} – ${sub.name} – ${tag}`;
        }
      }
    }
    return tag;
  };

  // Обработка выбора тегов (чекбоксы)
  const handleTagToggle = (t: string) => {
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  // Фильтрация тегов по поиску
  const filteredTags = subObj ? subObj.tags.filter(t => t.toLowerCase().includes(tagSearch.trim().toLowerCase())) : [];

  const hasProfileInterests = profileInterests && profileInterests.length > 0;

  const handleModeChange = (newMode: 'popular' | 'manual' | 'mine') => {
    if (newMode === 'mine' && disableMineMode) return;
    setMode(newMode);
    if (onModeChange) onModeChange(newMode);
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Переключатель режимов */}
      <div className="flex gap-2 mb-1">
        <button
          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${mode === 'popular' ? 'bg-gradient-to-r from-yellow-400 to-pink-400 text-white' : 'bg-dark-bg/60 text-dark-accent hover:bg-yellow-400/20 hover:text-yellow-400'}`}
          onClick={() => handleModeChange('popular')}
          type="button"
        >
          Популярные интересы
        </button>
        <button
          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${mode === 'manual' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white' : 'bg-dark-bg/60 text-dark-accent hover:bg-blue-400/20 hover:text-blue-400'}`}
          onClick={() => handleModeChange('manual')}
          type="button"
        >
          Ручной выбор
        </button>
        {!disableMineMode && (
        <button
          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${mode === 'mine' ? 'bg-gradient-to-r from-green-400 to-blue-400 text-white' : 'bg-dark-bg/60 text-dark-accent hover:bg-green-400/20 hover:text-green-400'}`}
          onClick={() => handleModeChange('mine')}
          type="button"
        >
          Мои интересы
        </button>
        )}
      </div>
      {/* Популярные интересы — многострочный блок тегов */}
      {mode === 'popular' && popularTagsWithCounts.length > 0 && (
        <div className="mb-3 pb-3 border-b border-dark-bg/30 bg-dark-bg/40 rounded-xl shadow-inner px-3 pt-3 animate-fade-in">
          <div className="text-xs text-dark-muted mb-1 font-semibold">Популярные интересы</div>
          <div className="flex flex-wrap gap-x-2 gap-y-2 max-h-40 overflow-y-auto py-1" style={{WebkitOverflowScrolling: 'touch'}}>
            {visiblePopularTags.map(([tag, count]) => (
              <button
                key={tag}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border-none shadow-sm bg-gradient-to-r from-yellow-400 to-pink-400 text-white hover:scale-105 transition-all
                  ${selected.includes(tag) ? 'opacity-50 pointer-events-none' : ''}`}
                style={{ minWidth: 0, whiteSpace: 'nowrap' }}
                onClick={() => handleQuickAdd(tag)}
                type="button"
                title={`Используется у ${count} пользователей`}
              >
                {getInterestPath(tag)}
                <span className="ml-1 flex items-center gap-0.5 text-[10px] text-white/80">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M12 12c2.5 0 4.5-2 4.5-4.5S14.5 3 12 3 7.5 5 7.5 7.5 9.5 12 12 12Zm0 0c-3.5 0-6.5 2.5-6.5 5.5V21h13v-3.5c0-3-3-5.5-6.5-5.5Z" stroke="currentColor" strokeWidth="1.5"/></svg>
                  {count}
                </span>
              </button>
            ))}
          </div>
          {popularTagsWithCounts.length > POPULAR_VISIBLE && (
            <div className="flex justify-center mt-2">
              <button
                className="px-4 py-1 rounded-full text-xs font-semibold border-none shadow-sm bg-dark-bg/60 text-dark-accent hover:bg-dark-accent/10 transition-all"
                onClick={() => setShowAllPopular(v => !v)}
                type="button"
              >
                {showAllPopular ? 'Скрыть' : `Показать ещё (${popularTagsWithCounts.length - POPULAR_VISIBLE})`}
              </button>
            </div>
          )}
        </div>
      )}
      {/* Мои интересы — чипы из profileInterests */}
      {mode === 'mine' && (
        <div className="mb-3 pb-3 border-b border-dark-bg/30 bg-dark-bg/40 rounded-xl shadow-inner px-3 pt-3 animate-fade-in">
          <div className="text-xs text-dark-muted mb-1 font-semibold">Мои интересы</div>
          {hasProfileInterests ? (
            <div className="flex flex-wrap gap-x-2 gap-y-2 max-h-40 overflow-y-auto py-1" style={{WebkitOverflowScrolling: 'touch'}}>
              {profileInterests.map(tag => (
                <button
                  key={tag}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border-none shadow-sm bg-gradient-to-r from-green-400 to-blue-400 text-white hover:scale-105 transition-all
                    ${selected.includes(tag) ? 'opacity-50 pointer-events-none' : ''}`}
                  style={{ minWidth: 0, whiteSpace: 'nowrap' }}
                  onClick={() => handleQuickAdd(tag)}
                  type="button"
                  title={getInterestPath(tag)}
                >
                  {getInterestPath(tag)}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-dark-muted text-xs py-4 text-center">Необходимо заполнить интересы в профиле</div>
          )}
        </div>
      )}
      {/* Ручной фильтр интересов (визуально отделён) */}
      {mode === 'manual' && (
        <div className="flex flex-col gap-3 pt-2 animate-fade-in">
          {/* Рекомендации */}
          {recommendedTags.length > 0 && (
            <div className="mb-1">
              <div className="text-xs text-dark-muted mb-1 font-semibold">Рекомендуемое для вас</div>
              <div className="flex flex-wrap gap-2">
                {recommendedTags.map(tag => (
                  <button
                    key={tag}
                    className={`px-3 py-1 rounded-full text-xs font-medium border-none shadow-sm bg-gradient-to-r from-blue-500 to-cyan-400 text-white hover:scale-105 transition-all animate-fade-in ${selected.includes(tag) ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={() => handleQuickAdd(tag)}
                    type="button"
                  >
                    {getInterestPath(tag)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Список выбранных интересов */}
          <div className="flex flex-wrap gap-2 mb-2">
            {selected.map(t => (
              <span key={t} className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-blue-500 to-cyan-400 text-white border-none shadow-sm animate-fade-in">
                {getInterestPath(t)}
                <button className="ml-1 text-white hover:text-red-300 transition-colors" onClick={() => handleRemove(t)} title="Удалить интерес" style={{fontSize: '1.1em', lineHeight: 1}}>&times;</button>
              </span>
            ))}
          </div>
          {/* Последовательный выбор */}
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
            {/* Категория */}
            <select
              className="px-3 py-2 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400"
              value={category}
              onChange={e => {
                setCategory(e.target.value);
                setSubcategory("");
                setSelectedTags([]);
                setTagSearch("");
              }}
            >
              <option value="">Категория...</option>
              {INTEREST_CATEGORIES.map(cat => (
                <option key={cat.category} value={cat.category}>{cat.category}</option>
              ))}
            </select>
            {/* Подкатегория */}
            <select
              className="px-3 py-2 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400"
              value={subcategory}
              onChange={e => {
                setSubcategory(e.target.value);
                setSelectedTags([]);
                setTagSearch("");
              }}
              disabled={!category}
            >
              <option value="">Подкатегория...</option>
              {catObj?.subcategories.map(sub => (
                <option key={sub.name} value={sub.name}>{sub.name}</option>
              ))}
            </select>
          </div>
          {/* Поиск по тегам */}
          {subcategory && subObj && (
            <input
              className="mt-2 mb-1 px-3 py-2 rounded-xl bg-dark-bg/40 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-xs"
              type="text"
              placeholder="Поиск по тегам..."
              value={tagSearch}
              onChange={e => setTagSearch(e.target.value)}
            />
          )}
          {/* Теги выбранной подкатегории (чекбоксы-чипы) */}
          {subcategory && subObj && (
            <div className="flex flex-wrap gap-2 mt-2 animate-fade-in">
              {filteredTags.map(t => (
                <label
                  key={t}
                  className={`flex items-center gap-2 px-3 py-1 rounded-full cursor-pointer select-none text-xs font-medium shadow-sm transition-all
                    ${selectedTags.includes(t) ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white scale-105' : 'bg-dark-bg/60 text-dark-muted hover:bg-dark-accent/20 hover:text-dark-accent'}`}
                  style={{border: 'none', minWidth: 0, userSelect: 'none'}}
                >
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(t)}
                    onChange={() => handleTagToggle(t)}
                    className="accent-blue-500 w-4 h-4 rounded-full focus:ring-2 focus:ring-blue-400 transition-all"
                    style={{marginRight: 4}}
                  />
                  <span className="truncate">{t}</span>
                </label>
              ))}
            </div>
          )}
          {/* Кнопка добавить */}
          <button
            className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow hover:opacity-90 active:scale-95 transition-all w-fit mx-auto disabled:opacity-50 disabled:cursor-not-allowed animate-fade-in"
            onClick={handleAdd}
            disabled={selectedTags.length === 0}
            type="button"
          >
            Добавить
          </button>
        </div>
      )}
    </div>
  );
}; 