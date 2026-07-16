import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Headphones, TrendingUp, TrendingDown, Music2, UsersRound, Camera,
  CalendarDays, ExternalLink, ListMusic,
} from 'lucide-react';
import ImageLightbox from './ImageLightbox';

/**
 * Блоки карточки Артиста с данными Яндекс.Музыки (Artist.ymData из ночного
 * синка): статистика слушателей с графиком, популярные треки, похожие
 * артисты, фото, концерты. Рендерится только то, что реально пришло.
 */

interface YmLink { title: string; href: string; type: string; socialNetwork: string | null }
interface YmSimilar { ymId: string; name: string; cover: string | null; genres?: string[]; moozaArtistId?: string | null }
interface YmTrack { id: string; title: string; durationMs: number | null }
interface YmPlaylist { title: string; trackCount: number | null; url: string }
export interface YmData {
  updatedAt?: string;
  likesCount?: number | null;
  counts?: { tracks?: number | null; albums?: number | null };
  links?: YmLink[];
  similarArtists?: YmSimilar[];
  popularTracks?: YmTrack[];
  photos?: string[];
  concerts?: any[];
  bestPlaylist?: YmPlaylist | null;
}

interface HistoryPoint { listeners: number; date: string }

function fmtDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString('ru-RU');
}

// Мини-график слушателей (SVG-спарклайн по точкам ночных синков).
function Sparkline({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 36;
  const vals = points.map((p) => p.listeners);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = w / (vals.length - 1);
  const xy = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <polyline
        points={xy.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary-400"
      />
    </svg>
  );
}

const card = 'bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden mb-4';
const cardHead = 'flex items-center gap-2 px-4 py-3 border-b border-slate-800/60';

export default function ArtistYandexBlocks({
  listeners,
  listenersDelta,
  listenersHistory,
  ymData,
}: {
  listeners?: number | null;
  listenersDelta?: number | null;
  listenersHistory?: HistoryPoint[];
  ymData?: YmData | null;
}) {
  const navigate = useNavigate();
  const [photoOpen, setPhotoOpen] = useState<string | null>(null);
  if (!ymData) return null;

  const tracks = ymData.popularTracks ?? [];
  const similar = ymData.similarArtists ?? [];
  const photos = ymData.photos ?? [];
  const concerts = ymData.concerts ?? [];
  const hasStats = (listeners ?? 0) > 0 || (ymData.likesCount ?? 0) > 0;
  const history = listenersHistory ?? [];
  const delta = listenersDelta ?? 0;

  const statBits = [
    typeof ymData.likesCount === 'number' && ymData.likesCount > 0 ? `${fmtNum(ymData.likesCount)} лайков` : null,
    ymData.counts?.tracks ? `${fmtNum(ymData.counts.tracks)} треков` : null,
    ymData.counts?.albums ? `${fmtNum(ymData.counts.albums)} релизов` : null,
  ].filter(Boolean);

  return (
    <>
      {/* ── Статистика Яндекс Музыки ── */}
      {hasStats && (
        <div className={card}>
          <div className={cardHead}>
            <Headphones size={14} className="text-amber-400" />
            <span className="text-sm font-semibold text-white">Слушатели на Яндекс Музыке</span>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-bold text-white">{fmtNum(listeners ?? 0)}</span>
                  <span className="text-xs text-slate-500">в месяц</span>
                  {delta !== 0 && (
                    <span
                      className={`flex items-center gap-0.5 text-xs font-semibold ${
                        delta > 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {delta > 0 ? '+' : '−'}{fmtNum(Math.abs(delta))}
                    </span>
                  )}
                </div>
                {statBits.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">{statBits.join(' · ')}</p>
                )}
              </div>
              <Sparkline points={history} />
            </div>
          </div>
        </div>
      )}

      {/* ── Популярные треки ── */}
      {tracks.length > 0 && (
        <div className={card}>
          <div className={cardHead}>
            <Music2 size={14} className="text-rose-400" />
            <span className="text-sm font-semibold text-white">Популярные треки</span>
            <span className="text-xs text-slate-500">{tracks.length}</span>
          </div>
          <div className="px-2 py-1.5">
            {tracks.map((t, i) => (
              <a
                key={t.id || i}
                href={`https://music.yandex.ru/track/${t.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
              >
                <span className="w-5 text-right text-xs text-slate-500 flex-shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0 text-sm text-slate-200 truncate">{t.title}</span>
                <span className="text-xs text-slate-500 flex-shrink-0">{fmtDuration(t.durationMs)}</span>
              </a>
            ))}
          </div>
          {ymData.bestPlaylist?.url && (
            <div className="px-4 pb-3 pt-1">
              <a
                href={ymData.bestPlaylist.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-xs font-semibold transition-colors"
              >
                <ListMusic size={13} />
                Плейлист «{ymData.bestPlaylist.title}»
                {ymData.bestPlaylist.trackCount ? ` · ${ymData.bestPlaylist.trackCount}` : ''}
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── Похожие артисты ── */}
      {similar.length > 0 && (
        <div className={card}>
          <div className={cardHead}>
            <UsersRound size={14} className="text-violet-400" />
            <span className="text-sm font-semibold text-white">Похожие артисты</span>
          </div>
          <div className="flex gap-3 px-4 py-3 overflow-x-auto">
            {similar.map((s) => {
              const inner = (
                <>
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-800 border border-slate-700 mx-auto">
                    {s.cover ? (
                      <img src={s.cover} alt={s.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600 text-xl font-bold">
                        {s.name[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 text-center mt-1.5 w-16 truncate">{s.name}</p>
                  {s.moozaArtistId && (
                    <p className="text-[10px] text-primary-400 text-center w-16 truncate">на Moooza</p>
                  )}
                </>
              );
              return s.moozaArtistId ? (
                <button
                  key={s.ymId}
                  onClick={() => navigate(`/artist/${s.moozaArtistId}`)}
                  className="flex-shrink-0"
                >
                  {inner}
                </button>
              ) : (
                <a
                  key={s.ymId}
                  href={`https://music.yandex.ru/artist/${s.ymId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0"
                >
                  {inner}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Фото ── */}
      {photos.length > 0 && (
        <div className={card}>
          <div className={cardHead}>
            <Camera size={14} className="text-sky-400" />
            <span className="text-sm font-semibold text-white">Фото</span>
            <span className="text-xs text-slate-500">{photos.length}</span>
          </div>
          <div className="flex gap-2 px-4 py-3 overflow-x-auto">
            {photos.map((p, i) => (
              <button key={i} onClick={() => setPhotoOpen(p)} className="flex-shrink-0">
                <img
                  src={p}
                  alt=""
                  loading="lazy"
                  className="w-28 h-28 rounded-xl object-cover bg-slate-800 border border-slate-700"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Концерты (Яндекс Афиша) ── */}
      {concerts.length > 0 && (
        <div className={card}>
          <div className={cardHead}>
            <CalendarDays size={14} className="text-emerald-400" />
            <span className="text-sm font-semibold text-white">Концерты</span>
          </div>
          <div className="px-4 py-2 space-y-2">
            {concerts.map((c: any, i: number) => {
              const title = c?.concertTitle || c?.title || 'Концерт';
              const date = c?.datetime || c?.date;
              const place = [c?.city, c?.place || c?.address].filter(Boolean).join(', ');
              const href = c?.afishaUrl || c?.url;
              const body = (
                <div className="py-1.5">
                  <p className="text-sm text-white">{title}</p>
                  <p className="text-xs text-slate-500">
                    {[date ? new Date(date).toLocaleDateString('ru-RU') : null, place].filter(Boolean).join(' · ')}
                  </p>
                </div>
              );
              return href ? (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:bg-slate-800/50 rounded-lg px-2 -mx-2 transition-colors">
                  <div className="flex-1 min-w-0">{body}</div>
                  <ExternalLink size={13} className="text-slate-500 flex-shrink-0" />
                </a>
              ) : (
                <div key={i} className="px-2 -mx-2">{body}</div>
              );
            })}
          </div>
        </div>
      )}

      {photoOpen && <ImageLightbox src={photoOpen} onClose={() => setPhotoOpen(null)} />}
    </>
  );
}
