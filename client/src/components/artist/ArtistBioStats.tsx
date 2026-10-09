// Статистика визитки для админов артиста: просмотры и переходы на площадки за
// 30 дней (GET /api/artists/:id/stats — только агрегаты, без ПДн), мини-график
// по дням (простые SVG-столбики) и подсказка «поставьте ссылку в шапку».
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Copy, Link2, Loader2, RotateCw, Lock } from 'lucide-react';
import { api } from '../../lib/api';
import { getApiError } from '../../lib/apiError';
import { copyText } from '../../lib/artistUtils';
import { toast } from '../../stores/toastStore';
import { platformByKey, targetLabel } from './linkPlatforms';

interface StatsResponse {
  days: number;
  from: string;
  to: string;
  views: number;
  clicks: number;
  clicksByTarget: Array<{ target: string; count: number }>;
  series: Array<{ date: string; views: number; clicks: number }>;
}

const DAYS = 30;

function fmt(n: number): string {
  return n.toLocaleString('ru-RU');
}

function ddmm(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}.${m}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// Столбик со скруглённым верхом (низ — ровно на базовой линии).
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function ViewsChart({ series }: { series: StatsResponse['series'] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 300;
  const H = 72;
  const gap = 2;
  const n = series.length;
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, ...series.map((d) => d.views));
  const shown = active != null ? series[active] : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-xs font-medium text-slate-300">Просмотры по дням</p>
        <p className="text-[11px] text-slate-500 tabular-nums min-h-[1rem]" aria-live="polite">
          {shown
            ? `${ddmm(shown.date)}: ${fmt(shown.views)} ${plural(shown.views, 'просмотр', 'просмотра', 'просмотров')}, ${fmt(shown.clicks)} ${plural(shown.clicks, 'переход', 'перехода', 'переходов')}`
            : 'Нажмите на столбик'}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-[72px] block touch-manipulation"
        role="img"
        aria-label={`Просмотры визитки по дням за ${n} дней`}
        onPointerLeave={() => setActive(null)}
      >
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-slate-700" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {series.map((d, i) => {
          const x = i * (bw + gap);
          const h = d.views > 0 ? Math.max(3, (d.views / max) * (H - 4)) : 0;
          return (
            <g key={d.date}>
              {h > 0 && (
                <path
                  d={barPath(x, H - h, bw, h, 2)}
                  className={active === i ? 'fill-primary-300' : 'fill-primary-500'}
                />
              )}
              {/* Цель наведения/тапа — на всю высоту и ширину шага. */}
              <rect
                x={x - gap / 2}
                y={0}
                width={bw + gap}
                height={H}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onClick={() => setActive(i)}
              >
                <title>{`${ddmm(d.date)}: ${d.views} просм., ${d.clicks} перех.`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-slate-500 tabular-nums">
        <span>{ddmm(series[0].date)}</span>
        <span>{ddmm(series[series.length - 1].date)}</span>
      </div>
    </div>
  );
}

export default function ArtistBioStats({ artistId, bioUrl }: { artistId: string; bioUrl: string }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<StatsResponse>({
    queryKey: ['artist-page-stats', artistId, DAYS],
    queryFn: async () => {
      const { data } = await api.get(`/artists/${artistId}/stats`, { params: { days: DAYS } });
      return data as StatsResponse;
    },
    staleTime: 60_000,
    retry: false,
  });

  const copyBio = async () => {
    if (await copyText(bioUrl)) toast.success('Ссылка скопирована — вставьте её в шапку профиля');
    else toast.error('Не удалось скопировать — выделите ссылку вручную');
  };

  const empty = !!data && data.views === 0 && data.clicks === 0;
  const maxTarget = Math.max(1, ...(data?.clicksByTarget ?? []).map((t) => t.count));
  const ctr = data && data.views > 0 ? Math.round((data.clicks / data.views) * 100) : null;

  return (
    <section aria-labelledby="artist-bio-stats-title" className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden mb-3">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
        <BarChart3 size={14} className="text-emerald-400" />
        <h2 id="artist-bio-stats-title" className="text-sm font-semibold text-white">Статистика визитки за {DAYS} дней</h2>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-500" title="Видят только владелец и администраторы артиста">
          <Lock size={10} /> только вам
        </span>
      </div>

      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
        ) : isError || !data ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-400">{getApiError(error, 'Не удалось загрузить статистику')}</p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="min-h-[44px] px-3 rounded-xl border border-slate-700 text-sm text-slate-200 hover:border-slate-500 flex items-center gap-1.5 flex-shrink-0 disabled:opacity-60"
            >
              <RotateCw size={14} className={isFetching ? 'animate-spin' : ''} /> Повторить
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/40 px-3 py-2.5">
                <p className="text-xl font-bold text-white tabular-nums leading-tight">{fmt(data.views)}</p>
                <p className="text-[11px] text-slate-400">{plural(data.views, 'просмотр', 'просмотра', 'просмотров')}</p>
              </div>
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/40 px-3 py-2.5">
                <p className="text-xl font-bold text-white tabular-nums leading-tight">{fmt(data.clicks)}</p>
                <p className="text-[11px] text-slate-400">{plural(data.clicks, 'переход', 'перехода', 'переходов')}</p>
              </div>
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/40 px-3 py-2.5">
                <p className="text-xl font-bold text-white tabular-nums leading-tight">{ctr != null ? `${ctr}%` : '—'}</p>
                <p className="text-[11px] text-slate-400">конверсия</p>
              </div>
            </div>

            {empty ? (
              <p className="text-sm text-slate-400 leading-relaxed">
                Пока нет просмотров. Поставьте ссылку в шапку профиля — и здесь появится, сколько людей открыли визитку и куда перешли слушать.
              </p>
            ) : (
              <>
                {data.series.length > 0 && <ViewsChart series={data.series} />}
                {data.clicksByTarget.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-300 mb-2">Переходы по ссылкам</p>
                    <ul className="space-y-2">
                      {data.clicksByTarget.map((t) => {
                        const p = platformByKey(t.target);
                        return (
                          <li key={t.target} className="flex items-center gap-2.5">
                            {p ? (
                              <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: p.bg, color: p.fg }}>
                                <p.Icon className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <span className="w-6 h-6 rounded-md bg-slate-700 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-xs text-slate-200 truncate">{targetLabel(t.target)}</span>
                                <span className="text-xs font-semibold text-white tabular-nums">{fmt(t.count)}</span>
                              </div>
                              <div className="mt-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                                <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max(4, (t.count / maxTarget) * 100)}%` }} />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* «Ссылка в био»: главный сценарий визитки. */}
        <div className="rounded-xl bg-primary-500/10 border border-primary-500/25 p-3">
          <p className="text-sm font-semibold text-white flex items-start gap-1.5">
            <Link2 size={15} className="text-primary-300 flex-shrink-0 mt-0.5" />
            Поставьте эту ссылку в шапку профиля ВК/Telegram
          </p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Вместо BandLink/Taplink: по ссылке — площадки, ближайшие концерты, последний релиз и кнопка «Пригласить на концерт».
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-xs text-primary-200 bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-3">
              {bioUrl.replace(/^https?:\/\//, '')}
            </code>
            <button
              type="button"
              onClick={copyBio}
              className="min-h-[44px] px-3 rounded-lg bg-primary-600 hover:bg-primary-500 active:scale-95 text-white text-sm font-semibold flex items-center gap-1.5 flex-shrink-0 transition-all"
            >
              <Copy size={14} /> Копировать
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
