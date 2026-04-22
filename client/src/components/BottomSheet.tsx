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

  const isFullscreen = height === 'full';

  const sheet = isFullscreen ? (
    // Полноэкранный режим — фиксируется на весь экран, клавиатура не сдвигает контент
    <div
      className="fixed inset-0 bg-slate-900 z-[61] flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800 flex-shrink-0">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-all">
          <X size={20} className="text-slate-400" />
        </button>
      </div>
      {/* Content */}
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  ) : (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] animate-fadeIn"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-3xl shadow-2xl z-[61] animate-slideUp flex flex-col ${height === 'half' ? 'h-[50vh]' : 'max-h-[90vh]'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 flex-shrink-0">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700/50 rounded-xl transition-all">
            <X size={22} className="text-slate-400" />
          </button>
        </div>
        {/* Content */}
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
