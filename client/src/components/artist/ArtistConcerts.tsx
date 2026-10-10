// «Ближайшие концерты» визитки: концерты артиста со «Сцены» — из Яндекс Музыки,
// афиши Qtickets и добавленные вручную (server: lib/sceneConcerts) — до 3 сразу,
// остальные по «Все концерты». Время — местное для города концерта.
// Админ артиста добавляет концерт (город, площадка, дата и время по городу,
// ссылка на билеты) и удаляет добавленные вручную. Пока «Сцена» не ответила или
// пуста — витрина ЯМ (ymData.concerts), как раньше. Ссылки — только http(s).
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, Ticket, ChevronDown, MapPin, Plus, Trash2, Loader2 } from 'lucide-react';
import { safeHref } from '../../lib/artistUtils';
import { sceneAPI, concertDate, concertTime, type SceneConcert } from '../../lib/scene';
import { getApiError } from '../../lib/apiError';
import { toast } from '../../stores/toastStore';
import BottomSheet from '../BottomSheet';
import CityPicker from '../CityPicker';
import ConfirmDialog from '../ConfirmDialog';
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

/** Строка списка: даты уже по местному времени города. */
interface ConcertView {
  key: string;
  dayMonth: string;
  /** День недели или год (если не текущий). */
  sub: string;
  time: string | null;
  title: string | null;
  city: string | null;
  place: string | null;
  ticketsHref: string | undefined;
  citySlug: string | null;
  /** id концерта, добавленного вручную (можно удалить). */
  manualId: string | null;
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

const thisYear = () => new Date().toLocaleDateString('ru-RU', { year: 'numeric', timeZone: MSK });

/** Витрина ЯМ → строки (время по Москве — пояса в витрине нет). */
function fromYm(list: UpcomingConcert[]): ConcertView[] {
  return list.map((c) => {
    const year = c.at.toLocaleDateString('ru-RU', { year: 'numeric', timeZone: MSK });
    return {
      key: c.key,
      dayMonth: c.at.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: MSK }),
      sub: year !== thisYear() ? year : c.at.toLocaleDateString('ru-RU', { weekday: 'short', timeZone: MSK }),
      time: c.hasTime ? c.at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: MSK }) : null,
      title: c.title,
      city: c.city,
      place: c.place,
      ticketsHref: c.ticketsHref,
      citySlug: null,
      manualId: null,
    };
  });
}

/** «Сцена» → строки (местное время города концерта). */
function fromScene(items: SceneConcert[]): ConcertView[] {
  return items.map((c) => {
    const year = concertDate(c, { year: 'numeric' });
    return {
      key: c.id,
      dayMonth: concertDate(c, { day: '2-digit', month: '2-digit' }),
      sub: year !== thisYear() ? year : concertDate(c, { weekday: 'short' }),
      time: concertTime(c),
      title: c.title,
      city: c.cityName,
      place: c.venue ?? c.address,
      ticketsHref: safeHref(c.ticketUrl) ?? safeHref(c.url),
      citySlug: c.citySlug,
      manualId: c.source === 'MANUAL' ? c.id : null,
    };
  });
}

