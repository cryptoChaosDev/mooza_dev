import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';

// Должен совпадать с REACTION_EMOJIS в server/src/routes/posts.ts (серверный whitelist)
export const REACTION_EMOJIS = ['👍', '👎', '👌', '😢', '😂', '🔥', '❤️'];

export interface Reaction {
  id: string;
  emoji: string;
  userId: string;
}

/** Сводка реакций поста с сервера: { emoji, count } без списка пользователей. */
export interface ReactionSummaryItem {
  emoji: string;
  count: number;
}

interface ReactionBarProps {
  /** Полный список реакций (комментарии). */
  reactions?: Reaction[];
  /** Сводка (посты в ленте) — если передана, используется вместо reactions. */
  summary?: ReactionSummaryItem[];
  /** Моя реакция при использовании summary. */
  myEmoji?: string | null;
  currentUserId: string;
  onReact: (emoji: string) => void;
  onUnreact: () => void;
  /** Called on double-tap/double-click — toggles picker */
  targetRef?: React.RefObject<HTMLElement>;
}

/** Groups reactions by emoji and returns sorted list */
export function groupReactions(reactions: Reaction[]) {
  const map = new Map<string, string[]>();
  for (const r of reactions) {
    if (!map.has(r.emoji)) map.set(r.emoji, []);
    map.get(r.emoji)!.push(r.userId);
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
}

// Двойной тап по кнопкам/ссылкам/полям (опрос, CTA, «Читать полностью») —
// это обычные клики, а не жест реакции.
const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, label, audio, video, [role="button"], [data-no-doubletap]';

export function useDoubleTap(onDoubleTap: () => void) {
  const lastTap = useRef<number>(0);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(INTERACTIVE_SELECTOR)) { lastTap.current = 0; return; }
    const now = Date.now();
    if (now - lastTap.current < 350) {
      lastTap.current = 0;
      onDoubleTap();
      return;
    }
    lastTap.current = now;
  }, [onDoubleTap]);

  return { onClick: handleClick };
}

interface ReactionPickerPopupProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /** Тапы внутри этого элемента не закрывают попап (кнопка-переключатель, сама карточка). */
  ignoreRef?: React.RefObject<HTMLElement>;
}

function ReactionPickerPopup({ onSelect, onClose, ignoreRef }: ReactionPickerPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [shift, setShift] = useState(0);

  // Не вылезать за край экрана (320px): сдвигаем по горизонтали.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    let dx = 0;
    if (r.right > vw - pad) dx = vw - pad - r.right;
    if (r.left + dx < pad) dx = pad - r.left;
    setShift(dx);
  }, []);

  // Закрытие по тапу вне попапа (на таче mouseleave не бывает) и по Escape.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || ignoreRef?.current?.contains(t)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ignoreRef]);

  return (
    <div
      ref={ref}
      className="absolute z-50 bottom-full mb-2 left-0 bg-slate-800 border border-slate-700 rounded-2xl px-2 py-1.5 flex flex-wrap gap-0.5 shadow-xl max-w-[calc(100vw-1rem)]"
      style={shift ? { transform: `translateX(${shift}px)` } : undefined}
      onMouseLeave={onClose}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(emoji); onClose(); }}
          className="text-xl hover:scale-125 transition-transform leading-none p-1"
          title={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function ReactionBar({ reactions = [], summary, myEmoji, currentUserId, onReact, onUnreact }: ReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const grouped = summary
    ? summary.filter((s) => s.count > 0).map((s) => ({ emoji: s.emoji, count: s.count, isMine: s.emoji === myEmoji }))
    : groupReactions(reactions).map((g) => ({ emoji: g.emoji, count: g.count, isMine: g.userIds.includes(currentUserId) }));
  const myReaction = summary ? (myEmoji ?? null) : (reactions.find((r) => r.userId === currentUserId)?.emoji ?? null);

  // Кнопка «😊+» видна всегда — иначе при 0 реакций поставить первую нечем.
  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-1 mt-1">
      {showPicker && (
        <ReactionPickerPopup
          ignoreRef={containerRef}
          onSelect={(emoji) => {
            if (myReaction === emoji) {
              onUnreact();
            } else {
              onReact(emoji);
            }
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {grouped.map(({ emoji, count, isMine }) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            if (isMine) onUnreact();
            else onReact(emoji);
          }}
          className={`flex items-center gap-0.5 text-sm px-2 py-0.5 rounded-full border transition-colors ${
            isMine
              ? 'bg-indigo-600/40 border-indigo-500/60 text-white'
              : 'bg-slate-700/50 border-slate-600/40 text-slate-300 hover:bg-slate-600/60'
          }`}
        >
          <span>{emoji}</span>
          <span className="text-xs font-medium">{count}</span>
        </button>
      ))}
      {/* Add reaction button */}
      <button
        type="button"
        onClick={() => setShowPicker((v) => !v)}
        className="flex items-center text-slate-500 hover:text-slate-300 text-sm px-1.5 py-0.5 rounded-full hover:bg-slate-700/50 transition-colors"
        title="Добавить реакцию"
        aria-label="Добавить реакцию"
      >
        <span>😊</span>
        <span className="text-xs ml-0.5">+</span>
      </button>
    </div>
  );
}

/** Wraps children with double-tap-to-react, shows picker on double-tap */
interface DoubleTapReactWrapperProps {
  reactions?: Reaction[];
  /** Моя реакция (если известна напрямую — посты со сводкой). */
  myEmoji?: string | null;
  currentUserId: string;
  onReact: (emoji: string) => void;
  onUnreact: () => void;
  children: React.ReactNode;
  className?: string;
}

export function DoubleTapReactWrapper({
  reactions = [],
  myEmoji,
  currentUserId,
  onReact,
  onUnreact,
  children,
  className,
}: DoubleTapReactWrapperProps) {
  const [showPicker, setShowPicker] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const doubleTap = useDoubleTap(() => setShowPicker((v) => !v));
  const myReaction = myEmoji !== undefined ? myEmoji : (reactions.find((r) => r.userId === currentUserId)?.emoji ?? null);

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`} {...doubleTap}>
      {children}
      {showPicker && (
        <div className="absolute z-50 top-full mt-1 left-0">
          <ReactionPickerPopup
            ignoreRef={wrapperRef}
            onSelect={(emoji) => {
              if (myReaction === emoji) onUnreact();
              else onReact(emoji);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}
    </div>
  );
}
