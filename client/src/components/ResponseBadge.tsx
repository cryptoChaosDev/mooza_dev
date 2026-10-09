import { Zap, Clock } from 'lucide-react';
import BadgeTooltip from './BadgeTooltip';

// «Отвечает быстро»: сервер отдаёт только категорию responseBadge
// ('fast' — медиана первого ответа ≤ 1 ч, 'day' — ≤ 24 ч; не меньше 5 диалогов
// за 90 дней). Минут гостю нет — их и не показываем.

export type ResponseBadgeValue = 'fast' | 'day' | null | undefined;

const LABELS = {
  fast: { text: 'Отвечает быстро', hint: 'Обычно отвечает в течение часа' },
  day: { text: 'Отвечает в течение дня', hint: 'Обычно отвечает в течение суток' },
} as const;

/** Плашка рядом с именем в профиле (с подсказкой по тапу/наведению). */
export function ResponseBadgePill({ value }: { value: ResponseBadgeValue }) {
  if (value !== 'fast' && value !== 'day') return null;
  const { text, hint } = LABELS[value];
  return (
    <BadgeTooltip label={hint}>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${
          value === 'fast'
            ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
            : 'text-sky-300 border-sky-500/25 bg-sky-500/10'
        }`}
      >
        {value === 'fast' ? <Zap size={11} className="flex-shrink-0" fill="currentColor" /> : <Clock size={11} className="flex-shrink-0" />}
        {text}
      </span>
    </BadgeTooltip>
  );
}

/** Маленький ⚡ в карточке каталога — только для «быстрых». */
export function ResponseBadgeMini({ value }: { value: ResponseBadgeValue }) {
  if (value !== 'fast') return null;
  return (
    <span title={LABELS.fast.hint} aria-label={LABELS.fast.text} className="inline-flex flex-shrink-0">
      <Zap size={12} className="text-amber-400" fill="currentColor" />
    </span>
  );
}
