import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import {
  ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, Clock, Disc3, Eye, Headphones, IdCard,
  MapPin, MessageCircle, Mic2, Pause, Play, Search, Send, Sparkles, Ticket, Users, Wallet, Zap,
} from 'lucide-react';
import FindDemo from './FindDemo';
import ArtistCardMock from './ArtistCardMock';
import { Eyebrow, GlassCard, Glow, Grad, MockAvatar, SectionHead, TELEGRAM_CHANNEL_URL, fadeUp } from './ui';

/**
 * Bento-сетка преимуществ. Мобильные — одна колонка в порядке важности;
 * md — 2 колонки, lg — 3 (герой «Ищу музыканта» на две, визитка на две строки).
 */

// ── Мелочи ────────────────────────────────────────────────────────────────────

function CardLabel({ icon: Icon, children, tone = 'brand' }: { icon: typeof Zap; children: ReactNode; tone?: 'brand' | 'amber' | 'sky' }) {
  const box = tone === 'amber'
    ? 'bg-amber-400/10 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)]'
    : tone === 'sky'
      ? 'bg-sky-400/10 text-sky-300 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.25)]'
      : 'bg-gradient-to-br from-[#40d6f0]/15 to-[#966cf6]/20 text-[#7fe3f5] shadow-[inset_0_0_0_1px_rgba(64,214,240,0.22)]';
  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${box}`}>
        <Icon size={16} />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{children}</span>
    </div>
  );
}

function CardTitle({ children, big = false }: { children: ReactNode; big?: boolean }) {
  return (
    <h3 className={`mt-4 font-semibold tracking-[-0.025em] text-white text-balance ${big ? 'text-[1.7rem] leading-[1.1] sm:text-[2.1rem]' : 'text-xl leading-snug sm:text-[1.4rem]'}`}>
      {children}
    </h3>
  );
}

function CardText({ children }: { children: ReactNode }) {
  return <p className="mt-2.5 text-[15px] leading-relaxed text-slate-400">{children}</p>;
}

function CardLink({ to, href, children }: { to?: string; href?: string; children: ReactNode }) {
  const cls = 'group/link inline-flex items-center gap-1.5 min-h-[44px] text-sm font-medium text-slate-200 hover:text-white transition-colors';
  const inner = (
    <>
      {children}
      {href
        ? <ArrowUpRight size={15} className="text-[#40d6f0] transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
        : <ArrowRight size={15} className="text-[#40d6f0] transition-transform group-hover/link:translate-x-0.5" />}
    </>
  );
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
    : <Link to={to!} className={cls}>{inner}</Link>;
}

const inset = 'shadow-[inset_0_0_0_1px_rgba(148,163,184,0.1)]';

// ── Мини-мокапы ─────────────────────────────────────────────────────────────

function LineupMock() {
  return (
    <div aria-hidden className="space-y-2">
      <div className={`rounded-2xl bg-slate-950/60 p-3 ${inset}`}>
        <div className="flex gap-3">
          <div className="w-12 flex-shrink-0 rounded-xl bg-gradient-to-b from-[#40d6f0]/15 to-[#966cf6]/15 shadow-[inset_0_0_0_1px_rgba(64,214,240,0.25)] flex flex-col items-center justify-center py-2 leading-none">
            <span className="text-lg font-bold text-white">28</span>
            <span className="text-[10px] uppercase text-[#7fe3f5] mt-1">нояб</span>
            <span className="text-[9.5px] text-slate-400 mt-1">19:00</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-white leading-snug">Разогрев на&nbsp;рок-концерт</p>
            <p className="mt-1 flex items-center gap-1 text-[11.5px] text-slate-400"><MapPin size={11} className="flex-shrink-0" />Москва · клуб</p>
            <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[11.5px]">
              <span className="inline-flex items-center gap-1 text-slate-300"><Mic2 size={11} className="text-slate-500" />Разогрев</span>
              <span className="inline-flex items-center gap-1 text-amber-300"><Wallet size={11} className="text-amber-500/80" />Гонорар</span>
              <span className="inline-flex items-center gap-1 text-slate-300"><Users size={11} className="text-slate-500" />2&nbsp;места</span>
            </div>
          </div>
        </div>
      </div>
      <div className={`ml-5 rounded-2xl bg-white/[0.04] p-3 ${inset}`}>
        <div className="flex items-center gap-2">
          <MockAvatar initials="СО" className="w-7 h-7 text-[10px]" from="#40d6f0" to="#a855f7" />
          <span className="text-[13px] font-semibold text-white truncate">Синие окна</span>
          <span className="ml-auto flex-shrink-0 rounded-md bg-[#40d6f0]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#7fe3f5]">Отклик</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><Disc3 size={11} />3&nbsp;релиза</span>
          <span className="inline-flex items-center gap-1"><Headphones size={11} />~12&nbsp;тыс. слушателей</span>
          <span className="inline-flex items-center gap-1"><Ticket size={11} />18&nbsp;концертов</span>
        </div>
      </div>
    </div>
  );
}

const CREDITS = [
  { title: 'Ночной трамвай', meta: 'Синие окна · барабаны', cover: 'linear-gradient(135deg,#40d6f0,#3b82f6)', icon: Disc3 },
  { title: 'Клип «Север»', meta: 'Лето в городе · барабаны', cover: 'conic-gradient(from 200deg at 40% 60%,#966cf6,#ec4899,#f59e0b,#966cf6)', icon: Play },
];

function ExperienceMock() {
  return (
    <div aria-hidden className={`rounded-2xl bg-slate-950/60 p-3 ${inset}`}>
      <div className="space-y-1.5">
        {CREDITS.map((c) => (
          <div key={c.title} className="flex items-center gap-3 rounded-xl bg-white/[0.035] p-2">
            <span className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ backgroundImage: c.cover }}>
              <c.icon size={15} className="text-white/80" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-white truncate">{c.title}</span>
              <span className="block text-[11px] text-slate-400 truncate">{c.meta}</span>
            </span>
            <span className="w-6 h-6 rounded-full flex-shrink-0 bg-emerald-400/15 text-emerald-300 flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(52,211,153,0.3)]" title="Участие подтверждено">
              <BadgeCheck size={14} />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 px-1.5 pb-1">
        <p className="text-[1.3rem] font-semibold tracking-[-0.02em] text-white leading-tight">
          12&nbsp;релизов · <span className="lp-grad-text">~40&nbsp;тыс.</span> слушателей
        </p>
        <p className="mt-1 text-xs text-slate-500">аудитория на&nbsp;Яндекс Музыке</p>
      </div>
    </div>
  );
}

const WAVE = [30, 52, 40, 68, 90, 62, 44, 78, 100, 70, 48, 36, 58, 84, 66, 42, 30, 54, 76, 92, 60, 40, 28, 46, 70, 86, 58, 38, 50, 64];

function DemoMock() {
  const [playing, setPlaying] = useState(true);
  return (
    <div className={`rounded-2xl bg-slate-950/60 p-3.5 ${inset}`}>
      <div className="flex items-center gap-3" aria-hidden>
        <MockAvatar initials="АК" className="w-10 h-10 text-[12px]" from="#f472b6" to="#966cf6" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-white truncate">Анна К.</p>
          <p className="text-[11.5px] text-slate-400 truncate">Вокалистка · Москва</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
          aria-label={playing ? 'Остановить пример демо' : 'Включить пример демо'}
          className="relative w-11 h-11 rounded-full bg-white text-slate-950 flex items-center justify-center flex-shrink-0 transition-transform active:scale-95"
        >
          {playing ? <Pause size={17} fill="currentColor" className="relative" /> : <Play size={17} fill="currentColor" className="relative ml-0.5" />}
        </button>
        <div aria-hidden className="flex-1 min-w-0 flex items-center gap-[3px] h-10 overflow-hidden">
          {WAVE.map((h, i) => (
            <span
              key={i}
              className={`lp-wave ${playing ? '' : 'lp-wave-paused'} flex-1 min-w-[2px] rounded-full bg-gradient-to-t from-[#40d6f0] to-[#966cf6]`}
              style={{ height: `${h}%`, animationDelay: `${-(i * 97) % 1150}ms`, opacity: playing ? 1 : 0.5 }}
            />
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-3 flex items-center gap-2.5">
        <div className="relative h-1 flex-1 rounded-full bg-white/10 overflow-hidden">
          <span className={`lp-progress absolute inset-0 rounded-full bg-gradient-to-r from-[#40d6f0] to-[#966cf6] ${playing ? '' : 'lp-wave-paused'}`} />
        </div>
        <span className="text-[11px] tabular-nums text-slate-400">0:30</span>
      </div>
    </div>
  );
}

