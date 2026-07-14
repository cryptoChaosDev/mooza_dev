import { createPortal } from 'react-dom';
import { X, Sparkles } from 'lucide-react';
import { CHANGELOG, type ChangelogGroup } from '../lib/changelog';
import { useScrollLock } from "../lib/scrollLock";

interface Props { onClose: () => void; }

// Пункты группы с цветным маркером: + новое · ↻ изменено · − убрано
function GroupItems({ group }: { group: ChangelogGroup }) {
  const rows: { marker: string; color: string; text: string }[] = [
    ...(group.added ?? []).map(text => ({ marker: '+', color: 'text-emerald-400', text })),
    ...(group.changed ?? []).map(text => ({ marker: '↻', color: 'text-sky-400', text })),
    ...(group.removed ?? []).map(text => ({ marker: '−', color: 'text-red-400', text })),
  ];
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-300 leading-snug">
          <span className={`flex-shrink-0 font-bold w-3.5 text-center ${r.color}`}>{r.marker}</span>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ChangelogModal({ onClose }: Props) {
  useScrollLock(true);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[62] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[63] bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[85dvh] flex flex-col" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 mb-4 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 mb-2 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles size={20} className="text-primary-400" />
            <h2 className="text-base font-bold text-white">Что нового</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Легенда маркеров */}
        <p className="px-5 mb-3 text-[11px] text-slate-500 flex-shrink-0">
          <span className="text-emerald-400 font-bold">+</span> новое ·{' '}
          <span className="text-sky-400 font-bold">↻</span> изменено ·{' '}
          <span className="text-red-400 font-bold">−</span> убрано
        </p>

        <div className="px-5 space-y-7 overflow-y-auto">
          {CHANGELOG.map((entry) => (
            <div key={entry.version}>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-sm font-bold text-white">Версия {entry.version}</span>
                <span className="text-xs text-slate-500">{entry.date}</span>
              </div>
              <div className="space-y-4">
                {entry.groups.map((group) => (
                  <div key={group.title}>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-primary-400/90 mb-1.5">
                      {group.title}
                    </p>
                    <GroupItems group={group} />
                  </div>
                ))}
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
