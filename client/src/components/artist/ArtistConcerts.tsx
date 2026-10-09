// «Ближайшие концерты» визитки: будущие концерты из ymData.concerts (ночной
// синк Яндекс.Музыки/Афиши) — до 3 сразу, остальные по «Все концерты».
// Ссылка на билеты — только http(s) (данные внешние).
import { useMemo, useState } from 'react';
import { CalendarDays, Ticket, ChevronDown, MapPin } from 'lucide-react';
import { safeHref } from '../../lib/artistUtils';
import { trackArtistClick } from './artistTracking';

const VISIBLE_COUNT = 3;
const MSK = 'Europe/Moscow';

interface UpcomingConcert {
  key: string;
  at: Date;
  hasTime: boolean;
  title: string | null;
  city: string | null;
  place: string | null;
  ticketsHref: string | undefined;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// Начало сегодняшнего дня по МСК (UTC+3 без перехода на летнее время) —
// концерт «сегодня вечером» ещё ближайший.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
function startOfTodayMsk(now = new Date()): number {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  return Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()) - MSK_OFFSET_MS;
}

export function upcomingConcerts(concerts: unknown, now = new Date()): UpcomingConcert[] {
  if (!Array.isArray(concerts)) return [];
  const from = startOfTodayMsk(now);
  const out: UpcomingConcert[] = [];
  concerts.forEach((c: any, i: number) => {
    const rawDate = str(c?.datetime) ?? str(c?.date);
    if (!rawDate) return;
    const at = new Date(rawDate);
    if (Number.isNaN(at.getTime()) || at.getTime() < from) return;
    out.push({
      key: `${rawDate}-${i}`,
      at,
      hasTime: /T\d{2}:\d{2}/.test(rawDate) && !/T00:00(:00)?(\.0+)?(Z|[+-]00:?00)?$/.test(rawDate),
      title: str(c?.concertTitle) ?? str(c?.title),
      city: str(c?.city),
      place: str(c?.place) ?? str(c?.address),
      ticketsHref: safeHref(c?.afishaUrl) ?? safeHref(c?.url),
    });
  });
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function ConcertRow({ c, artistId, artistName }: { c: UpcomingConcert; artistId: string; artistName: string }) {
  const dayMonth = c.at.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: MSK });
  const year = c.at.toLocaleDateString('ru-RU', { year: 'numeric', timeZone: MSK });
  const thisYear = new Date().toLocaleDateString('ru-RU', { year: 'numeric', timeZone: MSK });
  const weekday = c.at.toLocaleDateString('ru-RU', { weekday: 'short', timeZone: MSK });
  const time = c.hasTime ? c.at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: MSK }) : null;
  // Название концерта показываем, только если это не просто имя артиста.
  const title = c.title && c.title.toLowerCase() !== artistName.toLowerCase() ? c.title : null;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="w-14 flex-shrink-0 rounded-xl bg-emerald-500/10 border border-emerald-500/25 py-1.5 text-center">
        <p className="text-base font-bold text-white leading-tight tabular-nums">{dayMonth}</p>
        <p className="text-[10px] text-emerald-300/90 leading-tight">
          {year !== thisYear ? year : weekday}{time ? ` · ${time}` : ''}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{c.city ?? title ?? 'Концерт'}</p>
        {(c.place || (c.city && title)) && (
          <p className="text-xs text-slate-400 truncate flex items-center gap-1">
            {c.place && <MapPin size={11} className="flex-shrink-0" />}
            <span className="truncate">{[c.place, c.city ? title : null].filter(Boolean).join(' · ')}</span>
          </p>
        )}
      </div>
      {c.ticketsHref && (
        <a
          href={c.ticketsHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackArtistClick(artistId, 'tickets')}
          className="h-11 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-sm font-semibold flex items-center gap-1.5 flex-shrink-0 transition-all"
        >
          <Ticket size={15} />
          Билеты
        </a>
      )}
    </li>
  );
}

export default function ArtistConcerts({
  artistId,
  artistName,
  concerts,
}: {
  artistId: string;
  artistName: string;
  concerts: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const list = useMemo(() => upcomingConcerts(concerts), [concerts]);
  if (list.length === 0) return null;
  const visible = expanded ? list : list.slice(0, VISIBLE_COUNT);
  return (
    <section aria-labelledby="artist-concerts-title" className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden mb-3">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
        <CalendarDays size={14} className="text-emerald-400" />
        <h2 id="artist-concerts-title" className="text-sm font-semibold text-white">Ближайшие концерты</h2>
        <span className="text-xs text-slate-500">{list.length}</span>
      </div>
      <ul className="px-4 py-1 divide-y divide-slate-800/60">
        {visible.map((c) => <ConcertRow key={c.key} c={c} artistId={artistId} artistName={artistName} />)}
      </ul>
      {list.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full min-h-[44px] flex items-center justify-center gap-1.5 border-t border-slate-800/60 text-sm text-slate-300 hover:text-white transition-colors"
        >
          {expanded ? 'Свернуть' : `Все концерты · ещё ${list.length - VISIBLE_COUNT}`}
          <ChevronDown size={15} className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      )}
    </section>
  );
}
