import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronDown, ChevronUp, Clapperboard, Disc3 } from 'lucide-react';
import { api } from '../lib/api';
import { plural } from '../lib/plural';
import { avatarUrl } from '../lib/avatar';
import { artistHref } from '../lib/artistUtils';

// «Подтверждённый опыт» — кредиты из релизов/клипов (GET /users/:id/credits).
// Сервер отдаёт только подтверждённые участия у артистов не REJECTED; гостю —
// только при публичном профиле (иначе 404 — блок просто не показывается).

export interface CreditsArtist { id: string; slug: string | null; name: string; avatar: string | null; listeners: number }
export interface CreditsItem {
  id: string;
  title: string;
  coverUrl: string | null;
  releaseDate: string | null;
  artist: { id: string; slug: string | null; name: string };
  roles: string[];
}
export interface CreditsData {
  releasesCount: number;
  clipsCount: number;
  artistsCount: number;
  artists: CreditsArtist[];
  roles: string[];
  listenersTotal: number;
  releases: CreditsItem[];
  clips: CreditsItem[];
}

/** Сколько последних релизов показывать до «Все кредиты». */
const RECENT_RELEASES = 6;
/** Сколько артистов назвать в сводке («с артистами: A, B, C (+K)»). */
const NAMED_ARTISTS = 3;

/** Аудитория по-русски, округлённо: 850 → «850», 40 230 → «40 тыс.», 1 250 000 → «1,3 млн». */
export function formatAudience(n: number): string {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v < 1000) return v.toLocaleString('ru-RU');
  if (v < 1_000_000) return `${Math.round(v / 1000).toLocaleString('ru-RU')} тыс.`;
  const mln = Math.round(v / 100_000) / 10;
  return `${mln.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
}

/** «12 релизов · 3 клипа». */
export function creditsCountsLine(d: Pick<CreditsData, 'releasesCount' | 'clipsCount'>): string {
  return [
    d.releasesCount > 0 ? `${d.releasesCount} ${plural(d.releasesCount, 'релиз', 'релиза', 'релизов')}` : null,
    d.clipsCount > 0 ? `${d.clipsCount} ${plural(d.clipsCount, 'клип', 'клипа', 'клипов')}` : null,
  ].filter(Boolean).join(' · ');
}

function coverSrc(url: string | null): string | null {
  return url ? avatarUrl(url) : null;
}

function year(d: string | null): string | null {
  if (!d) return null;
  const y = new Date(d).getUTCFullYear();
  return Number.isFinite(y) ? String(y) : null;
}

function CreditRow({ item, kind }: { item: CreditsItem; kind: 'release' | 'clip' }) {
  const src = coverSrc(item.coverUrl);
  const meta = [item.artist?.name, kind === 'release' ? year(item.releaseDate) : 'клип', item.roles.slice(0, 3).join(', ')].filter(Boolean).join(' · ');
  return (
    <Link
      to={kind === 'release' ? `/releases/${item.id}` : `/clips/${item.id}`}
      className="flex items-center gap-3 py-2 hover:bg-slate-800/30 -mx-1 px-1 rounded-lg transition-colors"
    >
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-800 border border-slate-700/60 flex items-center justify-center flex-shrink-0">
        {src
          ? <img src={src} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          : (kind === 'release' ? <Disc3 size={16} className="text-slate-600" /> : <Clapperboard size={16} className="text-slate-600" />)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">{item.title}</p>
        {meta && <p className="text-[11px] text-slate-500 truncate">{meta}</p>}
      </div>
    </Link>
  );
}

export default function ConfirmedCredits({ userId }: { userId: string }) {
  const [showAll, setShowAll] = useState(false);
  const { data } = useQuery({
    queryKey: ['user-credits', userId],
    queryFn: async () => { const { data } = await api.get(`/users/${userId}/credits`); return data as CreditsData; },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    // 404 (профиль не публичный для гостя) — окончательный ответ
    retry: (count, e: any) => e?.response?.status !== 404 && count < 1,
  });

  if (!data || (data.releasesCount ?? 0) + (data.clipsCount ?? 0) === 0) return null;

  const artists = data.artists ?? [];
  const named = artists.slice(0, NAMED_ARTISTS);
  const moreArtists = Math.max(0, (data.artistsCount ?? artists.length) - named.length);
  const releases = data.releases ?? [];
  const clips = data.clips ?? [];
  const recent = releases.slice(0, RECENT_RELEASES);
  const hasMore = releases.length > recent.length || clips.length > 0;

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
        <BadgeCheck size={14} className="text-emerald-400" />
        <span className="text-sm font-semibold text-white">Подтверждённый опыт</span>
      </div>
      <div className="p-4 space-y-2">
        {/* Сводка: «12 релизов · 3 клипа · с артистами: A, B, C (+K)» */}
        <p className="text-sm text-slate-200 leading-relaxed break-words [overflow-wrap:anywhere]">
          {creditsCountsLine(data)}
          {named.length > 0 && (
            <>
              {' · с артистами: '}
              {named.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  <Link to={artistHref(a)} className="text-primary-300 hover:text-primary-200">{a.name}</Link>
                </span>
              ))}
              {moreArtists > 0 && <span className="text-slate-500"> (+{moreArtists})</span>}
            </>
          )}
        </p>
        {(data.roles?.length ?? 0) > 0 && (
          <p className="text-xs text-slate-400 break-words [overflow-wrap:anywhere]">
            <span className="text-slate-500">Роли: </span>{data.roles.slice(0, 6).join(', ')}
          </p>
        )}
        {data.listenersTotal > 0 && (
          <p className="text-xs text-slate-400">
            ~{formatAudience(data.listenersTotal)}{' '}
            {data.listenersTotal < 1000 ? plural(data.listenersTotal, 'слушатель', 'слушателя', 'слушателей') : 'слушателей'} в месяц на Яндекс Музыке
            <span className="text-slate-600"> · суммарно у артистов</span>
          </p>
        )}

        {/* Последние релизы — обложки со ссылками */}
        {recent.length > 0 && !showAll && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
            {recent.map((r) => {
              const src = coverSrc(r.coverUrl);
              return (
                <Link key={r.id} to={`/releases/${r.id}`} className="group min-w-0" title={`${r.title} — ${r.artist?.name ?? ''}`}>
                  <div className="aspect-square rounded-xl overflow-hidden bg-slate-800 border border-slate-700/60 group-hover:border-primary-500/50 transition-colors flex items-center justify-center">
                    {src
                      ? <img src={src} alt={r.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      : <Disc3 size={18} className="text-slate-600" />}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-300 leading-tight line-clamp-2">{r.title}</p>
                </Link>
              );
            })}
          </div>
        )}

        {/* Все кредиты — полный список релизов и клипов */}
        {showAll && (
          <div className="pt-1">
            {releases.length > 0 && (
              <div className="divide-y divide-slate-800/60">
                {releases.map((r) => <CreditRow key={r.id} item={r} kind="release" />)}
              </div>
            )}
            {clips.length > 0 && (
              <div className={`divide-y divide-slate-800/60 ${releases.length > 0 ? 'mt-2 pt-2 border-t border-slate-800/60' : ''}`}>
                {clips.map((c) => <CreditRow key={c.id} item={c} kind="clip" />)}
              </div>
            )}
          </div>
        )}

        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors pt-1"
          >
            {showAll ? 'Свернуть' : 'Все кредиты'}
            {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
