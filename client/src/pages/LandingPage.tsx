import { useNavigate } from 'react-router-dom';
import { motion, type Transition } from 'framer-motion';
import {
  ChevronRight,
  Search,
  MessageCircle,
  Briefcase,
  Users,
  CheckCircle2,
} from 'lucide-react';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true as const },
  transition: { duration: 0.55, delay } as Transition,
});

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">

      {/* ── HERO ── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-4 text-center">
        {/* ambient glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-primary-600/20 blur-[140px]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          {/* Logo */}
          <motion.div {...fadeUp(0)} className="flex justify-center mb-8">
            <img src="/logo.png" alt="Moooza" className="h-40 sm:h-48 md:h-56 w-auto" />
          </motion.div>

          {/* Headline */}
          <motion.h1 {...fadeUp(0.1)} className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight tracking-tight mb-5">
            Платформа для{' '}
            <span className="bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              музыкантов
            </span>{' '}
            и&nbsp;творческих профессий
          </motion.h1>

          {/* Sub */}
          <motion.p {...fadeUp(0.2)} className="text-slate-400 text-lg sm:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
            Находите работу, создавайте проекты и стройте карьеру вместе с теми, кто живёт музыкой.
          </motion.p>

          {/* CTA */}
          <motion.div {...fadeUp(0.3)} className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/register')}
              className="group w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 shadow-lg shadow-primary-900/40 transition-all duration-300 flex items-center justify-center gap-2"
            >
              Начать бесплатно
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-slate-300 border border-slate-700 hover:border-primary-500/50 hover:text-white hover:bg-slate-800/60 transition-all duration-300"
            >
              Войти
            </button>
          </motion.div>
        </div>

        {/* scroll cue */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 rounded-full border-2 border-slate-700 flex items-start justify-center pt-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary-400" />
          </motion.div>
        </motion.div>
      </section>

      {/* ── ADVANTAGES ── */}
      <section className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase text-primary-400 bg-primary-500/10 border border-primary-500/20 mb-4">
              Преимущества
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">Всё, что нужно для карьеры в музыке</h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: Search,
                title: 'Умный поиск',
                desc: 'Фильтруйте музыкантов и специалистов по профессии, жанру, формату работы и бюджету.',
              },
              {
                icon: Briefcase,
                title: 'Профессиональный профиль',
                desc: 'Портфолио, услуги, навыки и опыт — всё в одном месте для работодателей и коллег.',
              },
              {
                icon: MessageCircle,
                title: 'Личные сообщения',
                desc: 'Общайтесь напрямую, создавайте групповые чаты для совместных проектов.',
              },
              {
                icon: Users,
                title: 'Сообщество',
                desc: 'Друзья, коллаборации, лента событий — стройте профессиональную сеть контактов.',
              },
            ].map((item, i) => (
              <motion.div key={item.title} {...fadeUp(i * 0.1)}
                className="group p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-primary-500/30 hover:bg-slate-800/50 transition-all duration-300"
              >
                <div className="w-11 h-11 rounded-xl bg-primary-500/10 flex items-center justify-center mb-4 group-hover:bg-primary-500/20 transition-colors">
                  <item.icon size={22} className="text-primary-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BULLETS / WHY ── */}
      <section className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl">
            {/* left: text */}
            <motion.div {...fadeUp()}>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase text-primary-400 bg-primary-500/10 border border-primary-500/20 mb-5">
                Почему Moooza
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold mb-8 leading-tight">
                Создана специально для&nbsp;творческой индустрии
              </h2>
              <ul className="space-y-4">
                {[
                  'Профили с поддержкой услуг, кастомных фильтров и ценовых диапазонов',
                  'Умный алгоритм подбора — видите % совпадения с нужным специалистом',
                  'Реальное время: онлайн-статус, мгновенные сообщения, уведомления',
                  'Проекты и групповые чаты — вся коммуникация в одном месте',
                ].map((text, i) => (
                  <motion.li key={i} {...fadeUp(i * 0.08)} className="flex items-start gap-3">
                    <CheckCircle2 size={20} className="text-primary-400 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-300 text-sm leading-relaxed">{text}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-24 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-slate-900/60 px-8 py-14">
            {/* glow inside card */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] rounded-full bg-primary-600/15 blur-[80px]" />
            </div>

            <motion.p {...fadeUp()} className="text-xs font-semibold tracking-widest uppercase text-primary-400 mb-3">
              Стань частью
            </motion.p>
            <motion.h2 {...fadeUp(0.1)} className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6">
              <span className="bg-gradient-to-r from-primary-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                МУЗЫКАЛЬНОГО
              </span>
              <br />
              <span className="text-white">СООБЩЕСТВА</span>
            </motion.h2>
            <motion.p {...fadeUp(0.2)} className="text-slate-400 mb-8">
              Регистрация занимает меньше минуты. Начни прямо сейчас.
            </motion.p>
            <motion.button {...fadeUp(0.3)}
              onClick={() => navigate('/register')}
              className="group px-10 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 shadow-lg shadow-primary-900/40 transition-all duration-300 flex items-center gap-2 mx-auto"
            >
              Зарегистрироваться бесплатно
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-800/60 py-6 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <img src="/logo.png" alt="Moooza" className="h-7 w-auto" />
          <p className="text-slate-500 text-xs">
            &copy; {new Date().getFullYear()} Moooza. Все права защищены.
          </p>
        </div>
      </footer>
    </div>
  );
}
