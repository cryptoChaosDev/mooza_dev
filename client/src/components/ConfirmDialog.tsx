import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, message = 'Вы точно хотите удалить?', confirmLabel = 'Удалить', onConfirm, onCancel }: Props) {
  if (!open) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-x-4 bottom-8 z-[81] max-w-sm mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-red-500/15 rounded-xl flex-shrink-0">
            <Trash2 size={18} className="text-red-400" />
          </div>
          <p className="text-sm text-slate-200 leading-relaxed pt-1">{message}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => { onConfirm(); onCancel(); }}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
