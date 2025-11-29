import React from "react";

// --- ConfirmModal ---
export function ConfirmModal({ text, onConfirm, onCancel }: { text: string, onConfirm: () => void, onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in overflow-x-hidden">
      <div className="bg-dark-card dark:bg-dark-card rounded-3xl shadow-2xl p-8 w-[90vw] max-w-xs flex flex-col gap-8 animate-fade-in scale-95 animate-scale-in border border-dark-bg/40 font-sans transition-all duration-300 overflow-x-hidden">
        <div className="text-lg text-dark-text mb-2 text-center font-semibold">{text}</div>
        <div className="flex gap-4 mt-2 justify-end">
          <button className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all text-base flex items-center justify-center gap-2" onClick={onConfirm}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" stroke="#fff" strokeWidth="1.5"/></svg>
            Удалить
          </button>
          <button className="flex-1 py-3 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all text-base flex items-center justify-center gap-2" onClick={onCancel}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#6b7280" strokeWidth="1.5"/></svg>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}