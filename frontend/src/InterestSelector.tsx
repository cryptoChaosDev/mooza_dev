import React, { useState, useEffect, useMemo } from "react";
import { INTEREST_CATEGORIES } from "./categories";
import { ConsistentActionButton } from "./components/ConsistentActionButton";

interface InterestSelectorProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

// Predefined popular tags for quick selection
const POPULAR_TAGS = ['Рок', 'Джаз', 'Поп', 'Хип-хоп', 'Электроника', 'Классика', 'Фолк', 'Метал'];

export const InterestSelector: React.FC<InterestSelectorProps> = ({ 
  selected, 
  onChange,
  placeholder = "Начните вводить интересы..." 
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Get all available tags from categories
  const allTags = useMemo(() => {
    return Array.from(new Set(
      INTEREST_CATEGORIES.flatMap(category => 
        category.subcategories.flatMap(sub => sub.tags)
      )
    ));
  }, []);

  // Filter tags based on search query
  const filteredTags = useMemo(() => {
    if (!query.trim()) return [];
    
    const lowerQuery = query.toLowerCase();
    return allTags
      .filter(tag => tag.toLowerCase().includes(lowerQuery))
      .slice(0, 15); // Limit to 15 suggestions
  }, [allTags, query]);

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter(t => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };

  // Handle adding custom tag
  const handleAddCustomTag = () => {
    if (query.trim() && !selected.includes(query.trim())) {
      onChange([...selected, query.trim()]);
      setQuery("");
      setIsOpen(false);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomTag();
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="w-full">
      {/* Selected tags display */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map(tag => (
            <span 
              key={tag} 
              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-400 text-white border-none shadow-sm animate-fade-in"
            >
              {tag}
              <button 
                className="ml-2 text-white hover:text-red-200 transition-colors focus:outline-none"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTag(tag);
                }}
                aria-label={`Удалить ${tag}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input with dropdown */}
      <div className="relative">
        <div 
          className="flex items-center px-4 py-3 rounded-2xl bg-dark-bg/70 text-dark-text shadow-inner focus-within:ring-2 focus-within:ring-blue-400"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
        >
          <input
            className="flex-1 bg-transparent outline-none text-base placeholder-dark-muted"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onKeyDown={handleKeyPress}
            onFocus={() => setIsOpen(true)}
          />
          {query && (
            <button 
              className="ml-2 text-dark-muted hover:text-dark-text transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setQuery("");
              }}
              aria-label="Очистить"
            >
              ✖
            </button>
          )}
        </div>

        {/* Dropdown suggestions */}
        {isOpen && (
          <div 
            className="absolute z-50 left-0 right-0 mt-2 bg-dark-card rounded-2xl shadow-xl border border-dark-bg/40 max-h-60 overflow-y-auto animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Popular tags when no query */}
            {!query && (
              <div className="p-3">
                <div className="text-xs font-semibold text-dark-muted uppercase tracking-wider mb-2">
                  Популярные теги
                </div>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_TAGS.map(tag => (
                    <ConsistentActionButton
                      key={tag}
                      variant={selected.includes(tag) ? "primary" : "secondary"}
                      size="small"
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </ConsistentActionButton>
                  ))}
                </div>
              </div>
            )}

            {/* Filtered tags */}
            {query && (
              <>
                {/* Option to add custom tag */}
                {!filteredTags.includes(query.trim()) && query.trim() && (
                  <ConsistentActionButton
                    variant="primary"
                    size="small"
                    className="w-full text-left"
                    onClick={handleAddCustomTag}
                  >
                    Добавить "{query.trim()}"
                  </ConsistentActionButton>
                )}

                {/* Matching tags */}
                {filteredTags.length > 0 ? (
                  filteredTags.map(tag => (
                    <ConsistentActionButton
                      key={tag}
                      variant={selected.includes(tag) ? "primary" : "secondary"}
                      size="small"
                      className="w-full"
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </ConsistentActionButton>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-dark-muted">
                    Ничего не найдено
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Clear all button */}
      {selected.length > 0 && (
        <div className="mt-3">
          <ConsistentActionButton
            variant="ghost"
            size="small"
            onClick={() => onChange([])}
          >
            Очистить все
          </ConsistentActionButton>
        </div>
      )}
    </div>
  );
};