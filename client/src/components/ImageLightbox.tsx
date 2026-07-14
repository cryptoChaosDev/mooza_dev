import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import { useScrollLock } from '../lib/scrollLock';

// Полноэкранный просмотр картинки: тап по фону/крестик/Escape — закрыть,
// кнопка скачивания сверху. Используется в чате; переиспользуем где нужно.
export default function ImageLightbox({ src, name, onClose }: {
  src: string;
  name?: string | null;
  onClose: () => void;
}) {
  useScrollLock(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center" onClick={onClose}>
      <div
        className="absolute top-0 inset-x-0 z-10 flex items-center justify-end gap-1.5 p-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <a
          href={src}
          download={name || true}
          onClick={e => e.stopPropagation()}
          className="p-2.5 text-slate-200 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          title="Скачать"
        >
          <Download size={20} />
        </a>
        <button
          onClick={onClose}
          className="p-2.5 text-slate-200 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          title="Закрыть"
        >
          <X size={20} />
        </button>
      </div>
      <img
        src={src}
        alt={name || ''}
        className="max-w-full max-h-[100dvh] object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
