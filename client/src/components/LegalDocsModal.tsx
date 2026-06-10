import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, ChevronLeft, Loader2 } from 'lucide-react';

// Legal documents are pre-converted to HTML in /public/legal (see manifest.json).
const DOCS: { slug: string; title: string }[] = [
  { slug: 'user-agreement', title: 'Пользовательское соглашение' },
  { slug: 'privacy-policy', title: 'Политика конфиденциальности' },
  { slug: 'consent-pd', title: 'Согласие на обработку персональных данных' },
  { slug: 'consent-pd-public', title: 'Согласие на обработку ПДн для публичного распространения' },
  { slug: 'consent-marketing', title: 'Согласие на рекламные и информационные рассылки' },
  { slug: 'safe-deal-rules', title: 'Правила безопасной сделки' },
  { slug: 'payment-rules', title: 'Правила оплаты' },
  { slug: 'moderation-rules', title: 'Правила модерации' },
];

export default function LegalDocsModal({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<{ slug: string; title: string } | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setLoading(true);
    setContent('');
    fetch(`/legal/${active.slug}.html`)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((t) => { if (alive) setContent(t); })
      .catch(() => { if (alive) setContent('<p>Не удалось загрузить документ. Попробуйте позже.</p>'); })
      // Note: no `alive` gate here — a stale `loading: true` after going back
      // mid-fetch left the next view blank (the "back to an empty window" bug).
      .finally(() => setLoading(false));
    return () => { alive = false; };
  }, [active]);

  const goBack = () => { setActive(null); setContent(''); setLoading(false); };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800 flex-shrink-0">
          {active ? (
            <button
              onClick={goBack}
              className="p-1.5 -ml-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Назад к списку"
            >
              <ChevronLeft size={20} />
            </button>
          ) : (
            <FileText size={18} className="text-primary-400 flex-shrink-0" />
          )}
          <h3 className="text-sm sm:text-base font-semibold text-white flex-1 truncate">
            {active ? active.title : 'Документы'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body. The list stays mounted (just hidden) so «Назад» always returns
            to a live element — remounting it raced with in-flight fetch state
            and could leave the modal blank. */}
        <div className={`overflow-y-auto overscroll-contain p-2 sm:p-3 ${active ? 'hidden' : ''}`}>
          {DOCS.map((d) => (
            <button
              key={d.slug}
              onClick={() => setActive(d)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-slate-800/60 transition-colors"
            >
              <FileText size={16} className="text-slate-500 flex-shrink-0" />
              <span className="text-sm text-slate-200">{d.title}</span>
            </button>
          ))}
        </div>
        {active && (
          loading || !content ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <Loader2 size={26} className="animate-spin text-slate-500" />
            </div>
          ) : (
            <div
              key={active.slug}
              className="overflow-y-auto overscroll-contain px-5 py-4 legal-prose"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )
        )}
      </div>
    </div>,
    document.body
  );
}
