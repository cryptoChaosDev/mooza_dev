import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, m } from 'framer-motion';
import { ArrowRight, Building2, Guitar, UserSearch } from 'lucide-react';
import { EASE, GlassCard, Grad, SectionHead, fadeUp } from './ui';

/**
 * «Как это работает» для трёх ролей — переключатель-вкладки. У каждой роли
 * три шага и своя кнопка (для музыканта — регистрация или лист ожидания).
 */

type RoleId = 'customer' | 'musician' | 'organizer';

interface Step { title: string; text: ReactNode }

export default function HowItWorks({
  registrationEnabled, onRegister, onWaitlist,
}: {
  registrationEnabled: boolean;
  onRegister: () => void;
  onWaitlist: () => void;
}) {
  const [role, setRole] = useState<RoleId>('customer');

  const ROLES: Array<{
    id: RoleId;
    label: string;
    icon: typeof Guitar;
    steps: Step[];
    cta: { label: string; to?: string; onClick?: () => void };
  }> = [
    {
      id: 'customer',
      label: 'Заказчик',
      icon: UserSearch,
      steps: [
        { title: 'Опишите задачу', text: <>Одной фразой, как в&nbsp;мессенджере: кто нужен, где, когда и&nbsp;за&nbsp;сколько.</> },
        { title: 'Мы найдём исполнителей', text: <>Разберём запрос и&nbsp;отправим его 10&nbsp;самым подходящим по&nbsp;профессии, городу и&nbsp;жанру.</> },
        { title: 'Выберите своего', text: <>Отклики придут в&nbsp;уведомления и&nbsp;чат. Слушайте демо, смотрите опыт и&nbsp;отзывы.</> },
      ],
      cta: { label: 'Описать задачу', to: '/find' },
    },
    {
      id: 'musician',
      label: 'Музыкант',
      icon: Guitar,
      steps: [
        { title: 'Соберите профиль', text: <>Профессии, жанры, город и&nbsp;аудиодемо&nbsp;— вас начнут находить в&nbsp;каталоге.</> },
        { title: 'Покажите опыт', text: <>Подтвердите участие в&nbsp;релизах и&nbsp;клипах&nbsp;— они станут портфолио с&nbsp;аудиторией.</> },
        { title: 'Получайте запросы', text: <>Подходящие заказы придут сами. Отвечайте быстро&nbsp;— и&nbsp;получите бейдж «Отвечает быстро».</> },
      ],
      cta: registrationEnabled
        ? { label: 'Создать профиль', onClick: onRegister }
        : { label: 'Получить доступ', onClick: onWaitlist },
    },
    {
      id: 'organizer',
      label: 'Организатор',
      icon: Building2,
      steps: [
        { title: 'Опубликуйте запрос', text: <>Дата, город, площадка, слот и&nbsp;гонорар&nbsp;— на&nbsp;бирже лайнапов.</> },
        { title: 'Получите отклики', text: <>Артисты откликаются от&nbsp;имени группы: релизы, слушатели и&nbsp;концерты&nbsp;— сразу в&nbsp;отклике.</> },
        { title: 'Соберите лайнап', text: <>Выберите артистов и&nbsp;договоритесь о&nbsp;деталях в&nbsp;чате.</> },
      ],
      cta: { label: 'Открыть биржу лайнапов', to: '/lineups' },
    },
  ];

  const active = ROLES.find((r) => r.id === role)!;
  const ctaCls = 'group inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-2xl bg-white text-slate-950 text-[15px] font-semibold hover:bg-slate-100 transition-colors w-full sm:w-auto';

  return (
    <section id="how" className="relative px-4 sm:px-6 py-16 sm:py-24">
      <div className="max-w-6xl mx-auto">
        <m.div {...fadeUp()}>
          <SectionHead
            center
            eyebrow="Как это работает"
            title={<>Три шага&nbsp;— <Grad>для каждого</Grad></>}
            sub="Выберите, кто вы,&nbsp;— и&nbsp;посмотрите, как всё устроено."
          />
        </m.div>

        {/* Переключатель ролей */}
        <m.div {...fadeUp(0.08)} className="mt-10 flex justify-center">
          <div role="tablist" aria-label="Роль" className="relative grid grid-cols-3 w-full max-w-[460px] rounded-2xl bg-white/[0.04] p-1 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
            {/* Плашка активной вкладки: колонки равные — сдвиг на ширину колонки (transform) */}
            <span
              aria-hidden
              className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-xl bg-white shadow-[0_8px_24px_-8px_rgba(150,108,246,0.6)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `translateX(${ROLES.findIndex((r) => r.id === role) * 100}%)` }}
            />
            {ROLES.map((r) => {
              const on = r.id === role;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  id={`lp-role-${r.id}`}
                  aria-selected={on}
                  aria-controls="lp-role-panel"
                  onClick={() => setRole(r.id)}
                  className={`relative min-h-[46px] px-2 rounded-xl text-[13.5px] sm:text-sm font-semibold transition-colors duration-300 ${on ? 'text-slate-950' : 'text-slate-300 hover:text-white'}`}
                >
                  <span className="relative inline-flex items-center justify-center gap-1.5">
                    <r.icon size={15} className="hidden xs:block flex-shrink-0" />
                    {r.label}
                  </span>
                </button>
              );
            })}
          </div>
        </m.div>

        {/* Шаги */}
        <div id="lp-role-panel" role="tabpanel" aria-labelledby={`lp-role-${role}`} className="mt-10 sm:mt-12">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={role}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              <ol className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
                {active.steps.map((s, i) => (
                  <li key={s.title}>
                    <GlassCard className="h-full p-6 sm:p-7">
                      <div className="flex items-center gap-3">
                        <span className="lp-grad-text text-[2.6rem] font-semibold leading-none tracking-[-0.05em] tabular-nums">0{i + 1}</span>
                        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                      </div>
                      <p className="mt-5 text-lg font-semibold tracking-[-0.015em] text-white">{s.title}</p>
                      <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{s.text}</p>
                    </GlassCard>
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex justify-center">
                {active.cta.to ? (
                  <Link to={active.cta.to} className={ctaCls}>
                    {active.cta.label}
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <button type="button" onClick={active.cta.onClick} className={ctaCls}>
                    {active.cta.label}
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
              </div>
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
