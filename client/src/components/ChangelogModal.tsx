import { createPortal } from 'react-dom';
import { X, Sparkles, Plus, RefreshCw, Minus } from 'lucide-react';
import { CHANGELOG, type ChangelogEntry } from '../lib/changelog';

interface Props { onClose: () => void; }

const SECTIONS: { key: keyof Pick<ChangelogEntry, 'added' | 'changed' | 'removed'>; label: string; Icon: typeof Plus; color: string }[] = [
  { key: 'added',   label: 'Добавлено', Icon: Plus,      color: 'text-emerald-400' },
  { key: 'changed', label: 'Изменено',  Icon: RefreshCw, color: 'text-sky-400' },
  { key: 'removed', label: 'Удалено',   Icon: Minus,     color: 'text-red-400' },
];

export default function ChangelogModal({ onClose }: Props) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-[62] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[63] bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[85vh] flex flex-col" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 mb-4 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 mb-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles size={20} className="text-primary-400" />
            <h2 className="text-base font-bold text-white">Что нового</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="px-5 space-y-6 overflow-y-auto">
          {CHANGELOG.map((entry) => (
            <div key={entry.version}>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-sm font-bold text-white">Версия {entry.version}</span>
                <span className="text-xs text-slate-500">{entry.date}</span>
              </div>
              <div className="space-y-3.5">
                {SECTIONS.map(({ key, label, Icon, color }) => {
                  const items = entry[key];
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={key}>
                      <div className={`flex items-center gap-1.5 mb-1.5 ${color}`}>
                        <Icon size={13} strokeWidth={2.5} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {items.map((it, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-300 leading-snug">
                            <span className={`flex-shrink-0 ${color}`}>•</span>
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-center text-xs text-slate-600 pt-1 pb-2">Спасибо, что вы с Moooza 💜</p>
        </div>
      </div>
    </>,
    document.body
  );
}
