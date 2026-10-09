import { Disc3 } from 'lucide-react';
import { plural } from '../lib/plural';
import { ResponseBadgeMini, type ResponseBadgeValue } from './ResponseBadge';

/**
 * Мини-сигналы карточки каталога («Люди», «Услуги»): «12 релизов» (подтверждённые
 * кредиты, если ≥ 1) и ⚡ «Отвечает быстро». Данные — из ответа каталога.
 */
export default function CatalogCardSignals({ releasesCount, responseBadge }: { releasesCount?: number | null; responseBadge?: ResponseBadgeValue }) {
  const n = typeof releasesCount === 'number' && releasesCount > 0 ? Math.floor(releasesCount) : 0;
  if (!n && responseBadge !== 'fast') return null;
  return (
    <>
      <ResponseBadgeMini value={responseBadge} />
      {n > 0 && (
        <span
          className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex-shrink-0 whitespace-nowrap"
          title="Подтверждённые релизы с участием"
        >
          <Disc3 size={10} className="flex-shrink-0" />
          {n} {plural(n, 'релиз', 'релиза', 'релизов')}
        </span>
      )}
    </>
  );
}
