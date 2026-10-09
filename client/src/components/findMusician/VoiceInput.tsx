import { forwardRef, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Mic, Square, Loader2, Check, X } from 'lucide-react';
import type { VoiceRecorderStatus } from '../../lib/voiceRecording';

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * Кнопка микрофона в поле «Опишите, кого ищете» (тач-цель 44×44).
 * idle — начать запись; recording — остановить («Готово»); starting/transcribing — ждём.
 */
export const MicButton = forwardRef<HTMLButtonElement, {
  status: VoiceRecorderStatus;
  transcribing: boolean;
  onStart: () => void;
  onStop: () => void;
}>(function MicButton({ status, transcribing, onStart, onStop }, ref) {
  const recording = status === 'recording';
  const busy = status === 'starting' || transcribing;
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => { if (busy) return; if (recording) onStop(); else onStart(); }}
      aria-disabled={busy || undefined}
      aria-label={recording ? 'Остановить запись' : 'Сказать голосом'}
      title={recording ? 'Остановить запись' : 'Сказать голосом'}
      className={`absolute right-1.5 bottom-1.5 w-11 h-11 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
        recording
          ? 'bg-red-500 hover:bg-red-400 text-white'
          : busy
            ? 'bg-slate-700/60 text-slate-400 cursor-wait'
            : 'bg-slate-700/60 hover:bg-primary-600 text-slate-200 hover:text-white'
      }`}
    >
      {busy
        ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" />
        : recording ? <Square size={15} fill="currentColor" /> : <Mic size={19} />}
    </button>
  );
});

const BARS = 28;
const SAMPLE_MS = 70;

/**
 * Волна по уровню громкости: AnalyserNode → RMS → полоски (последние ~2 с).
 * Рисуется через style.transform, без перерисовки React. Без анализатора
 * (старый Safari) или при prefers-reduced-motion — статичные полоски.
 */
function VoiceWave({ analyserRef }: { analyserRef: MutableRefObject<AnalyserNode | null> }) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const history = new Array<number>(BARS).fill(0);
    const makeBuf = (n: number) => new Uint8Array(new ArrayBuffer(n));
    let buf: ReturnType<typeof makeBuf> | null = null;
    let raf = 0;
    let lastSample = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - lastSample < SAMPLE_MS) return;
      lastSample = t;
      const analyser = analyserRef.current;
      let level = 0;
      if (analyser) {
        if (!buf || buf.length !== analyser.fftSize) buf = makeBuf(analyser.fftSize);
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        level = Math.min(1, Math.sqrt(Math.sqrt(sum / buf.length)) * 1.6);
      }
      history.shift();
      history.push(level);
      for (let i = 0; i < BARS; i++) {
        const el = barsRef.current[i];
        if (el) el.style.transform = `scaleY(${(0.12 + 0.88 * history[i]).toFixed(3)})`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef]);

  return (
    <div className="flex items-center gap-[3px] h-8" aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          className="flex-1 h-full rounded-full bg-primary-400/80 origin-center transition-transform duration-75"
          style={{ transform: 'scaleY(0.12)' }}
        />
      ))}
    </div>
  );
}

/**
 * Панель под полем: запись (точка, таймер 0:07 / 0:30, волна, «Отмена»/«Готово»),
 * включение микрофона и «Распознаём…».
 */
export function VoicePanel({
  status,
  startedAt,
  maxSeconds,
  analyserRef,
  transcribing,
  onDone,
  onCancel,
}: {
  status: VoiceRecorderStatus;
  startedAt: number | null;
  maxSeconds: number;
  analyserRef: MutableRefObject<AnalyserNode | null>;
  transcribing: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const recording = status === 'recording';

  useEffect(() => {
    if (!recording) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [recording]);

  if (transcribing || status === 'starting') {
    return (
      <div role="status" aria-live="polite" className="rounded-2xl border border-slate-700 bg-slate-800/60 px-3 py-3 flex items-center gap-2 text-sm text-slate-200">
        <Loader2 size={16} className="animate-spin motion-reduce:animate-none text-primary-400 flex-shrink-0" />
        {transcribing ? 'Распознаём…' : 'Включаем микрофон…'}
      </div>
    );
  }
  if (!recording) return null;

  const elapsed = Math.min(maxSeconds, Math.max(0, (now - (startedAt ?? now)) / 1000));
  return (
    <div role="group" aria-label="Запись голоса" className="rounded-2xl border border-red-500/30 bg-slate-800/60 p-3 space-y-3">
      <span className="sr-only" role="status">Идёт запись. Скажите, кого ищете, и нажмите «Готово».</span>
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-3 w-3 flex-shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping motion-reduce:animate-none" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
        <span className="text-sm font-medium text-white">Говорите…</span>
        <span className="ml-auto text-sm tabular-nums text-slate-200">
          {fmt(elapsed)} <span className="text-slate-500">/ {fmt(maxSeconds)}</span>
        </span>
      </div>
      <VoiceWave analyserRef={analyserRef} />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
        >
          <X size={16} /> Отмена
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-[44px] rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Check size={16} /> Готово
        </button>
      </div>
    </div>
  );
}
