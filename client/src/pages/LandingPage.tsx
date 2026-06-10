import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, type Transition } from 'framer-motion';
import {
  Search, MessageCircle, Briefcase, Users, ArrowRight,
  Star, Zap, Shield, Music2, Mic2, Headphones, Drum,
  Guitar, Radio, BarChart3, CheckCircle2, FileText,
} from 'lucide-react';
import { siteSettingsAPI, referenceAPI } from '../lib/api';
import LegalDocsModal from '../components/LegalDocsModal';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true as const },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] } as Transition,
});

const PROFESSIONS = [
  'вокалистов', 'гитаристов', 'продюсеров', 'барабанщиков',
  'звукорежиссёров', 'диджеев', 'клавишников', 'басистов',
  'саунд-дизайнеров', 'музыкальных педагогов', 'видеографов',
];

const TICKER_ITEMS = [
  'Вокалист', 'Гитарист', 'Продюсер', 'Звукорежиссёр', 'Диджей',
  'Барабанщик', 'Клавишник', 'Бас-гитарист', 'Виолончелист', 'Флейтист',
  'Саксофонист', 'Аранжировщик', 'Текстовик', 'Менеджер', 'Фотограф',
  'Видеограф', 'SMM-специалист', 'Промоутер', 'Букинг-агент', 'Лейбл',
];

// ─── AnimatedProfession ───────────────────────────────────────────────────────
function AnimatedProfession() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PROFESSIONS.length), 2400);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="relative inline-block overflow-hidden" style={{ minWidth: 240 }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={idx}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="block bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent"
        >
          {PROFESSIONS[idx]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// ─── Marquee ──────────────────────────────────────────────────────────────────
function Marquee() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="relative overflow-hidden py-3 border-y border-slate-800/60 bg-slate-950/80">
      <div className="flex animate-marquee whitespace-nowrap gap-8 w-max">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-2 text-slate-400 text-sm font-medium">
            <Music2 size={13} className="text-primary-500 flex-shrink-0" />
            {item}
          </span>
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none" />
    </div>
  );
}

// ─── Counter ──────────────────────────────────────────────────────────────────
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef(false);
  return (
    <motion.span
      onViewportEnter={() => {
        if (ref.current) return;
        ref.current = true;
        const dur = 1600;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / dur, 1);
          setVal(Math.floor(p * to));
          if (p < 1) requestAnimationFrame(tick);
          else setVal(to);
        };
        requestAnimationFrame(tick);
      }}
    >
      {val.toLocaleString('ru')}{suffix}
    </motion.span>
  );
}

