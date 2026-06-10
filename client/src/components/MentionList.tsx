import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import AvatarComponent from './Avatar';

export interface MentionItem {
  id: string;
  label: string;
  nickname?: string;
  avatar?: string;
}

interface Props {
  items: MentionItem[];
  command: (item: { id: string; label: string }) => void;
}

export interface MentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// Popup list for @-mention autocomplete (driven by TipTap's suggestion plugin).
const MentionList = forwardRef<MentionListHandle, Props>(({ items, command }, ref) => {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  const pick = (i: number) => {
    const item = items[i];
    if (item) command({ id: item.id, label: item.label });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;
      if (event.key === 'ArrowUp') { setSelected((i) => (i + items.length - 1) % items.length); return true; }
      if (event.key === 'ArrowDown') { setSelected((i) => (i + 1) % items.length); return true; }
      if (event.key === 'Enter') { pick(selected); return true; }
      return false;
    },
  }));

  if (!items.length) return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-h-56 overflow-y-auto w-64">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); pick(i); }}
          onMouseEnter={() => setSelected(i)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i === selected ? 'bg-slate-700/60' : 'hover:bg-slate-700/40'}`}
        >
          <AvatarComponent src={item.avatar} name={item.label} size={28} />
          <div className="min-w-0">
            <p className="text-sm text-white truncate">{item.label}</p>
            {item.nickname && <p className="text-xs text-slate-500 truncate">@{item.nickname}</p>}
          </div>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';
export default MentionList;
