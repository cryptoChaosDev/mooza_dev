import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Горизонтальная лента чипов. На телефоне — обычный свайп; на компьютере
 * (где у ленты нет полосы прокрутки, а колесо крутит страницу) — колесо мыши
 * листает вбок, ленту можно тянуть мышью, по краям — стрелки и затухание.
 * `fadeFrom` — цвет фона под лентой (класс Tailwind from-…).
 */
export default function HorizontalScroller({
  children, className = '', fadeFrom = 'from-slate-950',
}: { children: ReactNode; className?: string; fadeFrom?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    // Колесо мыши: вертикальную прокрутку превращаем в горизонтальную, пока ленте
    // есть куда листать (на краях — отдаём странице).
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', onWheel);
      ro?.disconnect();
    };
  }, [update]);

  // Перетаскивание мышью (тач — нативный свайп). Если тянули — клик по чипу гасим.
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !ref.current) return;
    drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 5) d.moved = true;
    if (d.moved) ref.current.scrollLeft = d.left - dx;
  };
  const endDrag = () => { setTimeout(() => { drag.current = null; }, 0); };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) { e.preventDefault(); e.stopPropagation(); }
  };

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        className="overflow-x-auto scrollbar-none overscroll-x-contain select-none"
      >
        <div className="flex gap-1.5 w-max">{children}</div>
      </div>
      {edges.left && (
        <>
          <div aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r ${fadeFrom} to-transparent`} />
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Листать влево"
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-200 hover:text-white shadow-lg"
          >
            <ChevronLeft size={16} />
          </button>
        </>
      )}
      {edges.right && (
        <>
          <div aria-hidden className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l ${fadeFrom} to-transparent`} />
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Листать вправо"
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-200 hover:text-white shadow-lg"
          >
            <ChevronRight size={16} />
          </button>
        </>
      )}
    </div>
  );
}
