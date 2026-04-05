import { useEffect, useRef } from 'react';

const EMOJI_GROUPS = [
  {
    label: 'Эмоции',
    emojis: ['😀','😂','🥲','😊','😍','🤩','🥳','😎','🤔','😏','😮','😢','😭','🤣','😅','😆','😇','🤗','😘','🥰','😜','😝','🤭','🤫','😴','🤯','🥺','😤','😠','🤬','😱','😨'],
  },
  {
    label: 'Жесты',
    emojis: ['👍','👎','👏','🙌','🤝','👋','✌️','🤞','🙏','💪','🤙','☝️','👆','👇','👉','👈','🤘','🖐️','✋','🤚','🖖'],
  },
  {
    label: 'Музыка',
    emojis: ['🎵','🎶','🎸','🎹','🎺','🎻','🥁','🪘','🎤','🎧','🎼','🎙️','🎚️','🎛️','📻','🪗','🪕','🎷','🪈','🎉','🔊','🔔'],
  },
  {
    label: 'Символы',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💖','💗','💓','💞','💝','🔥','⭐','💫','✨','🌟','💡','🎯','🏆','🥇','💎','🎁','🎊'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 w-72"
    >
      <div className="max-h-64 overflow-y-auto space-y-3 scrollbar-hide">
        {EMOJI_GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-xs text-slate-500 font-medium mb-1.5 px-1">{group.label}</p>
            <div className="flex flex-wrap gap-0.5">
              {group.emojis.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onSelect(emoji); }}
                  className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-800 rounded-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
