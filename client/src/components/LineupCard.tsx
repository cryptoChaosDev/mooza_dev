import { Link } from 'react-router-dom';
import { MapPin, Users, Wallet, MessageSquare, Mic2 } from 'lucide-react';
import AvatarComponent from './Avatar';
import { personName } from '../lib/publicPerson';
import { plural } from '../lib/plural';
import {
  type Lineup, eventDayTile, feeLabel, slotTypeLabel, lineupStatusBadge,
} from '../lib/lineups';

/**
 * Карточка запроса в ленте «Лайнапы» и во вкладке «Мои запросы»: плитка даты
 * (по МСК), город · площадка, слот, гонорар, жанры, занятые места и отклики.
 */
export default function LineupCard({ lineup, showAuthor = true }: { lineup: Lineup; showAuthor?: boolean }) {
  const tile = eventDayTile(lineup.eventDate);
  const badge = lineupStatusBadge(lineup);
  const free = Math.max(0, lineup.slots - (lineup.acceptedCount ?? 0));
  const pending = lineup.pendingCount ?? 0;

  return (
    <Link
      to={`/lineups/${lineup.id}`}
      className="block bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 rounded-2xl p-4 transition-colors"
    >
      <div className="flex gap-3">
        {/* Плитка даты */}
        <div className="flex-shrink-0 w-14 rounded-xl bg-primary-500/10 border border-primary-500/25 flex flex-col items-center justify-center py-2">
          <span className="text-xl font-bold text-white leading-none">{tile.day}</span>
          <span className="text-[11px] text-primary-300 uppercase mt-1 leading-none">{tile.month}</span>
          <span className="text-[10px] text-slate-400 mt-1 leading-none">{tile.time}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 min-w-0 text-[15px] font-semibold text-white leading-snug break-words [overflow-wrap:anywhere]">{lineup.title}</h3>
            {badge && (
              <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-lg border font-medium ${badge.cls}`}>{badge.label}</span>
            )}
            {!badge && pending > 0 && (
              <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-lg border font-semibold bg-primary-500/15 text-primary-300 border-primary-500/30">
                +{pending} {plural(pending, 'новый', 'новых', 'новых')}
              </span>
            )}
          </div>

          <p className="mt-1 flex items-center gap-1 text-xs text-slate-400 min-w-0">
            <MapPin size={12} className="flex-shrink-0" />
            <span className="truncate">{[lineup.cityName, lineup.venue].filter(Boolean).join(' · ')}</span>
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="flex items-center gap-1 text-slate-300"><Mic2 size={12} className="text-slate-500" />{slotTypeLabel(lineup.slotType)}</span>
            <span className="flex items-center gap-1 text-amber-300 font-medium"><Wallet size={12} className="text-amber-500/80" />{feeLabel(lineup.feeType, lineup.feeAmount)}</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Users size={12} className="text-slate-500" />
              {lineup.status === 'active' && free > 0
                ? `${free} из ${lineup.slots} ${plural(lineup.slots, 'место', 'мест', 'мест')} свободно`
                : `${lineup.slots} ${plural(lineup.slots, 'артист', 'артиста', 'артистов')}`}
            </span>
          </div>

          {lineup.genres?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {lineup.genres.slice(0, 4).map((g) => (
                <span key={g.id} className="px-2 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full text-[11px] text-slate-300">{g.name}</span>
              ))}
              {lineup.genres.length > 4 && <span className="text-[11px] text-slate-500 self-center">+{lineup.genres.length - 4}</span>}
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-500 min-w-0">
            {showAuthor && lineup.author && (
              <span className="flex items-center gap-1.5 min-w-0">
                <AvatarComponent src={lineup.author.avatar} name={personName(lineup.author)} size={16} />
                <span className="truncate">{personName(lineup.author, { fallback: 'Организатор на Moooza' })}</span>
              </span>
            )}
            <span className="flex items-center gap-1 flex-shrink-0 ml-auto">
              <MessageSquare size={11} />
              {lineup.responsesCount} {plural(lineup.responsesCount, 'отклик', 'отклика', 'откликов')}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