// ─── LandingPage ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [activeFeature, setActiveFeature] = useState(0);
  const [legalOpen, setLegalOpen] = useState(false);

  useEffect(() => { document.title = 'Moooza — Музыкальная социальная сеть'; }, []);

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
  const profCount = professions?.length ?? 126;

  const FEATURES = [
    {
      icon: Search,
      label: 'Каталог',
      title: 'Найди нужного специалиста за секунды',
      desc: 'Фильтруй по профессии, жанру, городу и атрибутам. 11 разделов и 126+ профессий — от вокалистов до букинг-агентов.',
      pills: ['Уровень мастерства', 'Жанр', 'Специализация', 'Концертный опыт'],
      color: 'from-primary-600/20 to-violet-600/10',
    },
    {
      icon: Briefcase,
      label: 'Сделки',
      title: 'Структурированная совместная работа',
      desc: 'Оформляй заказы, согласовывай условия, фиксируй этапы. Process-сделки с ревизиями и event-сделки с депозитом.',
      pills: ['Согласование', 'Оплата', 'Сдача результата', 'Ревизия'],
      color: 'from-emerald-600/20 to-teal-600/10',
    },
    {
      icon: Users,
      label: 'Связи',
      title: 'Профессиональный нетворкинг',
      desc: 'Устанавливай деловые связи с коллегами. Все совместные проекты, сделки и отзывы — в одном месте.',
      pills: ['Запрос связи', 'История проектов', 'Отзывы 1-10', 'Избранное'],
      color: 'from-amber-600/20 to-orange-600/10',
    },
    {
      icon: MessageCircle,
      label: 'Чат',
      title: 'Общайся без посредников',
      desc: 'Личные и групповые чаты, вложения, реакции на сообщения. Уведомления в реальном времени через WebSocket.',
      pills: ['Личные чаты', 'Группы', 'Вложения', 'Реакции'],
      color: 'from-rose-600/20 to-pink-600/10',
    },
  ];

  const STEPS = [
    { n: '01', icon: Mic2, title: 'Создай профиль', desc: 'Укажи профессии, атрибуты, портфолио и услуги. Тебя начнут находить в каталоге.' },
    { n: '02', icon: Search, title: 'Найди коллег', desc: 'Каталог с фильтрами по жанру, уровню и городу. Смотри реальные профили — без ботов.' },
    { n: '03', icon: Zap, title: 'Работай вместе', desc: 'Оформляй сделки, общайся в чате, получай отзывы. Всё в одном месте.' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-4 text-center">
        {/* ambient */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-primary-700/15 blur-[160px]" />
          <div className="absolute bottom-0 right-[-10%] w-[400px] h-[400px] rounded-full bg-violet-700/10 blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          <motion.div {...fadeUp(0)} className="flex justify-center mb-8">
            <img src="/logo.png" alt="Moooza" className="h-32 sm:h-40 md:h-48 w-auto drop-shadow-[0_0_40px_rgba(99,102,241,0.3)]" />
          </motion.div>

          <motion.h1 {...fadeUp(0.15)} className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight tracking-tight mb-5">
            Платформа для
            <br />
            <AnimatedProfession />
          </motion.h1>

          <motion.p {...fadeUp(0.25)} className="text-slate-400 text-lg sm:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
            Находите работу, создавайте проекты и стройте карьеру вместе с теми, кто живёт музыкой.
          </motion.p>

          {!registrationEnabled && (
            <motion.div {...fadeUp(0.3)} className="mx-auto max-w-md mb-8 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm leading-relaxed">
              Регистрация временно закрыта. Если у вас уже есть аккаунт — войдите.
            </motion.div>
          )}

          {(registrationEnabled || loginEnabled) && (
            <motion.div {...fadeUp(0.35)} className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
              {registrationEnabled && (
                <button
                  onClick={() => navigate('/register')}
                  className="group w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-all flex items-center justify-center gap-2"
                >
                  Начать бесплатно
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              )}
              {loginEnabled && (
                <button
                  onClick={() => navigate('/login')}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 transition-all"
                >
                  Войти
                </button>
              )}
            </motion.div>
          )}

          {/* mini stats */}
          <motion.div {...fadeUp(0.45)} className="flex items-center justify-center gap-6 flex-wrap text-center">
            {[
              { value: profCount, suffix: '+', label: 'профессий' },
              { value: 11, label: 'разделов' },
              { value: 100, suffix: '%', label: 'бесплатно' },
            ].map((s, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-2xl font-bold text-white">
                  <Counter to={s.value} suffix={s.suffix} />
                </span>
                <span className="text-xs text-slate-500 mt-0.5">{s.label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* scroll cue */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 rounded-full border-2 border-slate-700 flex items-start justify-center pt-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary-400" />
          </motion.div>
        </motion.div>
      </section>

      {/* ── TICKER ───────────────────────────────────────────────────────── */}
      <Marquee />

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-16">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase text-primary-400 bg-primary-500/10 border border-primary-500/20 mb-4">
              Как это работает
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">Три шага до первого проекта</h2>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <motion.div key={i} {...fadeUp(i * 0.12)}
                className="relative group p-7 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-primary-500/30 transition-all"
              >
                <div className="flex items-start gap-4 mb-4">
                  <span className="text-4xl font-black text-slate-800 group-hover:text-primary-900 transition-colors leading-none select-none">
                    {step.n}
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-primary-500/20 transition-colors">
                    <step.icon size={20} className="text-primary-400" />
                  </div>
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{step.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:block absolute top-1/2 -right-3 z-10 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                    <ArrowRight size={12} className="text-slate-600" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES TAB ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-slate-900/30">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase text-primary-400 bg-primary-500/10 border border-primary-500/20 mb-4">
              Возможности
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">Всё для работы в музыке</h2>
          </motion.div>

          {/* Tab pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {FEATURES.map((f, i) => (
              <button
                key={i}
                onClick={() => setActiveFeature(i)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeFeature === i
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/40'
                    : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                <f.icon size={15} />
                {f.label}
              </button>
            ))}
          </div>

          {/* Active feature panel */}
          <AnimatePresence mode="wait">
            {FEATURES.map((f, i) => i === activeFeature && (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
                className={`rounded-2xl border border-slate-800 bg-gradient-to-br ${f.color} p-8 sm:p-10`}
              >
                <div className="max-w-lg">
                  <div className="w-12 h-12 rounded-2xl bg-primary-500/15 flex items-center justify-center mb-5">
                    <f.icon size={24} className="text-primary-400" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">{f.title}</h3>
                  <p className="text-slate-300 text-base leading-relaxed mb-6">{f.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {f.pills.map(pill => (
                      <span key={pill} className="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs font-medium">
                        {pill}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* ── WHY MOOOZA ───────────────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-12 items-center">
            <motion.div {...fadeUp()}>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase text-primary-400 bg-primary-500/10 border border-primary-500/20 mb-5">
                Почему Moooza
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold mb-8 leading-tight">
                Создана специально для&nbsp;творческой индустрии
              </h2>
              <ul className="space-y-4">
                {[
                  ['Только музыканты и творческие профессии — никакого шума', Shield],
                  ['Профессии с кастомными атрибутами: жанр, уровень, специализация', Star],
                  ['Реальное время: онлайн-статус, мгновенные сообщения', Zap],
                  ['Сделки с защищёнными этапами оплаты и ревизий', CheckCircle2],
                  ['Артисты и группы — страницы коллективов с постами', Users],
                ].map(([text, Icon], i) => {
                  const Ic = Icon as React.FC<{ size: number; className: string }>;
                  return (
                    <motion.li key={i} {...fadeUp(i * 0.07)} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Ic size={14} className="text-primary-400" />
                      </div>
                      <span className="text-slate-300 text-sm leading-relaxed">{text as string}</span>
                    </motion.li>
                  );
                })}
              </ul>
            </motion.div>

            {/* Visual panel */}
            <motion.div {...fadeUp(0.15)}>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Mic2, label: 'Вокалисты', count: '24' },
                  { icon: Guitar, label: 'Инструменталисты', count: '40+' },
                  { icon: Headphones, label: 'Продюсеры', count: '18' },
                  { icon: Drum, label: 'Ударные', count: '12' },
                  { icon: Radio, label: 'Диджеи', count: '16' },
                  { icon: BarChart3, label: 'Менеджмент', count: '22+' },
                ].map((card, i) => (
                  <motion.div
                    key={i}
                    whileHover={{ scale: 1.04, borderColor: 'rgba(99,102,241,0.4)' }}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 cursor-default"
                  >
                    <card.icon size={20} className="text-primary-400 mb-2" />
                    <p className="text-white font-semibold text-sm">{card.label}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{card.count} специализаций</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      {registrationEnabled && (
        <section className="py-24 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-slate-900/60 px-8 py-16">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] rounded-full bg-primary-700/15 blur-[90px]" />
                <div className="absolute top-0 right-0 w-[200px] h-[200px] rounded-full bg-violet-700/10 blur-[60px]" />
              </div>

              <motion.div {...fadeUp()} className="relative">
                <div className="flex justify-center mb-4">
                  <img src="/logo.png" alt="Moooza" className="h-16 w-auto" />
                </div>
                <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
                  <span className="bg-gradient-to-r from-primary-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Стань частью
                  </span>
                  <br />
                  <span className="text-white">сообщества</span>
                </h2>
                <p className="text-slate-400 mb-8 max-w-sm mx-auto">
                  Регистрация занимает меньше минуты. Начни находить коллег прямо сейчас.
                </p>
                <button
                  onClick={() => navigate('/register')}
                  className="group inline-flex items-center gap-2 px-10 py-3.5 rounded-xl font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-all"
                >
                  Зарегистрироваться бесплатно
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </motion.div>
            </div>
          </div>
        </section>
      )}

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <img src="/logo.png" alt="Moooza" className="h-7 w-auto" />
            <div className="flex items-center gap-5 flex-wrap justify-center">
              <button
                onClick={() => setLegalOpen(true)}
                className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium transition-colors"
              >
                <FileText size={13} /> Документы
              </button>
              <a href="mailto:support@moooza.ru" className="text-slate-500 hover:text-slate-300 text-xs transition-colors">Поддержка</a>
            </div>
          </div>
          {/* Реквизиты общества */}
          <div className="border-t border-slate-800/40 pt-4 text-center sm:text-left text-[11px] leading-relaxed text-slate-600 space-y-0.5">
            <p>ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ «МУЗА»</p>
            <p>ОГРН 320631300056254 · ИНН 6312224590 · КПП 631201001</p>
            <p>Юридический адрес: Самарская область, г. Самара, линия 11-я, д. 67</p>
            <p>© 2026 MOOOZA</p>
          </div>
        </div>
      </footer>

      {legalOpen && <LegalDocsModal onClose={() => setLegalOpen(false)} />}
    </div>
  );
}