function ConcertRow({ c, artistId, artistName, onDelete }: {
  c: ConcertView; artistId: string; artistName: string; onDelete?: (id: string) => void;
}) {
  // Название концерта показываем, только если это не просто имя артиста.
  const title = c.title && c.title.toLowerCase() !== artistName.toLowerCase() ? c.title : null;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="w-14 flex-shrink-0 rounded-xl bg-emerald-500/10 border border-emerald-500/25 py-1.5 text-center">
        <p className="text-base font-bold text-white leading-tight tabular-nums">{c.dayMonth}</p>
        <p className="text-[10px] text-emerald-300/90 leading-tight">{c.sub}{c.time ? ` · ${c.time}` : ''}</p>
      </div>
      <div className="flex-1 min-w-0">
        {c.city && c.citySlug ? (
          <Link to={`/scene/${c.citySlug}`} className="block text-sm font-semibold text-white truncate hover:text-primary-300">{c.city}</Link>
        ) : (
          <p className="text-sm font-semibold text-white truncate">{c.city ?? title ?? 'Концерт'}</p>
        )}
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
      {onDelete && c.manualId && (
        <button
          type="button"
          onClick={() => onDelete(c.manualId!)}
          aria-label="Удалить концерт"
          className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}

export default function ArtistConcerts({
  artistId,
  artistName,
  concerts,
  canManage = false,
}: {
  artistId: string;
  artistName: string;
  /** Витрина ЯМ — запасной источник, пока «Сцена» пуста. */
  concerts: unknown;
  /** Админ артиста: добавить / удалить концерт. */
  canManage?: boolean;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sceneQ = useQuery({
    queryKey: ['artist-concerts', artistId],
    queryFn: () => sceneAPI.artistConcerts(artistId),
    staleTime: 60_000,
  });
  const list = useMemo<ConcertView[]>(() => {
    if (sceneQ.data && sceneQ.data.length > 0) return fromScene(sceneQ.data);
    return fromYm(upcomingConcerts(concerts));
  }, [sceneQ.data, concerts]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => sceneAPI.deleteConcert(id),
    onSuccess: () => {
      toast.success('Концерт удалён');
      qc.invalidateQueries({ queryKey: ['artist-concerts', artistId] });
      qc.invalidateQueries({ queryKey: ['scene'] });
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось удалить концерт')),
  });

  if (list.length === 0 && !canManage) return null;
  const visible = expanded ? list : list.slice(0, VISIBLE_COUNT);
  return (
    <section aria-labelledby="artist-concerts-title" className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden mb-3">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
        <CalendarDays size={14} className="text-emerald-400" />
        <h2 id="artist-concerts-title" className="text-sm font-semibold text-white">Ближайшие концерты</h2>
        {list.length > 0 && <span className="text-xs text-slate-500">{list.length}</span>}
        {canManage && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-primary-300 hover:text-white hover:bg-slate-800 flex items-center gap-1 transition-colors"
          >
            <Plus size={14} /> Добавить концерт
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-400 leading-relaxed">
          Добавьте ближайшие выступления — они появятся на Сцене вашего города, а подписчики из этого города получат уведомление.
        </p>
      ) : (
        <ul className="px-4 py-1 divide-y divide-slate-800/60">
          {visible.map((c) => (
            <ConcertRow key={c.key} c={c} artistId={artistId} artistName={artistName} onDelete={canManage ? setDeleteId : undefined} />
          ))}
        </ul>
      )}
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

      {canManage && (
        <AddConcertSheet
          open={adding}
          artistId={artistId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            qc.invalidateQueries({ queryKey: ['artist-concerts', artistId] });
            qc.invalidateQueries({ queryKey: ['scene'] });
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleteId}
        message="Удалить концерт? Он пропадёт и со Сцены города."
        onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </section>
  );
}

const inputCls = 'w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500';

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function AddConcertSheet({ open, artistId, onClose, onAdded }: {
  open: boolean; artistId: string; onClose: () => void; onAdded: () => void;
}) {
  const [city, setCity] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [ticketUrl, setTicketUrl] = useState('');
  const mut = useMutation({
    mutationFn: () => sceneAPI.addConcert({
      artistId, city, venue: venue.trim(), date, time, ticketUrl: ticketUrl.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Концерт добавлен — он появится на Сцене города');
      setCity(''); setVenue(''); setDate(''); setTime('19:00'); setTicketUrl('');
      onAdded();
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось добавить концерт')),
  });
  const ready = !!city && !!venue.trim() && !!date && !!time && !mut.isPending;
  return (
    <BottomSheet isOpen={open} onClose={onClose} title="Новый концерт" height="auto">
      <form
        className="p-4 space-y-3"
        onSubmit={(e) => { e.preventDefault(); if (ready) mut.mutate(); }}
      >
        <div>
          <label className="block text-xs text-slate-500 mb-1">Город</label>
          <CityPicker key={open ? 'open' : 'closed'} city={city} country="" onChange={(c) => setCity(c)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Площадка</label>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={200} placeholder="Клуб, бар, зал" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Дата</label>
            <input type="date" value={date} min={todayLocal()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Начало (по местному времени)</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ссылка на билеты — если есть</label>
          <input type="url" inputMode="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} maxLength={1000} placeholder="https://" className={inputCls} />
        </div>
        <button
          type="submit"
          disabled={!ready}
          className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {mut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Добавить концерт
        </button>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Концерт появится на визитке и на Сцене города. Подписчики артиста из этого города получат уведомление.
        </p>
      </form>
    </BottomSheet>
  );
}