function FastMock() {
  return (
    <div aria-hidden className="space-y-2">
      <div className={`rounded-2xl bg-slate-950/60 p-3 flex items-center gap-3 ${inset}`}>
        <MockAvatar initials="ДС" className="w-10 h-10 text-[12px]" from="#22d3ee" to="#6366f1" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-white truncate">Дмитрий С. · звукорежиссёр</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-amber-300 bg-amber-500/10 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]">
            <Zap size={11} fill="currentColor" /> Отвечает быстро
          </span>
        </div>
      </div>
      <div className={`rounded-2xl bg-slate-950/40 p-3 flex items-center gap-3 opacity-70 ${inset}`}>
        <MockAvatar initials="ОЛ" className="w-10 h-10 text-[12px]" from="#64748b" to="#334155" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-slate-200 truncate">Ольга Л. · скрипачка</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-sky-300 bg-sky-500/10 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.25)]">
            <Clock size={11} /> Отвечает в&nbsp;течение дня
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Секция ──────────────────────────────────────────────────────────────────

export default function Bento({ profCount }: { profCount: number }) {
  const cell = (delay: number) => fadeUp(delay, 28);

  return (
    <section id="features" className="relative px-4 sm:px-6 py-16 sm:py-24 overflow-x-clip">
      <div className="max-w-6xl mx-auto">
        <m.div {...fadeUp()}>
          <SectionHead
            eyebrow="Что умеет Moooza"
            title={<>Всё, чтобы <Grad>играть</Grad>, а&nbsp;не искать</>}
            sub="Новые инструменты для музыкантов, артистов и&nbsp;тех, кто их ищет."
          />
        </m.div>

        <div className="mt-12 sm:mt-16 grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3 lg:grid-flow-dense">
          {/* 1. Ищу музыканта — герой */}
          <m.div {...cell(0)} className="relative md:col-span-2">
            <Glow color="mix" className="-inset-x-10 -inset-y-16" />
            <GlassCard strong className="relative h-full p-5 sm:p-8">
              <div className="grid grid-cols-1 gap-7 lg:gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <CardLabel icon={Search}>Ищу музыканта</CardLabel>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-950">Новое</span>
                  </div>
                  <CardTitle big>Опишите задачу <Grad>одной фразой</Grad></CardTitle>
                  <CardText>
                    Напишите, как в&nbsp;мессенджере, кто нужен. Мы&nbsp;поймём профессию, город, дату и&nbsp;бюджет&nbsp;— и&nbsp;отправим запрос 10&nbsp;самым подходящим исполнителям.
                  </CardText>
                  <Link
                    to="/find"
                    className="group mt-6 inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-2xl bg-white text-slate-950 text-[15px] font-semibold hover:bg-slate-100 transition-colors w-full sm:w-auto"
                  >
                    <Sparkles size={16} />
                    Попробовать
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
                <FindDemo />
              </div>
            </GlassCard>
          </m.div>

          {/* 2. Визитка артиста */}
          <m.div {...cell(0.08)} className="relative md:row-span-2">
            <Glow color="violet" className="-inset-x-8 top-1/3 -bottom-10" />
            <GlassCard strong className="relative h-full p-5 sm:p-7 flex flex-col">
              <CardLabel icon={IdCard}>Визитка артиста</CardLabel>
              <CardTitle>Одна ссылка для&nbsp;шапки профиля</CardTitle>
              <CardText>
                <span className="text-slate-200">moooza.ru/artist/имя</span>&nbsp;— все площадки от&nbsp;Яндекс Музыки до&nbsp;Звука, последний релиз, ближайшие концерты, QR-код для&nbsp;афиши и&nbsp;мерча, статистика переходов.
              </CardText>
              <div className="mt-8 flex-1 flex items-center justify-center pb-2">
                <ArtistCardMock />
              </div>
              <div className="mt-4">
                <CardLink to="/search?tab=artists">Смотреть артистов</CardLink>
              </div>
            </GlassCard>
          </m.div>

          {/* 3. Биржа лайнапов */}
          <m.div {...cell(0.05)}>
            <GlassCard className="h-full p-5 sm:p-7 flex flex-col">
              <CardLabel icon={CalendarDays}>Биржа лайнапов</CardLabel>
              <CardTitle>Сцены ищут артистов</CardTitle>
              <CardText>
                Организаторы и&nbsp;промоутеры собирают артистов на&nbsp;концерты и&nbsp;разогревы. Откликайтесь от&nbsp;имени группы&nbsp;— с&nbsp;релизами, слушателями и&nbsp;концертами в&nbsp;отклике.
              </CardText>
              <div className="mt-auto pt-6"><LineupMock /></div>
              <div className="mt-3"><CardLink to="/lineups">Открыть лайнапы</CardLink></div>
            </GlassCard>
          </m.div>

          {/* 4. Подтверждённый опыт */}
          <m.div {...cell(0.1)}>
            <GlassCard className="h-full p-5 sm:p-7 flex flex-col">
              <CardLabel icon={BadgeCheck}>Подтверждённый опыт</CardLabel>
              <CardTitle>Портфолио, которое говорит за&nbsp;вас</CardTitle>
              <CardText>
                Релизы и&nbsp;клипы, где вас отметили и&nbsp;вы&nbsp;подтвердили участие, собираются в&nbsp;портфолио&nbsp;— с&nbsp;аудиторией на&nbsp;Яндекс Музыке.
              </CardText>
              <div className="mt-auto pt-6"><ExperienceMock /></div>
            </GlassCard>
          </m.div>

          {/* 5. Аудиодемо */}
          <m.div {...cell(0)}>
            <GlassCard className="h-full p-5 sm:p-7 flex flex-col">
              <CardLabel icon={Headphones}>Аудиодемо</CardLabel>
              <CardTitle>Слушайте прямо в&nbsp;каталоге</CardTitle>
              <CardText>Нажмите&nbsp;▶ на&nbsp;карточке&nbsp;— 30&nbsp;секунд демо без&nbsp;перехода в&nbsp;профиль.</CardText>
              <div className="mt-auto pt-6"><DemoMock /></div>
            </GlassCard>
          </m.div>

          {/* 6. Отвечает быстро */}
          <m.div {...cell(0.08)}>
            <GlassCard className="h-full p-5 sm:p-7 flex flex-col">
              <CardLabel icon={Zap} tone="amber">Отвечает быстро</CardLabel>
              <CardTitle>Видно, кто на&nbsp;связи</CardTitle>
              <CardText>Бейдж ⚡ у&nbsp;тех, кто обычно отвечает в&nbsp;течение часа. Пишите тем, кто ответит сегодня.</CardText>
              <div className="mt-auto pt-6"><FastMock /></div>
            </GlassCard>
          </m.div>

          {/* 7. Telegram */}
          <m.div {...cell(0.16)} className="md:col-span-2 lg:col-span-1">
            <GlassCard className="h-full p-5 sm:p-7 flex flex-col">
              <CardLabel icon={Send} tone="sky">Telegram</CardLabel>
              <CardTitle>Свежие заказы в&nbsp;канале</CardTitle>
              <CardText>
                В&nbsp;<span className="text-slate-200">@moooza_jobs</span>&nbsp;— новые заказы и&nbsp;вакансии с&nbsp;хэштегами города, профессии и&nbsp;жанра.
              </CardText>
              <div aria-hidden className="mt-auto pt-6">
                <div className={`rounded-2xl bg-slate-950/60 p-3 flex items-center gap-3 ${inset}`}>
                  <span className="w-10 h-10 rounded-full flex-shrink-0 bg-gradient-to-br from-[#40d6f0] to-[#966cf6] flex items-center justify-center text-[13px] font-bold text-white">M</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-white truncate">MOOOZA | Работа</span>
                      <span className="text-[10.5px] text-slate-500 flex-shrink-0">сейчас</span>
                    </span>
                    <span className="block text-[12px] text-slate-400 truncate">Заказ: барабанщик на&nbsp;концерт, Самара</span>
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['#самара', '#барабанщик', '#метал', '#удалённо'].map((t) => (
                    <span key={t} className="rounded-full bg-sky-400/10 px-3 py-1.5 text-[12.5px] font-medium text-sky-300 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.2)]">{t}</span>
                  ))}
                </div>
              </div>
              <div className="mt-3"><CardLink href={TELEGRAM_CHANNEL_URL}>Открыть канал</CardLink></div>
            </GlassCard>
          </m.div>
        </div>

        {/* Основа платформы */}
        <m.div {...fadeUp(0.05)} className="mt-16 sm:mt-20">
          <Eyebrow>И&nbsp;всё для&nbsp;работы</Eyebrow>
          <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-[28px] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Search, title: 'Каталог исполнителей', text: <>{profCount}&nbsp;профессий и&nbsp;фильтры по&nbsp;жанрам и&nbsp;городам.</> },
              { icon: MessageCircle, title: 'Чат с голосовыми', text: <>Голосовые сообщения с&nbsp;расшифровкой в&nbsp;текст.</> },
              { icon: Users, title: 'Связи и отзывы', text: <>Деловые связи с&nbsp;коллегами и&nbsp;отзывы партнёров по&nbsp;работе.</> },
              { icon: Eye, title: 'Открыто для гостей', text: <>Ленту, артистов и&nbsp;исполнителей можно смотреть сразу&nbsp;— писать и&nbsp;откликаться после входа.</> },
            ].map((f) => (
              <div key={f.title} className="bg-[#050a19] p-5 sm:p-7 flex gap-4 sm:block">
                <span className="w-10 h-10 sm:w-auto sm:h-auto rounded-xl sm:rounded-none bg-[#40d6f0]/10 sm:bg-transparent flex items-center justify-center sm:block flex-shrink-0">
                  <f.icon size={20} className="text-[#40d6f0]" />
                </span>
                <div className="min-w-0">
                  <p className="sm:mt-4 text-[15px] font-semibold text-white">{f.title}</p>
                  <p className="mt-1 sm:mt-1.5 text-sm leading-relaxed text-slate-400">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </m.div>
      </div>
    </section>
  );
}
