import React, { useState, useRef, useEffect } from "react";
import { INTEREST_CATEGORIES } from "./categories";
import "./scrollbar.css";

interface InterestSelectorProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

function useOutsideClick<T extends HTMLElement>(ref: React.RefObject<T>, handler: () => void) {
  useEffect(() => {
    const listener = (event: MouseEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [ref, handler]);
}

const Dropdown: React.FC<{
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}> = ({ value, options, placeholder, onChange, disabled, open: openProp, onOpenChange }) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined && onOpenChange !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref as React.RefObject<HTMLElement>, () => setOpen(false));
  const selectedLabel = value || placeholder;
  return (
    <div ref={ref} className={`relative w-full ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <button
        type="button"
        className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/70 text-dark-text text-base font-medium shadow-md border-none outline-none flex items-center justify-between transition-all duration-150 hover:bg-dark-bg/90 focus:bg-dark-bg/90 cursor-pointer ${open ? 'ring-2 ring-blue-400' : ''}`}
        onClick={() => setOpen(!open)}
        disabled={disabled}
      >
        <span className={value ? '' : 'text-dark-muted'}>{selectedLabel}</span>
        <span className={`ml-2 text-dark-accent text-lg transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-2 bg-dark-card rounded-2xl shadow-xl border border-dark-bg/40 max-h-60 overflow-y-auto animate-fade-in animate-scale-in custom-scrollbar">
          {options.length === 0 && (
            <div className="px-4 py-3 text-dark-muted text-sm">Нет вариантов</div>
          )}
          {options.map((opt: string) => (
            <div
              key={opt}
              className={`px-4 py-3 cursor-pointer text-base rounded-2xl transition-all select-none ${value === opt ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold' : 'hover:bg-dark-bg/70 text-dark-text'}`}
              onClick={() => { onChange(opt); setOpen(false); }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const InterestSelector: React.FC<InterestSelectorProps> = ({ selected, onChange }) => {
  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");
  const [tag, setTag] = useState<string>("");
  const [openSub, setOpenSub] = useState(false);
  const [openTag, setOpenTag] = useState(false);

  const catObj = INTEREST_CATEGORIES.find(c => c.category === category);
  const subObj = catObj?.subcategories.find(s => s.name === subcategory);

  const handleAddTag = () => {
    if (tag && !selected.includes(tag)) {
      onChange([...selected, tag]);
      setCategory("");
      setSubcategory("");
      setTag("");
    }
  };

  const handleRemove = (t: string) => {
    onChange(selected.filter(s => s !== t));
  };

  const handleReset = () => {
    setCategory("");
    setSubcategory("");
    setTag("");
    onChange([]);
  };

  // Для отображения пути
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

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in">
      {/* Выбранные фильтры и сброс */}
      <div className="flex flex-wrap gap-2 items-center mb-1">
        {selected.length > 0 && (
          <button className="px-3 py-1 rounded-full bg-dark-bg/60 text-dark-accent text-xs font-semibold shadow hover:bg-dark-accent/10 transition-all" onClick={handleReset} type="button">
            Сбросить фильтры
          </button>
        )}
        {selected.map(t => (
          <span key={t} className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-blue-500 to-cyan-400 text-white border-none shadow-sm animate-fade-in">
            {getInterestPath(t)}
            <button className="ml-1 text-white hover:text-red-300 transition-colors" onClick={() => handleRemove(t)} title="Удалить" style={{fontSize: '1.1em', lineHeight: 1}}>&times;</button>
          </span>
        ))}
      </div>
      {/* Категория */}
      <Dropdown
        value={category}
        options={INTEREST_CATEGORIES.map(cat => cat.category).sort((a, b) => a.localeCompare(b, 'ru'))}
        placeholder="Категория..."
        onChange={(v: string) => {
          setCategory(v);
          setSubcategory("");
          setTag("");
          setOpenSub(true);
        }}
      />
      {/* Подкатегория */}
      <Dropdown
        value={subcategory}
        options={catObj ? catObj.subcategories.map(sub => sub.name).sort((a, b) => a.localeCompare(b, 'ru')) : []}
        placeholder="Подкатегория..."
        onChange={(v: string) => {
          setSubcategory(v);
          setTag("");
          setOpenTag(true);
        }}
        disabled={!category}
        open={openSub}
        onOpenChange={setOpenSub}
      />
      {/* Тег */}
      <Dropdown
        value={tag}
        options={subObj ? subObj.tags.slice().sort((a, b) => a.localeCompare(b, 'ru')) : []}
        placeholder="Тег..."
        onChange={setTag}
        disabled={!subcategory}
        open={openTag}
        onOpenChange={setOpenTag}
      />
      {/* Кнопка добавить */}
      {tag && (
        <button
          className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow hover:opacity-90 active:scale-95 transition-all w-fit mx-auto disabled:opacity-50 disabled:cursor-not-allowed animate-fade-in"
          onClick={handleAddTag}
          type="button"
        >
          Добавить
        </button>
      )}
    </div>
  );
}; 