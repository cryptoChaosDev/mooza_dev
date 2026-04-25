import { useState, useRef, useEffect } from 'react';

interface Props {
  label: string;
  children: React.ReactNode;
}

export default function BadgeTooltip({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex group">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center focus:outline-none"
        aria-label={label}
      >
        {children}
      </button>

      {/* Desktop: hover tooltip via CSS */}
      <span className="
        pointer-events-none hidden sm:block
        absolute bottom-full left-1/2 -translate-x-1/2 mb-2
        px-2 py-1 bg-slate-800 border border-slate-700
        text-white text-xs rounded-lg whitespace-nowrap shadow-xl z-50
        opacity-0 group-hover:opacity-100 transition-opacity duration-150
      ">
        {label}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </span>

      {/* Mobile: tap tooltip */}
      {open && (
        <span className="
          sm:hidden
          absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          px-2 py-1 bg-slate-800 border border-slate-700
          text-white text-xs rounded-lg whitespace-nowrap shadow-xl z-50
        ">
          {label}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </span>
      )}
    </div>
  );
}
