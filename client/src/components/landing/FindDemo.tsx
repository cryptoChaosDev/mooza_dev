import { useEffect, useRef, useState } from 'react';
import { m, useInView, useReducedMotion } from 'framer-motion';
import { ArrowUp, CalendarDays, Check, Drum, Loader2, MapPin, Music2, Sparkles, Wallet } from 'lucide-react';
import { EASE, MockAvatar } from './ui';

/**
 * Декоративная демонстрация «Ищу музыканта»: фраза печатается в поле, затем
 * выскакивают чипы разбора и итог «Отправлено N исполнителям». Без запросов к
 * API. Крутится, только пока блок на экране; prefers-reduced-motion — сразу
 * финальный кадр без анимации.
 */

const PHRASE = 'Нужен барабанщик на концерт 20\u00a0ноября в\u00a0Самаре, метал, до\u00a010\u00a0тысяч';

const CHIPS = [
  { icon: Drum, label: 'Барабанщик', accent: true },
  { icon: MapPin, label: 'Самара' },
  { icon: CalendarDays, label: '20.11' },
  { icon: Music2, label: 'Метал' },
  { icon: Wallet, label: 'до\u00a010\u00a0000\u00a0₽' },
];

const PEOPLE: Array<[string, string, string]> = [
  ['АМ', '#40d6f0', '#3b82f6'],
  ['ДК', '#966cf6', '#ec4899'],
  ['ИС', '#22d3ee', '#966cf6'],
  ['+5', '#1e293b', '#334155'],
];

const PHASES = ['typing', 'parsing', 'chips', 'sending', 'sent'] as const;
type Phase = typeof PHASES[number];

