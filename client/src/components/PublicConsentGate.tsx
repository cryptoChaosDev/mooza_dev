import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ShieldCheck } from 'lucide-react';

interface Props {
  // Records the consent on the server and runs the gated action.
  onAccept: () => Promise<void> | void;
  onClose: () => void;
}

// Shown the first time a user publishes data for public distribution (service
// card / portfolio / public contacts) — 152-ФЗ ст. 10.1 consent. One-time.
export default function PublicConsentGate({ onAccept, onClose }: Props) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    try { await onAccept(); } finally { setSubmitting(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-4 border-b border-slate-800">
          <ShieldCheck size={18} className="text-primary-400 flex-shrink-0" />
          <h3 className="text-base font-semibold text-white flex-1">Публичное размещение</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors" aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-slate-300 leading-relaxed">
            Эти данные станут доступны неограниченному кругу лиц. Для публичного размещения нужно ваше согласие на обработку персональных данных, разрешённых для распространения.
          </p>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary-500 flex-shrink-0"
            />
            <span className="text-xs text-slate-300 leading-relaxed">
              Я даю{' '}
              <a href="/legal/consent-pd-public.html" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300 underline underline-offset-2">
                согласие на обработку персональных данных, разрешённых для распространения
              </a>.
            </span>
          </label>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">
            Отмена
          </button>
          <button
            onClick={confirm}
            disabled={!checked || submitting}
            className="flex-1 py-2.5 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />} Подтвердить
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
