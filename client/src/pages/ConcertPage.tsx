import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, CalendarDays, CalendarPlus, MapPin, Ticket, BadgeCheck, ChevronRight, Building2, Music2, ExternalLink,
} from 'lucide-react';
import AvatarComponent from '../components/Avatar';
import ShareButton from '../components/ShareButton';
import { ArtistListenBlock } from '../components/artist/ArtistListen';
import { collectArtistLinks } from '../components/artist/linkPlatforms';
import { plural } from '../lib/plural';
import { useSeo, seoTitle, ROBOTS_INDEX, ROBOTS_NOINDEX, ROBOTS_NOINDEX_FOLLOW } from '../lib/seo';
import { artistHref } from '../lib/artistUtils';
import { reachGoal } from '../lib/metrika';
import {
  sceneAPI, SOURCE_LABEL, concertDate, concertTime, downloadConcertIcs, mapsSearchUrl, priceLabel,
  type SceneConcert, type SceneConcertDetail,
} from '../lib/scene';

/**
 * /concerts/:id — карточка концерта «Сцены»: афиша, дата и время по городу,
 * площадка (на карте), билеты, возраст, организатор, описание, артист Moooza,
 * ещё концерты артиста и концерты города в тот же день.
 */
export default function ConcertPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['scene', 'concert', id],
    queryFn: () => sceneAPI.concert(id!),
    enabled: !!id,
    retry: (count, e: any) => e?.response?.status !== 404 && count < 1,
  });
  const c = q.data?.concert;
  const time = c ? concertTime(c) : null;
  const endTime = c?.endsAt && c.hasTime ? concertTime({ startsAt: c.endsAt, utcOffsetMin: c.utcOffsetMin, hasTime: true }) : null;
  const dateLong = c ? concertDate(c, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const future = c ? Date.parse(c.startsAt) > Date.now() - 3 * 60 * 60 * 1000 : true;

  useSeo({
    title: c ? seoTitle(c.title, `концерт ${concertDate(c)}${time ? `, ${time}` : ''}`, c.cityName) : seoTitle('Концерт'),
    description: c
      ? [`${c.title} — ${dateLong}${time ? `, ${time}` : ''}`, [c.venue, c.cityName].filter(Boolean).join(', '), c.description?.slice(0, 150)].filter(Boolean).join('. ')
      : null,
    canonical: id ? `/concerts/${id}` : null,
    // Индексируются будущие концерты артистов Moooza; чистая афиша — копия Qtickets.
    robots: !c ? null : !future ? ROBOTS_NOINDEX : c.artist?.verified ? ROBOTS_INDEX : ROBOTS_NOINDEX_FOLLOW,
  });

  const back = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(c ? `/scene/${c.citySlug}` : '/scene');
  };

  if (q.isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 max-w-2xl mx-auto px-4 pt-4 space-y-4">
        <div className="h-64 rounded-2xl bg-slate-900/60 animate-pulse" />
        <div className="h-8 w-2/3 rounded-lg bg-slate-900/60 animate-pulse" />
        <div className="h-32 rounded-2xl bg-slate-900/60 animate-pulse" />
      </div>
    );
  }
  if (!c) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <Ticket size={32} className="text-slate-600" />
        <p className="text-white font-semibold">Концерт не найден</p>
        <p className="text-slate-500 text-sm">Возможно, его отменили или он уже прошёл.</p>
        <Link to="/scene" className="mt-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold">Вся афиша</Link>
      </div>
    );
  }

  const poster = c.posterUrl ?? c.imageUrl;
  const price = priceLabel(c.priceFrom);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 pb-28">
      <div className="max-w-2xl mx-auto">
        {/* Шапка */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-2 py-2 flex items-center gap-1">
          <button onClick={back} aria-label="Назад" className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-white">
            <ArrowLeft size={22} />
          </button>
          <Link to={`/scene/${c.citySlug}`} className="flex-1 min-w-0 text-sm text-slate-400 hover:text-white truncate">
            Сцена · {c.cityName}
          </Link>
          <ShareButton
            url={`/concerts/${c.id}`}
            title={c.title}
            text={`${c.title} — ${dateLong}${time ? `, ${time}` : ''}, ${[c.venue, c.cityName].filter(Boolean).join(', ')}`}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
            iconSize={19}
          />
        </div>

        {/* Афиша: размытый фон + картинка целиком (афиши бывают и квадратные, и вертикальные) */}
        {poster && (
          <div className="relative sm:mx-4 sm:mt-3 sm:rounded-2xl overflow-hidden bg-slate-900 h-[min(56vw,360px)]">
            <img src={poster} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60" />
            <img src={poster} alt={c.title} className="relative w-full h-full object-contain" />
          </div>
        )}

        <div className="px-4 pt-4 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {c.type && <span className="px-2 py-0.5 rounded-lg bg-primary-500/15 text-primary-300 text-xs font-semibold">{c.type}</span>}
              {c.ageLimit && <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold">{c.ageLimit}</span>}
              {!future && <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold">Прошёл</span>}
            </div>
            <h1 className="text-2xl font-bold text-white leading-tight">{c.title}</h1>
          </div>

          {/* Когда · где · билеты */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/60 divide-y divide-slate-800/60">
            <div className="flex items-center gap-3 p-3.5">
              <CalendarDays size={18} className="text-emerald-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-white first-letter:uppercase">{dateLong}</p>
                <p className="text-xs text-slate-400">
                  {time ? `${time}${endTime ? ` – ${endTime}` : ''} · время местное` : 'Время уточняется'}
                </p>
              </div>
              {future && (
                <button
                  onClick={() => downloadConcertIcs(c)}
                  className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
                >
                  <CalendarPlus size={14} /> В календарь
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 p-3.5">
              <MapPin size={18} className="text-emerald-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-white">{c.venue ?? c.cityName}</p>
                <p className="text-xs text-slate-400">{c.address ?? c.cityName}</p>
              </div>
              <a
                href={mapsSearchUrl(c)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
              >
                На карте <ExternalLink size={12} />
              </a>
            </div>
            {(c.ticketUrl || price) && future && (
              <div className="p-3.5">
                {c.ticketUrl && (
                  <a
                    href={c.ticketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => reachGoal('scene_ticket_click', { source: c.source, from: 'concert_page' })}
                    className="w-full min-h-[52px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white text-base font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    <Ticket size={18} /> Купить билет{price ? ` · ${price}` : ''}
                  </a>
                )}
                {!c.ticketUrl && price && <p className="text-sm text-slate-300">Билеты {price}</p>}
                <p className="mt-2 text-[11px] text-slate-500 text-center">
                  {c.source === 'QTICKETS' ? 'Билеты продаёт Qtickets' : c.source === 'YANDEX_MUSIC' ? 'Билеты — Яндекс Афиша' : 'Ссылку на билеты добавил артист'}
                </p>
              </div>
            )}
          </div>

          {/* Артист Moooza: подробно — описание, жанры, слушатели, «Слушать» */}
          {c.artist && c.artistAbout && <ArtistAbout c={c} />}
          {c.artist && !c.artistAbout && (
            <Link
              to={artistHref(c.artist)}
              className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 transition-colors"
            >
              <AvatarComponent src={c.artist.avatar} name={c.artist.name} size={48} />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-white truncate flex items-center gap-1">
                  {c.artist.name} {c.artist.verified && <BadgeCheck size={15} className="text-sky-400 flex-shrink-0" />}
                </p>
                <p className="text-xs text-slate-400">Артист на Moooza · визитка, релизы и все концерты</p>
              </div>
              <ChevronRight size={18} className="text-slate-500 flex-shrink-0" />
            </Link>
          )}

          {c.organizer && (
            <p className="text-sm text-slate-400 flex items-center gap-2">
              <Building2 size={15} className="text-slate-500 flex-shrink-0" /> Организатор: <span className="text-slate-200">{c.organizer}</span>
            </p>
          )}

          {c.description && <Description text={c.description} />}

          {q.data!.moreByArtist.length > 0 && c.artist && (
            <Related title={`Ещё концерты · ${c.artist.name}`} items={q.data!.moreByArtist} showCity />
          )}
          {q.data!.sameDay.length > 0 && (
            <Related title={`В этот день · ${c.cityName}`} items={q.data!.sameDay} />
          )}

          <p className="pt-2 text-[11px] text-slate-600 leading-relaxed">
            Информация о мероприятии — {SOURCE_LABEL[c.source]}. Время — местное для города концерта.
          </p>
        </div>
      </div>
    </div>
  );
}

function ArtistAbout({ c }: { c: SceneConcertDetail }) {
  const a = c.artist!;
  const about = c.artistAbout!;
  const [open, setOpen] = useState(false);
  const listen = useMemo(() => collectArtistLinks(about.listen).listen, [about.listen]);
  const long = !!about.description && (about.description.length > 300 || about.description.split('\n').length > 5);
  return (
    <section className="rounded-2xl bg-slate-900/60 border border-slate-800/60 overflow-hidden">
      <h2 className="px-4 pt-3.5 text-sm font-semibold text-slate-300">Об артисте</h2>
      <Link to={artistHref(a)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors">
        <AvatarComponent src={a.avatar} name={a.name} size={52} />
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-white truncate flex items-center gap-1">
            {a.name} {a.verified && <BadgeCheck size={16} className="text-sky-400 flex-shrink-0" />}
          </p>
          {about.listeners != null && (
            <p className="text-xs text-slate-400">
              {about.listeners.toLocaleString('ru-RU')} {plural(about.listeners, 'слушатель', 'слушателя', 'слушателей')} в месяц
            </p>
          )}
          {about.genres.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {about.genres.map((g) => <span key={g} className="px-1.5 py-0.5 rounded-md bg-slate-800 text-[11px] text-slate-300">{g}</span>)}
            </div>
          )}
        </div>
        <ChevronRight size={18} className="text-slate-500 flex-shrink-0" />
      </Link>
      {about.description && (
        <div className="px-4 pb-1">
          <p className={`text-sm text-slate-300 leading-relaxed whitespace-pre-line ${!open && long ? 'line-clamp-5' : ''}`}>{about.description}</p>
          {long && (
            <button onClick={() => setOpen((v) => !v)} className="min-h-[36px] text-sm font-medium text-primary-300 hover:text-white">
              {open ? 'Свернуть' : 'Читать дальше'}
            </button>
          )}
        </div>
      )}
      {listen.length > 0 && (
        <div className="px-4 pt-2">
          <ArtistListenBlock artistId={a.id} links={listen} canEdit={false} onEditLinks={() => {}} />
        </div>
      )}
      <div className="px-4 pb-4 pt-1">
        <Link
          to={artistHref(a)}
          className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          Открыть визитку · релизы и все концерты
        </Link>
      </div>
    </section>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420 || text.split('\n').length > 8;
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-300 mb-1.5">О концерте</h2>
      <p className={`text-[15px] text-slate-300 leading-relaxed whitespace-pre-line ${!open && long ? 'line-clamp-[8]' : ''}`}>{text}</p>
      {long && (
        <button onClick={() => setOpen((v) => !v)} className="mt-1 min-h-[40px] text-sm font-medium text-primary-300 hover:text-white">
          {open ? 'Свернуть' : 'Показать полностью'}
        </button>
      )}
    </section>
  );
}

function Related({ title, items, showCity = false }: { title: string; items: SceneConcert[]; showCity?: boolean }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-300 mb-2">{title}</h2>
      <ul className="rounded-2xl bg-slate-900/60 border border-slate-800/60 divide-y divide-slate-800/60 overflow-hidden">
        {items.map((r) => {
          const t = concertTime(r);
          return (
            <li key={r.id}>
              <Link to={`/concerts/${r.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-800/40 transition-colors">
                <div className="w-12 h-12 flex-shrink-0 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center">
                  {r.imageUrl ? <img src={r.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Music2 size={18} className="text-slate-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{r.title}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {concertDate(r)}{t ? `, ${t}` : ''} · {[r.venue, showCity ? r.cityName : null].filter(Boolean).join(', ')}
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
