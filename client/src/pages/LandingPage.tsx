import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { m, AnimatePresence, LazyMotion, MotionConfig, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, BadgeCheck, CalendarDays, FileText, Headphones, IdCard, Search, Send, Smartphone, Zap,
} from 'lucide-react';
import { siteSettingsAPI, referenceAPI } from '../lib/api';
import LegalDocsModal from '../components/LegalDocsModal';
import { useSeo } from '../lib/seo';
import { trackGuestView, reachGoal } from '../lib/metrika';
import { ANDROID_APK_URL, isAndroidBrowser } from '../lib/androidApp';
import { openAuthGate } from '../components/AuthGateModal';
import Bento from '../components/landing/Bento';
import HowItWorks from '../components/landing/HowItWorks';
import TelegramBlock from '../components/landing/TelegramBlock';
import LaunchOptions from '../components/landing/LaunchOptions';
import { isInstalledApp } from '../lib/pwaInstall';
import { EASE, GlassCard, Glow, Grad, TELEGRAM_CHANNEL_URL, fadeUp } from '../components/landing/ui';
import '../components/landing/landing.css';

// Фичи анимаций подгружаются отдельным чанком уже после первого рендера.
const loadMotionFeatures = () => import('../components/landing/motionFeatures').then((r) => r.default);

// ─── Логотип: обрезанный и сжатый вордмарк (оригинал /logo.png — 1,2 МБ) ─────
function Logo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/landing-assets/logo-wordmark.png"
      width={565}
      height={96}
      alt="Moooza"
      decoding="async"
      className={`w-auto select-none ${className}`}
    />
  );
}

// ─── Hero: «Здесь находят …» с меняющимся словом ─────────────────────────────
const HERO_WORDS = ['барабанщика', 'сцену', 'заказы', 'вокалистку', 'свой состав', 'гитариста'];

function RotatingWord() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((v) => (v + 1) % HERO_WORDS.length), 2600);
    return () => clearInterval(t);
  }, [reduce]);
  return (
    <span aria-hidden className="grid justify-items-center overflow-hidden pb-[0.14em] -mb-[0.14em]">
      <AnimatePresence initial={false}>
        <m.span
          key={i}
          initial={{ y: '105%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-105%', opacity: 0 }}
          transition={{ duration: 0.65, ease: EASE }}
          className="lp-grad-text col-start-1 row-start-1 whitespace-nowrap pr-[0.04em]"
        >
          {HERO_WORDS[i]}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

/** Эквалайзер внизу hero: CSS-анимация scaleY, при reduced-motion — статичен. */
function Equalizer() {
  const bars = useMemo(
    () => Array.from({ length: 112 }, (_, i) => ({
      h: 16 + Math.abs(Math.sin(i * 0.52)) * 58 + ((i * 37) % 19),
      delay: (i * 173) % 2600,
      dur: 2.2 + ((i * 7) % 10) / 9,
    })),
    [],
  );
  const mask = 'linear-gradient(to right, transparent, #000 18%, #000 82%, transparent)';
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-24 sm:h-32 flex items-end justify-center gap-[5px] overflow-hidden opacity-[0.32]"
      style={{ WebkitMaskImage: mask, maskImage: mask }}
    >
      {bars.map((b, i) => (
        <span
          key={i}
          className="lp-eq w-[3px] flex-shrink-0 rounded-full bg-gradient-to-t from-[#40d6f0]/0 via-[#40d6f0]/60 to-[#966cf6]"
          style={{ height: `${Math.min(b.h, 100)}%`, animationDelay: `-${b.delay}ms`, animationDuration: `${b.dur}s` }}
        />
      ))}
    </div>
  );
}

// ─── «Что нового» — бегущая строка ──────────────────────────────────────────
const NEWS: Array<{ icon: typeof Zap; text: ReactNode }> = [
  { icon: Search, text: <>«Ищу музыканта»&nbsp;— запрос одной фразой</> },
  { icon: IdCard, text: 'Визитка артиста со всеми площадками' },
  { icon: CalendarDays, text: 'Биржа лайнапов' },
  { icon: BadgeCheck, text: 'Подтверждённый опыт' },
  { icon: Headphones, text: 'Аудиодемо в каталоге' },
  { icon: Zap, text: '«Отвечает быстро»' },
  { icon: Send, text: 'Заказы в Telegram' },
];

