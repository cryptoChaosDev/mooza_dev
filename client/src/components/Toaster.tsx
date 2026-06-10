import { useToastStore, type ToastType } from '../stores/toastStore';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';

const STYLES: Record<ToastType, { Icon: typeof AlertCircle; cls: string }> = {
  error:   { Icon: AlertCircle,  cls: 'border-red-500/40 bg-red-950/85 text-red-50' },
  success: { Icon: CheckCircle2, cls: 'border-emerald-500/40 bg-emerald-950/85 text-emerald-50' },
  info:    { Icon: Info,         cls: 'border-slate-600 bg-slate-800/90 text-slate-100' },
};

// Global toast outlet — mounted once at the app root. Errors/success from any
// add/edit/delete action surface here so the user sees what happened.
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pointer-events-none">
      {toasts.map((t) => {
        const { Icon, cls } = STYLES[t.type];
        return (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto w-full max-w-md flex items-start gap-2.5 px-4 py-3 rounded-xl border backdrop-blur shadow-2xl ${cls}`}
          >
            <Icon size={18} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm leading-snug flex-1 break-words">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Закрыть"
              className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
