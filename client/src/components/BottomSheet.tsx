import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { lockScroll, unlockScroll } from '../lib/scrollLock';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  height?: 'auto' | 'half' | 'full';
}

export default function BottomSheet({ isOpen, onClose, title, children, height = 'half' }: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      lockScroll();
    } else {
      unlockScroll();
    }
    return () => {
      unlockScroll();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // dvh не поддерживается до iOS 16.4 — используем vh
  const heightClasses = {
    auto: 'max-h-[90vh]',
    half: 'h-[50vh]',
    full: 'h-[90vh]',
  };

  const sheet = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] animate-fadeIn"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-3xl shadow-2xl z-[61] animate-slideUp flex flex-col ${heightClasses[height]}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 flex-shrink-0">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700/50 rounded-xl transition-all"
          >
            <X size={22} className="text-slate-400" />
          </button>
        </div>

        {/* Content — -webkit-overflow-scrolling для инерционного скролла на iOS */}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