function WhatsNew() {
  const fade = 'linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)';
  return (
    <section aria-label="Что нового" className="relative border-y border-white/[0.06] bg-white/[0.015]">
      <div className="flex items-center">
        <div className="relative z-10 flex-shrink-0 pl-4 sm:pl-6 lg:pl-10 pr-3 py-3.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#40d6f0] to-[#966cf6] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-950 whitespace-nowrap">
            Что нового
          </span>
        </div>
        <div className="relative flex-1 min-w-0 overflow-hidden" style={{ WebkitMaskImage: fade, maskImage: fade }}>
          <div className="lp-marquee flex w-max animate-marquee [animation-duration:46s]">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1} className="flex flex-shrink-0">
                {NEWS.map((n, i) => (
                  <li key={i} className="flex items-center gap-2 pr-10 py-3.5 text-sm text-slate-300 whitespace-nowrap">
                    <n.icon size={15} className="text-[#40d6f0] flex-shrink-0" />
                    {n.text}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── LandingPage ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [legalOpen, setLegalOpen] = useState(false);

  useSeo({
    title: 'Moooza — Музыкальная социальная сеть',
    description: 'Moooza — соцсеть для музыкантов: найдите исполнителя одной фразой, соберите лайнап, заведите визитку артиста. Ленту и каталог можно смотреть сразу.',
    canonical: '/',
  });
  useEffect(() => { trackGuestView('landing'); }, []);

  const { data: settings } = useQuery({
    queryKey: ['site-settings'],
    queryFn: async () => { const { data } = await siteSettingsAPI.get(); return data as Record<string, string>; },
    staleTime: 60_000,
  });

  const { data: professions } = useQuery({
    queryKey: ['landing-professions'],
    queryFn: async () => { const { data } = await referenceAPI.getProfessions({ all: true }); return data as any[]; },
    staleTime: 300_000,
  });

  const loginEnabled = settings?.loginEnabled !== 'false';
  const registrationEnabled = settings?.registrationEnabled !== 'false';
  const guestBrowsingEnabled = settings?.guestBrowsingEnabled === 'true';
  // APK — только в браузере на Android и только когда админ включил ссылку.
  const offerApk = settings?.androidApkEnabled === 'true' && isAndroidBrowser();
  const profCount = professions?.length ?? 126;

  const openWaitlist = (from: string) => openAuthGate('generic', { from }, undefined, 'waitlist');

  // Способы запуска (веб, PWA iPhone/Android, APK, RuStore) — сразу под главными
  // кнопками, чтобы были на первом экране. В установленном приложении не нужны.
  const launchOptions = !isInstalledApp() && (
    <div className="mt-6 sm:mt-10">
      <LaunchOptions apkEnabled={settings?.androidApkEnabled === 'true'} />
    </div>
  );

  const primaryBtn = 'group inline-flex items-center justify-center gap-2 min-h-[54px] px-5 sm:px-8 whitespace-nowrap rounded-2xl bg-white text-slate-950 text-[16px] font-semibold hover:bg-slate-100 transition-colors shadow-[0_18px_50px_-18px_rgba(150,108,246,0.85)]';
  const secondaryBtn = 'inline-flex items-center justify-center gap-2 min-h-[54px] px-5 sm:px-7 whitespace-nowrap rounded-2xl text-slate-100 text-[16px] font-semibold bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(148,163,184,0.24)] transition-colors';
  const textLinkBase = 'inline-flex items-center min-h-[44px] px-2.5 rounded-lg hover:text-white transition-colors';
  const textLink = `${textLinkBase} text-slate-300`;
  const textLinkAccent = `${textLinkBase} text-[#7fe3f5]`;
  const navLink = 'inline-flex items-center min-h-[44px] px-2.5 sm:px-3 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors';

  return (
    // LazyMotion + m.* — только нужные фичи framer-motion (меньше JS на первом экране)
    <LazyMotion features={loadMotionFeatures} strict>
    <MotionConfig reducedMotion="user">
      <div className="lp-root relative min-h-screen bg-[#020617] text-slate-100 overflow-x-hidden">
        {/* Шум поверх всего фона страницы */}
        <div aria-hidden className="lp-noise pointer-events-none absolute inset-0 z-0" />

        {/* ── ШАПКА ─────────────────────────────────────────────────────────── */}
        <header className="lp-header fixed top-0 inset-x-0 z-40 bg-[#020617]/75 backdrop-blur-xl border-b border-white/[0.06]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-2">
            <Link to="/" aria-label="Moooza — на главную" className="flex-shrink-0 inline-flex items-center min-h-[44px]">
              <Logo className="h-[18px] sm:h-[22px]" />
            </Link>
            <nav className="flex items-center gap-0.5 sm:gap-1 min-w-0">
              {guestBrowsingEnabled && (
                <>
                  <Link to="/feed" className={`${navLink} hidden xs:inline-flex`}>Лента</Link>
                  <Link to="/search" className={navLink}>Каталог</Link>
                  <Link to="/scene" className={`${navLink} hidden xs:inline-flex`}>Сцена</Link>
                  <Link to="/search?tab=artists" className={`${navLink} hidden sm:inline-flex`}>Артисты</Link>
                  <Link to="/lineups" className={`${navLink} hidden md:inline-flex`}>Лайнапы</Link>
                </>
              )}
              {loginEnabled && (
                <Link
                  to="/login"
                  className="ml-1 inline-flex items-center min-h-[44px] px-4 rounded-xl text-sm font-semibold text-white bg-white/[0.07] hover:bg-white/[0.12] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)] transition-colors"
                >
                  Войти
                </Link>
              )}
            </nav>
          </div>
        </header>

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <section
          className="relative z-[1] px-4 sm:px-6 pb-32 sm:pb-44 lg:min-h-[92vh] flex flex-col justify-center"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6.25rem)' }}
        >
          {/* фон: сетка + свечения (radial-gradient, без filter: blur) */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lp-grid absolute inset-0" />
            <div
              className="absolute left-1/2 top-[-22%] h-[760px] w-[1200px] -translate-x-1/2"
              style={{ background: 'radial-gradient(closest-side, rgba(64,214,240,0.17), rgba(150,108,246,0.11) 55%, rgba(2,6,23,0) 100%)' }}
            />
            <div
              className="absolute right-[-18%] top-[38%] h-[560px] w-[640px]"
              style={{ background: 'radial-gradient(closest-side, rgba(168,85,247,0.14), rgba(2,6,23,0) 100%)' }}
            />
            <div
              className="absolute left-[-22%] top-[52%] h-[480px] w-[580px]"
              style={{ background: 'radial-gradient(closest-side, rgba(64,214,240,0.09), rgba(2,6,23,0) 100%)' }}
            />
          </div>
          <Equalizer />

          <div className="relative z-10 max-w-4xl mx-auto w-full text-center">
            <m.div {...fadeUp(0)} className="flex justify-center">
              <Link
                to="/find"
                className="group inline-flex items-center gap-2.5 min-h-[44px] max-w-full rounded-full bg-white/[0.04] pl-1.5 pr-4 text-[13.5px] text-slate-300 hover:text-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] backdrop-blur-md transition-colors"
              >
                <span className="rounded-full bg-gradient-to-r from-[#40d6f0] to-[#966cf6] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-950">Новое</span>
                <span className="truncate">
                  «Ищу музыканта»<span className="hidden sm:inline">&nbsp;— запрос одной фразой</span>
                </span>
                <ArrowRight size={14} className="flex-shrink-0 text-[#40d6f0] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </m.div>

            <m.h1
              {...fadeUp(0.08)}
              className="mt-7 sm:mt-9 text-[clamp(2.4rem,11vw,5.5rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-white"
            >
              <span className="sr-only">Moooza&nbsp;— здесь находят барабанщика, сцену, заказы и&nbsp;свой состав</span>
              <span aria-hidden className="block">Здесь находят</span>
              <RotatingWord />
            </m.h1>

            <m.p {...fadeUp(0.16)} className="mt-6 sm:mt-7 text-[17px] sm:text-xl leading-relaxed text-slate-400 max-w-[34rem] mx-auto text-balance">
              Moooza&nbsp;— соцсеть и&nbsp;маркетплейс для&nbsp;музыкантов. Исполнители, сцены, заказы и&nbsp;визитка артиста&nbsp;— в&nbsp;одном месте.
            </m.p>

            {!registrationEnabled && !guestBrowsingEnabled && (
              <m.div {...fadeUp(0.22)} className="mx-auto mt-8 max-w-md px-4 py-3 rounded-2xl bg-amber-500/10 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)] text-amber-300 text-sm leading-relaxed">
                Регистрация временно закрыта. Если у&nbsp;вас уже есть аккаунт&nbsp;— войдите.
              </m.div>
            )}

            {/* Гостевой режим: главный путь — открыть платформу гостем (лента) */}
            {guestBrowsingEnabled && (
              <m.div {...fadeUp(0.24)} className="mt-9 sm:mt-10">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-sm sm:max-w-none mx-auto">
                  <Link to="/feed" className={primaryBtn}>
                    Открыть Moooza
                    <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link to="/search" className={secondaryBtn}>
                    <Search size={17} /> Найти исполнителя
                  </Link>
                </div>
                {launchOptions}
                <div className="mt-6 flex items-center justify-center gap-x-3 flex-wrap text-sm">
                  <Link to="/search?tab=artists" className={textLink}>Артисты</Link>
                  {registrationEnabled ? (
                    <button type="button" onClick={() => navigate('/register')} className={textLinkAccent}>Создать аккаунт</button>
                  ) : (
                    <button type="button" onClick={() => openWaitlist('landing')} className={textLinkAccent}>Получить доступ</button>
                  )}
                  {loginEnabled && (
                    <button type="button" onClick={() => navigate('/login')} className={textLink}>У&nbsp;меня есть аккаунт</button>
                  )}
                </div>
                {!registrationEnabled && (
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-500 max-w-xs sm:max-w-sm mx-auto">
                    Вход пока по&nbsp;приглашениям&nbsp;— ленту, артистов и&nbsp;исполнителей можно смотреть уже сейчас.
                  </p>
                )}
              </m.div>
            )}

            {!guestBrowsingEnabled && (registrationEnabled || loginEnabled) && (
              <m.div {...fadeUp(0.24)} className="mt-9 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-sm sm:max-w-none mx-auto">
                {registrationEnabled && (
                  <button type="button" onClick={() => navigate('/register')} className={primaryBtn}>
                    Начать бесплатно
                    <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
                {loginEnabled && (
                  <button type="button" onClick={() => navigate('/login')} className={secondaryBtn}>
                    Войти
                  </button>
                )}
              </m.div>
            )}

            {!guestBrowsingEnabled && (
              <m.div {...fadeUp(0.3)} className="mt-3 flex justify-center text-sm">
                <Link to="/feed" className={textLinkAccent}>Смотреть ленту</Link>
              </m.div>
            )}
            {!guestBrowsingEnabled && <m.div {...fadeUp(0.32)}>{launchOptions}</m.div>}
          </div>
        </section>

        <div className="relative z-[1]">
          {/* ── ЧТО НОВОГО ─────────────────────────────────────────────────── */}
          <WhatsNew />

          {/* ── ПРЕИМУЩЕСТВА (bento) ───────────────────────────────────────── */}
          <Bento profCount={profCount} />

          {/* ── КАК ЭТО РАБОТАЕТ ───────────────────────────────────────────── */}
          <HowItWorks
            registrationEnabled={registrationEnabled}
            onRegister={() => navigate('/register')}
            onWaitlist={() => openWaitlist('landing_how')}
          />

          {/* ── TELEGRAM ───────────────────────────────────────────────────── */}
          <TelegramBlock />

          {/* ── ФИНАЛЬНЫЙ CTA ──────────────────────────────────────────────── */}
          {(guestBrowsingEnabled || registrationEnabled) && (
            <section className="relative px-4 sm:px-6 pt-4 pb-24 sm:pb-32 overflow-x-clip">
              <m.div {...fadeUp()} className="relative max-w-4xl mx-auto">
                <Glow color="mix" className="-inset-x-16 -inset-y-24" />
                <GlassCard strong lift={false} className="relative text-center px-6 py-14 sm:px-14 sm:py-20">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 -top-1/2 h-full"
                    style={{ background: 'radial-gradient(closest-side, rgba(64,214,240,0.16), rgba(150,108,246,0.08) 60%, rgba(2,6,23,0) 100%)' }}
                  />
                  <div className="relative">
                    <Logo className="h-6 sm:h-7 mx-auto" />
                    {registrationEnabled ? (
                      <>
                        <h2 className="mt-8 text-[2.4rem] leading-[1.04] sm:text-6xl font-semibold tracking-[-0.04em] text-white text-balance">
                          Станьте частью <Grad>сцены</Grad>
                        </h2>
                        <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-400 max-w-md mx-auto">
                          Регистрация занимает меньше минуты. Начните находить коллег, заказы и&nbsp;сцены уже сегодня.
                        </p>
                        <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-sm sm:max-w-none mx-auto">
                          <button type="button" onClick={() => navigate('/register')} className={primaryBtn}>
                            Создать аккаунт
                            <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                          </button>
                          {guestBrowsingEnabled && (
                            <Link to="/feed" className={secondaryBtn}>Открыть Moooza</Link>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <h2 className="mt-8 text-[2.4rem] leading-[1.04] sm:text-6xl font-semibold tracking-[-0.04em] text-white text-balance">
                          Загляните <Grad>внутрь</Grad>
                        </h2>
                        <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-400 max-w-md mx-auto">
                          Ленту, артистов и&nbsp;исполнителей можно смотреть сразу&nbsp;— писать и&nbsp;откликаться после входа.
                        </p>
                        <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-sm sm:max-w-none mx-auto">
                          <Link to="/feed" className={primaryBtn}>
                            Открыть Moooza
                            <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                          </Link>
                          <button type="button" onClick={() => openWaitlist('landing_bottom')} className={secondaryBtn}>
                            Получить доступ
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </GlassCard>
              </m.div>
            </section>
          )}

          {/* ── ФУТЕР ──────────────────────────────────────────────────────── */}
          <footer
            className="border-t border-white/[0.06] px-4 sm:px-6 pt-10"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
          >
            <div className="max-w-6xl mx-auto flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <Logo className="h-[18px]" />
                <nav className="flex items-center gap-1 flex-wrap justify-center text-[13px]">
                  <button
                    type="button"
                    onClick={() => setLegalOpen(true)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg font-medium text-slate-300 hover:text-white transition-colors"
                  >
                    <FileText size={14} /> Документы
                  </button>
                  <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-[44px] px-3 rounded-lg text-slate-400 hover:text-white transition-colors">
                    Telegram-канал
                  </a>
                  <a href="mailto:support@moooza.ru" className="inline-flex items-center min-h-[44px] px-3 rounded-lg text-slate-400 hover:text-white transition-colors">
                    Поддержка
                  </a>
                  {offerApk && (
                    <a
                      href={ANDROID_APK_URL}
                      onClick={() => reachGoal('android_apk_click', { from: 'landing_footer' })}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                      <Smartphone size={14} /> Android-приложение
                    </a>
                  )}
                </nav>
              </div>
              {/* Реквизиты общества */}
              <div className="border-t border-white/[0.05] pt-5 text-center sm:text-left text-[11px] leading-relaxed text-slate-600 space-y-0.5">
                <p>ОБЩЕСТВО С&nbsp;ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ «МУЗА»</p>
                <p>ОГРН 320631300056254 · ИНН 6312224590 · КПП 631201001</p>
                <p>Юридический адрес: Самарская область, г.&nbsp;Самара, линия 11-я, д.&nbsp;67</p>
                <p>© 2026 MOOOZA</p>
              </div>
            </div>
          </footer>
        </div>

        {legalOpen && <LegalDocsModal onClose={() => setLegalOpen(false)} />}
      </div>
    </MotionConfig>
    </LazyMotion>
  );
}
