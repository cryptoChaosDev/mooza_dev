// CTA визитки артиста: «Пригласить на концерт» (биржа лайнапов), «Подписаться»
// (избранное/follow), «Поделиться», «QR-код». Гостю действия — через AuthGate.
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Star, QrCode, Loader2 } from 'lucide-react';
import ShareButton from '../ShareButton';
import { openAuthGate, useAuthGate } from '../AuthGateModal';

// Телефон: плитки «иконка над подписью» (3 в ряд без обрезки текста);
// от sm — обычные кнопки в одну строку с основной.
const secondaryBtn =
  'min-h-[52px] sm:min-h-[48px] px-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 hover:bg-slate-700/70 active:scale-[0.98] text-slate-100 text-xs sm:text-sm font-medium flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 transition-all disabled:opacity-60 min-w-0';

export default function ArtistCtaRow({
  artistId,
  artistName,
  shareUrl,
  isMember,
  isFollowed,
  followPending,
  onToggleFollow,
  onOpenQr,
}: {
  artistId: string;
  artistName: string;
  /** Полный адрес визитки: https://moooza.ru/artist/<slug>. */
  shareUrl: string;
  /** Подтверждённый участник: себя не приглашают и не добавляют в избранное. */
  isMember: boolean;
  isFollowed: boolean;
  followPending: boolean;
  onToggleFollow: () => void;
  onOpenQr: () => void;
}) {
  const navigate = useNavigate();
  const gate = useAuthGate();

  const invite = () => {
    // Биржа лайнапов: форма концерта с этим артистом в составе.
    const to = `/lineups/new?artist=${encodeURIComponent(artistId)}`;
    if (gate.isAuthed) navigate(to);
    else openAuthGate('create', { type: 'lineup_invite' }, 'Войдите, чтобы пригласить артиста на концерт');
  };

  return (
    <div className="mb-3 flex flex-col sm:flex-row gap-2">
      {!isMember && (
        <button
          type="button"
          onClick={invite}
          className="min-h-[48px] sm:flex-1 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white text-[15px] font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary-900/30 transition-all"
        >
          <CalendarPlus size={18} />
          Пригласить на концерт
        </button>
      )}
      <div className={`grid gap-2 sm:flex ${isMember ? 'grid-cols-2 sm:flex-1' : 'grid-cols-3'}`}>
        {!isMember && (
          <button
            type="button"
            onClick={() => gate.ensure('follow', { type: 'artist' }, onToggleFollow)}
            disabled={followPending}
            aria-pressed={isFollowed}
            className={`${secondaryBtn} sm:px-4`}
          >
            {followPending
              ? <Loader2 size={16} className="animate-spin" />
              : <Star size={16} className={isFollowed ? 'text-amber-400 fill-amber-400' : ''} />}
            <span className="truncate">{isFollowed ? 'Вы подписаны' : 'Подписаться'}</span>
          </button>
        )}
        <ShareButton
          url={shareUrl}
          title={artistName}
          text={`${artistName} на Moooza`}
          label="Поделиться"
          iconSize={16}
          className={`${secondaryBtn} sm:px-4 ${isMember ? 'sm:flex-1' : ''}`}
        />
        <button type="button" onClick={onOpenQr} className={`${secondaryBtn} sm:px-4 ${isMember ? 'sm:flex-1' : ''}`}>
          <QrCode size={16} />
          <span>QR-код</span>
        </button>
      </div>
    </div>
  );
}
