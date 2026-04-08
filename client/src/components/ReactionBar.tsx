import React, { useRef, useState, useCallback } from 'react';

export const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

export interface Reaction {
  id: string;
  emoji: string;
  userId: string;
}

interface ReactionBarProps {
  reactions: Reaction[];
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

export function useDoubleTap(onDoubleTap: () => void) {
  const lastTap = useRef<number>(0);

  const handleClick = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      onDoubleTap();
    }
    lastTap.current = now;
  }, [onDoubleTap]);

  return { onClick: handleClick };
}

interface ReactionPickerPopupProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

function ReactionPickerPopup({ onSelect, onClose }: ReactionPickerPopupProps) {
  return (
    <div
      className="absolute z-50 bottom-full mb-2 left-0 bg-slate-800 border border-slate-700 rounded-2xl px-3 py-2 flex gap-1 shadow-xl"
      onMouseLeave={onClose}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => { onSelect(emoji); onClose(); }}
          className="text-xl hover:scale-125 transition-transform leading-none p-1"
          title={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function ReactionBar({ reactions, currentUserId, onReact, onUnreact }: ReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);
  const grouped = groupReactions(reactions);
  const myReaction = reactions.find((r) => r.userId === currentUserId);

  if (grouped.length === 0 && !showPicker) return null;

  return (
    <div className="relative flex flex-wrap items-center gap-1 mt-1">
      {showPicker && (
        <ReactionPickerPopup
          onSelect={(emoji) => {
            if (myReaction?.emoji === emoji) {
              onUnreact();
            } else {
              onReact(emoji);
            }
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {grouped.map(({ emoji, count, userIds }) => {
        const isMine = userIds.includes(currentUserId);
        return (
          <button
            key={emoji}
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
        );
      })}
      {/* Add reaction button */}
      <button
        onClick={() => setShowPicker((v) => !v)}
        className="flex items-center text-slate-500 hover:text-slate-300 text-sm px-1.5 py-0.5 rounded-full hover:bg-slate-700/50 transition-colors"
        title="Добавить реакцию"
      >
        <span>😊</span>
        <span className="text-xs ml-0.5">+</span>
      </button>
    </div>
  );
}

/** Wraps children with double-tap-to-react, shows picker on double-tap */
interface DoubleTapReactWrapperProps {
  reactions: Reaction[];
  currentUserId: string;
  onReact: (emoji: string) => void;
  onUnreact: () => void;
  children: React.ReactNode;
  className?: string;
}

export function DoubleTapReactWrapper({
  reactions,
  currentUserId,
  onReact,
  onUnreact,
  children,
  className,
}: DoubleTapReactWrapperProps) {
  const [showPicker, setShowPicker] = useState(false);
  const doubleTap = useDoubleTap(() => setShowPicker((v) => !v));
  const myReaction = reactions.find((r) => r.userId === currentUserId);

  return (
    <div className={`relative ${className ?? ''}`} {...doubleTap}>
      {children}
      {showPicker && (
        <div className="absolute z-50 top-full mt-1 left-0">
          <ReactionPickerPopup
            onSelect={(emoji) => {
              if (myReaction?.emoji === emoji) onUnreact();
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
