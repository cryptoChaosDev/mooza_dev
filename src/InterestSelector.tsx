import React, { useState, useMemo } from "react";
import { INTEREST_CATEGORIES } from "./categories";
import { MOCK_USERS } from "./App";

interface InterestSelectorProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  profileInterests?: string[]; // для рекомендаций
}

export const InterestSelector: React.FC<InterestSelectorProps> = ({ selected, onChange, profileInterests }) => {
  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState<string>("");

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

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Популярные интересы — облако тегов (строгое) */}
      {popularTagsWithCounts.length > 0 && (
        <div className="mb-1">
          <div className="text-xs text-dark-muted mb-1 font-semibold">Популярные интересы</div>
          <div className="flex flex-wrap gap-2 items-baseline min-h-[40px]">
            {popularTagsWithCounts.map(([tag, count], i) => {
              let size = 'text-base';
              if (i === 0) size = 'text-2xl font-bold';
              else if (i < 3) size = 'text-xl font-semibold';
              else if (i < 6) size = 'text-lg';
              else size = 'text-base';
              return (
                <button
                  key={tag}
                  className={`px-3 py-1 rounded-full border-none shadow-sm bg-gradient-to-r from-yellow-400 to-pink-400 text-white hover:scale-110 hover:z-10 transition-all animate-fade-in ${size} ${selected.includes(tag) ? 'opacity-50 pointer-events-none' : ''}`}
                  style={{
                    marginTop: 0,
                    marginBottom: 0,
                    transform: 'none',
                  }}
                  onClick={() => handleQuickAdd(tag)}
                  type="button"
                  title={`Используется у ${count} пользователей`}
                >
                  {getInterestPath(tag)}
                  <span className="ml-2 flex items-center gap-1 text-xs text-white/80">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="inline align-middle"><path d="M12 12c2.5 0 4.5-2 4.5-4.5S14.5 3 12 3 7.5 5 7.5 7.5 9.5 12 12 12Zm0 0c-3.5 0-6.5 2.5-6.5 5.5V21h13v-3.5c0-3-3-5.5-6.5-5.5Z" stroke="currentColor" strokeWidth="1.5"/></svg>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
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
  );
}; 