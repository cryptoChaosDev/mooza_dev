import { useEffect, useSyncExternalStore } from 'react';
import { Play, Square, Loader2 } from 'lucide-react';
import { subscribeDemo, getDemoState, toggleDemo, stopDemoIfKey, DEMO_LIMIT_SEC } from '../lib/demoPlayer';

interface Props {
  /** Уникальный ключ карточки (у исполнителя может быть несколько карточек услуг). */
  playerKey: string;
  demo: { url: string; title?: string | null };
  className?: string;
}

const SIZE = 28;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * Кнопка ▶ на карточке каталога: первые 30 секунд демо прямо в выдаче.
 * Один глобальный плеер (lib/demoPlayer); прогресс — кольцом вокруг кнопки.
 * Ставится РЯДОМ со ссылкой карточки (не внутри <a>), тап не открывает карточку.
 */
export default function CatalogDemoButton({ playerKey, demo, className = '' }: Props) {
  const st = useSyncExternalStore(subscribeDemo, getDemoState, getDemoState);
  const active = st.key === playerKey && st.status !== 'idle';
  const loading = active && st.status === 'loading';
  const progress = active ? st.progress : 0;

  // Ушли со страницы / карточка пропала из выдачи — не играем «в фоне».
  useEffect(() => () => stopDemoIfKey(playerKey), [playerKey]);

  const title = demo.title?.trim() || 'Демо';
  const label = active ? `Остановить демо «${title}»` : `Слушать демо «${title}» (${DEMO_LIMIT_SEC} с)`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // строго синхронно в обработчике тапа — требование iOS Safari
        toggleDemo(playerKey, demo.url);
      }}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`relative flex items-center justify-center rounded-full bg-slate-950 shadow-md shadow-black/40 ${className}`}
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-slate-700" />
        {active && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            className="text-primary-400 transition-[stroke-dashoffset] duration-200 ease-linear"
          />
        )}
      </svg>
      <span className={`relative flex items-center justify-center w-5 h-5 rounded-full ${active ? 'bg-primary-600' : 'bg-primary-600/90'}`}>
        {loading
          ? <Loader2 size={11} className="text-white animate-spin" />
          : active
            ? <Square size={8} className="text-white" fill="currentColor" />
            : <Play size={10} className="text-white translate-x-[0.5px]" fill="currentColor" />}
      </span>
    </button>
  );
}
