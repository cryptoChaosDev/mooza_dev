// Визитка артиста: блок «Слушать» (крупные кнопки площадок), карточка
// «Последний релиз» и ряд соцсетей. Главный сценарий — переход из шапки
// ВК/Telegram на телефоне: кнопки ≥ 44px, первые площадки видны сразу.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Headphones, Play, ChevronDown, Edit3, Disc3, Plus } from 'lucide-react';
import type { ArtistLink } from './linkPlatforms';
import { trackArtistClick } from './artistTracking';
import { safeHref, formatReleaseDate } from '../../lib/artistUtils';
import { MEDIA_PLATFORM_LABELS } from '../../lib/mediaPlatforms';

// Сколько площадок видно сразу (2 ряда на телефоне); остальные — «Все площадки».
const COLLAPSED_COUNT = 4;

export function ArtistListenBlock({
  artistId,
  links,
  canEdit,
  onEditLinks,
}: {
  artistId: string;
  links: ArtistLink[];
  canEdit: boolean;
  onEditLinks: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (links.length === 0) {
    if (!canEdit) return null;
    // Админу — подсказка: визитка без площадок бесполезна как «ссылка в био».
    return (
      <button
        type="button"
        onClick={onEditLinks}
        className="w-full mb-3 flex items-center gap-3 p-3.5 rounded-2xl border border-dashed border-slate-700 hover:border-primary-500/60 bg-slate-900/40 text-left transition-colors"
      >
        <span className="w-10 h-10 rounded-xl bg-primary-500/15 text-primary-300 flex items-center justify-center flex-shrink-0">
          <Plus size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">Добавьте площадки «Слушать»</span>
          <span className="block text-xs text-slate-400 leading-snug">
            Яндекс Музыка, VK Музыка, Звук, Spotify… — посетители визитки смогут слушать в один тап.
          </span>
        </span>
      </button>
    );
  }

  // «Ещё 1» не показываем — проще вывести все.
  const showAll = expanded || links.length <= COLLAPSED_COUNT + 1;
  const visible = showAll ? links : links.slice(0, COLLAPSED_COUNT);
  const oddFirstWide = visible.length % 2 === 1;

  return (
    <section aria-labelledby="artist-listen-title" className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <Headphones size={15} className="text-primary-400" />
        <h2 id="artist-listen-title" className="text-sm font-semibold text-white">Слушать</h2>
        {canEdit && (
          <button
            type="button"
            onClick={onEditLinks}
            aria-label="Изменить ссылки на площадки"
            className="ml-auto w-9 h-9 -mr-1.5 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <Edit3 size={14} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visible.map((l, i) => {
          const { Icon } = l.platform;
          return (
            <a
              key={l.platform.key}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackArtistClick(artistId, l.platform.key)}
              className={`group flex items-center gap-2.5 min-h-[48px] pl-2 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-600 hover:bg-slate-800/70 active:scale-[0.98] transition-all min-w-0 ${
                oddFirstWide && i === 0 ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: l.platform.bg, color: l.platform.fg }}
              >
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <span className="flex-1 min-w-0 text-sm font-semibold text-white truncate">{l.title}</span>
              <Play size={14} className="flex-shrink-0 text-slate-500 group-hover:text-white fill-current transition-colors" />
            </a>
          );
        })}
      </div>
      {!showAll && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-slate-800 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
        >
          Все площадки · ещё {links.length - COLLAPSED_COUNT}
          <ChevronDown size={15} />
        </button>
      )}
    </section>
  );
}

/** Ряд иконок соцсетей/сообществ (ВК-группа, Telegram-канал, Дзен, сайт…). */
export function ArtistSocialRow({ artistId, links }: { artistId: string; links: ArtistLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Соцсети и сообщества</p>
      <div className="flex flex-wrap gap-2.5">
        {links.map((l) => {
          const { Icon } = l.platform;
          const name = l.platform.key === 'website' ? `Сайт: ${l.title}` : l.title;
          return (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              title={name}
              aria-label={name}
              onClick={() => trackArtistClick(artistId, l.platform.key)}
              className="w-11 h-11 rounded-full flex items-center justify-center ring-1 ring-white/10 hover:scale-105 active:scale-95 transition-transform"
              style={{ backgroundColor: l.platform.bg, color: l.platform.fg }}
            >
              <Icon className="w-5 h-5" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

export interface ReleaseLite {
  id: string;
  title: string;
  coverUrl?: string | null;
  platform?: string | null;
  url?: string | null;
  releaseDate?: string | null;
}

/** «Последний релиз» — карточка с обложкой и кнопкой «Слушать» (на площадку). */
export function ArtistLatestRelease({ artistId, release }: { artistId: string; release: ReleaseLite | null | undefined }) {
  if (!release) return null;
  const href = safeHref(release.url);
  const meta = [
    formatReleaseDate(release.releaseDate),
    release.platform ? MEDIA_PLATFORM_LABELS[release.platform] ?? null : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className="mb-3 flex items-center gap-3 p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800/60">
      <Link to={`/releases/${release.id}`} className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 border border-slate-700/60 flex items-center justify-center flex-shrink-0">
          {release.coverUrl ? (
            <img src={release.coverUrl} alt={release.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : (
            <Disc3 size={24} className="text-slate-600" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-300">Последний релиз</p>
          <p className="text-sm font-semibold text-white truncate">{release.title}</p>
          {meta && <p className="text-xs text-slate-500 truncate">{meta}</p>}
        </div>
      </Link>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackArtistClick(artistId, 'release')}
          className="h-11 px-3.5 rounded-xl bg-primary-600 hover:bg-primary-500 active:scale-95 text-white text-sm font-semibold flex items-center gap-1.5 flex-shrink-0 transition-all"
        >
          <Play size={14} className="fill-current" />
          Слушать
        </a>
      )}
    </div>
  );
}