export default function FindDemo() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [typed, setTyped] = useState(reduce ? PHRASE.length : 0);
  const [phase, setPhase] = useState<Phase>(reduce ? 'sent' : 'typing');
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduce) {
      setTyped(PHRASE.length);
      setPhase('sent');
      return;
    }
    if (!inView) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };

    setPhase('typing');
    setTyped(0);
    let t = 500;
    for (let i = 1; i <= PHRASE.length; i++) {
      const ch = PHRASE[i - 1];
      t += ch === ',' ? 190 : ch === ' ' || ch === '\u00a0' ? 60 : 36;
      at(t, () => setTyped(i));
    }
    at(t + 380, () => setPhase('parsing'));
    at(t + 1150, () => setPhase('chips'));
    at(t + 1150 + CHIPS.length * 140 + 650, () => setPhase('sending'));
    at(t + 1150 + CHIPS.length * 140 + 650 + 1300, () => setPhase('sent'));
    at(t + 1150 + CHIPS.length * 140 + 650 + 1300 + 3800, () => setCycle((c) => c + 1));
    return () => timers.forEach(clearTimeout);
  }, [inView, cycle, reduce]);

  const reached = (p: Phase) => PHASES.indexOf(phase) >= PHASES.indexOf(p);
  const typing = phase === 'typing';

  return (
    <div ref={ref} className="relative" aria-label="Пример: запрос одной фразой превращается в параметры поиска и отправляется подходящим исполнителям" role="img">
      <div className="rounded-[22px] bg-slate-950/70 p-3.5 sm:p-4 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.1)]">
        {/* Шапка «окна» */}
        <div className="flex items-center justify-between gap-3 px-1 pb-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <Sparkles size={13} className="text-[#40d6f0]" />
            Ищу музыканта
          </span>
          <span className="text-[11px] text-slate-500 truncate">moooza.ru/find</span>
        </div>

        {/* Поле ввода: невидимая полная фраза держит высоту — без прыжков */}
        <div className={`relative rounded-2xl bg-slate-900/90 px-4 pt-3.5 pb-12 transition-shadow duration-500 ${
          typing ? 'shadow-[inset_0_0_0_1px_rgba(64,214,240,0.45),0_0_0_4px_rgba(64,214,240,0.08)]' : 'shadow-[inset_0_0_0_1px_rgba(148,163,184,0.14)]'
        }`}>
          <div className="grid text-[15px] sm:text-base leading-relaxed">
            <span aria-hidden className="invisible col-start-1 row-start-1">{PHRASE}</span>
            <span className="col-start-1 row-start-1 text-slate-100">
              {PHRASE.slice(0, typed)}
              {(phase === 'typing' || phase === 'parsing') && (
                <span aria-hidden className="lp-caret inline-block w-[2px] h-[1.05em] -mb-[0.15em] ml-[1px] rounded-full bg-[#40d6f0]" />
              )}
            </span>
          </div>
          <span
            aria-hidden
            className={`absolute right-2.5 bottom-2.5 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
              reached('parsing') ? 'bg-white text-slate-950 scale-100' : 'bg-slate-800 text-slate-500 scale-95'
            }`}
          >
            {phase === 'parsing'
              ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" />
              : <ArrowUp size={17} strokeWidth={2.4} />}
          </span>
        </div>

        {/* Чипы разбора: в DOM всегда (невидимы до разбора) — высота не прыгает */}
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((c, i) => {
              const shown = reached('chips');
              return (
                <m.span
                  key={c.label}
                  initial={false}
                  animate={shown ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 6, scale: 0.9 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.42, delay: shown ? i * 0.14 : 0, ease: EASE }}
                  className={`inline-flex items-center gap-1.5 h-7 pl-2.5 pr-3 rounded-full text-[12.5px] font-medium whitespace-nowrap ${
                    c.accent
                      ? 'bg-gradient-to-r from-[#40d6f0]/20 to-[#966cf6]/25 text-white shadow-[inset_0_0_0_1px_rgba(64,214,240,0.4)]'
                      : 'bg-slate-800/80 text-slate-200 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]'
                  }`}
                >
                  <c.icon size={13} className={c.accent ? 'text-[#40d6f0]' : 'text-slate-400'} />
                  {c.label}
                </m.span>
              );
            })}
          </div>
        </div>

        {/* Итог */}
        <div className="mt-3 min-h-[68px] sm:min-h-[60px] rounded-2xl bg-slate-900/60 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)] pl-3 pr-3 py-2.5 flex items-center gap-3 overflow-hidden">
          <span
            aria-hidden
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-500 ${
              phase === 'sent' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {phase === 'sent'
              ? <Check size={16} strokeWidth={3} />
              : phase === 'sending' || phase === 'parsing'
                ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" />
                : <Sparkles size={14} />}
          </span>
          <div className="min-w-0 flex-1">
            {phase === 'sent' ? (
              <m.div
                key="sent"
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <p className="text-[13.5px] sm:text-sm font-semibold leading-snug text-white">Отправлено 8&nbsp;исполнителям</p>
                <p className="mt-0.5 text-[11.5px] text-slate-400 truncate">Отклики придут в&nbsp;уведомления и&nbsp;чат</p>
              </m.div>
            ) : (
              <p className={`text-[13.5px] sm:text-sm leading-snug ${phase === 'sending' ? 'text-slate-200' : 'text-slate-500'}`}>
                {phase === 'typing' ? 'Опишите, кого ищете' : phase === 'sending' ? 'Подбираем исполнителей…' : 'Разбираем запрос…'}
              </p>
            )}
          </div>
          <div className="hidden sm:flex -space-x-2 flex-shrink-0">
            {PEOPLE.map(([ini, from, to], i) => (
              <m.span
                key={ini}
                initial={false}
                animate={reached('sending') ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
                transition={reduce ? { duration: 0 } : { duration: 0.35, delay: reached('sending') && !reached('sent') ? i * 0.16 : 0, ease: EASE }}
                className="rounded-full ring-2 ring-slate-950"
              >
                <MockAvatar initials={ini} from={from} to={to} className="w-7 h-7 text-[9.5px]" />
              </m.span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
