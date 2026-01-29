import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';
import {
  Music,
  Users,
  Briefcase,
  Search,
  UserPlus,
  Handshake,
  Rocket,
  ChevronRight,
  Mic2,
  Guitar,
  Headphones,
  Radio,
} from 'lucide-react';

/* ───────── animated counter hook ───────── */
function useCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(id);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(id);
  }, [inView, target, duration]);

  return { count, ref };
}

/* ───────── floating note component ───────── */
function FloatingNote({
  icon: Icon,
  className,
  delay = 0,
}: {
  icon: typeof Music;
  className: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={`absolute text-primary-500/20 ${className}`}
      animate={{ y: [0, -20, 0], rotate: [0, 10, -10, 0] }}
      transition={{ duration: 6, repeat: Infinity, delay, ease: 'easeInOut' }}
    >
      <Icon size={48} />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">
      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center justify-center px-4">
        {/* gradient blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary-600/15 blur-[120px]" />
          <div className="absolute -bottom-60 -right-40 w-[500px] h-[500px] rounded-full bg-purple-600/10 blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-pink-600/5 blur-[140px]" />

          {/* floating icons */}
          <FloatingNote icon={Music} className="top-[15%] left-[10%]" delay={0} />
          <FloatingNote icon={Mic2} className="top-[25%] right-[12%]" delay={1.5} />
          <FloatingNote icon={Guitar} className="bottom-[20%] left-[18%]" delay={3} />
          <FloatingNote icon={Headphones} className="top-[60%] right-[8%]" delay={2} />
          <FloatingNote icon={Radio} className="top-[10%] right-[35%]" delay={4} />
          <FloatingNote icon={Music} className="bottom-[15%] right-[30%]" delay={1} />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {/* badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-primary-500/30 bg-primary-500/10 text-primary-300 text-sm"
          >
            <Music size={14} />
            Социальная сеть для музыкантов
          </motion.div>

          {/* headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="text-6xl sm:text-7xl md:text-8xl font-extrabold tracking-tight mb-6"
          >
            <span className="bg-gradient-to-r from-primary-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Mooza
            </span>
          </motion.h1>

          {/* sub-headline */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="text-lg sm:text-xl md:text-2xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Объединяем музыкантов, звукорежиссёров и продюсеров.
            <br className="hidden sm:block" />
            Находите коллег, создавайте проекты, стройте карьеру.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button
              onClick={() => navigate('/register')}
              className="group relative w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 shadow-lg shadow-primary-600/25 hover:shadow-primary-500/40 transition-all duration-300"
            >
              <span className="flex items-center justify-center gap-2">
                Создать аккаунт
                <ChevronRight
                  size={18}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </span>
            </button>

            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-slate-300 border border-slate-700 hover:border-primary-500/50 hover:text-white hover:bg-slate-800/60 transition-all duration-300"
            >
              Войти
            </button>
          </motion.div>
        </div>

        {/* scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 rounded-full border-2 border-slate-600 flex items-start justify-center p-1.5"
          >
            <motion.div className="w-1.5 h-1.5 rounded-full bg-primary-400" />
          </motion.div>
        </motion.div>
      </section>

      {/* ── FEATURES ── */}
      <section className="relative py-24 sm:py-32 px-4">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            label="Возможности"
            title="Всё для вашей музыкальной карьеры"
            subtitle="Mooza — это платформа, созданная музыкантами для музыкантов"
          />

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
            {[
              {
                icon: Briefcase,
                title: 'Портфолио',
                desc: 'Расскажите о своих навыках, опыте и проектах в профессиональном профиле',
              },
              {
                icon: Search,
                title: 'Поиск коллег',
                desc: 'Находите музыкантов по профессии, навыкам и сфере деятельности',
              },
              {
                icon: Handshake,
                title: 'Коллаборации',
                desc: 'Объединяйтесь с другими профессионалами для совместных проектов',
              },
              {
                icon: Rocket,
                title: 'Карьерный рост',
                desc: 'Получайте предложения о работе и развивайте свою музыкальную карьеру',
              },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className="group p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-primary-500/40 hover:bg-slate-800/50 backdrop-blur-sm transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center mb-4 group-hover:bg-primary-500/20 transition-colors">
                  <f.icon size={24} className="text-primary-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="relative py-24 sm:py-32 px-4">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-purple-600/5 blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto">
          <SectionHeading
            label="Как это работает"
            title="Три шага к музыкальному сообществу"
          />

          <div className="mt-16 space-y-0">
            {[
              {
                step: 1,
                icon: UserPlus,
                title: 'Создайте профиль',
                desc: 'Зарегистрируйтесь и заполните информацию о себе: профессия, навыки, любимые артисты и работодатель',
              },
              {
                step: 2,
                icon: Users,
                title: 'Найдите единомышленников',
                desc: 'Ищите музыкантов по профессии и навыкам, добавляйте в друзья, обменивайтесь сообщениями',
              },
              {
                step: 3,
                icon: Rocket,
                title: 'Создавайте вместе',
                desc: 'Делитесь идеями в ленте, участвуйте в обсуждениях и запускайте совместные проекты',
              },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className="relative flex items-start gap-6 py-8"
              >
                {/* timeline line */}
                {i < 2 && (
                  <div className="absolute left-[27px] top-[72px] w-px h-[calc(100%-40px)] bg-gradient-to-b from-primary-500/40 to-transparent" />
                )}

                {/* step number circle */}
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-xl font-bold shadow-lg shadow-primary-600/20">
                  {s.step}
                </div>

                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-2">
                    <s.icon size={20} className="text-primary-400" />
                    <h3 className="text-xl font-semibold">{s.title}</h3>
                  </div>
                  <p className="text-slate-400 leading-relaxed max-w-lg">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="relative py-24 sm:py-32 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="rounded-3xl bg-gradient-to-br from-primary-600/10 via-purple-600/10 to-pink-600/10 border border-slate-800 p-10 sm:p-14"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { value: 25, suffix: '+', label: 'Профессий' },
                { value: 5, suffix: '+', label: 'Сфер деятельности' },
                { value: 100, suffix: '%', label: 'Бесплатно' },
                { value: 24, suffix: '/7', label: 'Доступность' },
              ].map((s) => (
                <StatItem key={s.label} value={s.value} suffix={s.suffix} label={s.label} />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="relative py-24 sm:py-32 px-4">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary-600/10 blur-[140px]" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6"
          >
            Готовы стать частью{' '}
            <span className="bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              музыкального сообщества
            </span>
            ?
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="text-slate-400 text-lg mb-10 max-w-xl mx-auto"
          >
            Присоединяйтесь к Mooza — регистрация занимает всего пару минут
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            onClick={() => navigate('/register')}
            className="group px-10 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 shadow-lg shadow-primary-600/25 hover:shadow-primary-500/40 transition-all duration-300 text-lg"
          >
            <span className="flex items-center gap-2">
              Зарегистрироваться бесплатно
              <ChevronRight
                size={20}
                className="group-hover:translate-x-1 transition-transform"
              />
            </span>
          </motion.button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-800/60 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Music size={20} className="text-primary-400" />
            <span className="font-bold text-lg bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              Mooza
            </span>
          </div>
          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} Mooza. Все права защищены.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ───────── section heading helper ───────── */
function SectionHeading({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="text-center"
    >
      <span className="inline-block px-3 py-1 rounded-full text-xs font-medium tracking-wider uppercase text-primary-400 bg-primary-500/10 border border-primary-500/20 mb-4">
        {label}
      </span>
      <h2 className="text-3xl sm:text-4xl font-bold">{title}</h2>
      {subtitle && (
        <p className="mt-4 text-slate-400 max-w-xl mx-auto">{subtitle}</p>
      )}
    </motion.div>
  );
}

/* ───────── stat counter item ───────── */
function StatItem({
  value,
  suffix,
  label,
}: {
  value: number;
  suffix: string;
  label: string;
}) {
  const { count, ref } = useCounter(value);
  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
        {count}
        {suffix}
      </div>
      <div className="text-slate-400 text-sm mt-1">{label}</div>
    </div>
  );
}
