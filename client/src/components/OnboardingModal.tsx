import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, X, Sparkles, Zap, Search, User,
  Users, MessageCircle, CheckCircle2, TrendingUp,
} from 'lucide-react';

interface Step {
  icon: React.ReactNode;
  badge: string;
  title: string;
  description: string;
  bullets?: string[];
  cta?: string;
  ctaPath?: string;
  color: string;
}

const STEPS: Step[] = [
  {
    icon: <span className="text-5xl">🎵</span>,
    badge: 'Добро пожаловать',
    title: 'Moooza — соцсеть для музыкантов',
    description: 'Здесь находят коллег для группы, берут заказы, показывают своё творчество и строят карьеру в музыке.',
    bullets: [
      'Найди барабанщика, вокалиста или продюсера',
      'Получай заказы на услуги прямо в личку',
      'Веди страницу своей группы или проекта',
    ],
    color: 'bg-primary-600/15 border-primary-500/20',
  },
  {
    icon: <Zap size={40} className="text-yellow-400" />,
    badge: 'Поток',
    title: 'Главная страница — живая лента',
    description: 'Всё интересное от музыкантов, которых ты добавил. Можно фильтровать по типу постов, жанру или городу.',
    bullets: [
      'Публикуй треки, посты, вакансии и услуги',
      'Нажми «+» чтобы создать любой тип поста',
      'Настрой фильтры под свои интересы',
    ],
    color: 'bg-yellow-500/10 border-yellow-500/20',
  },
  {
    icon: <Search size={40} className="text-emerald-400" />,
    badge: 'Каталог',
    title: 'Как тебя находят другие',
    description: 'В каталоге люди ищут музыкантов по специализации, городу и жанру. Чем полнее твой профиль — тем лучше тебя видят в поиске.',
    bullets: [
      'Заполни роль и город — появись в поиске',
      'Добавь жанры — тебя найдут по стилю',
      'Укажи услуги — получай платные заказы',
    ],
    cta: 'Смотреть каталог',
    ctaPath: '/search',
    color: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: <User size={40} className="text-primary-400" />,
    badge: 'Профиль',
    title: 'Твоя цифровая визитка',
    description: 'Профиль — это то, что видят другие музыканты. Заполненный профиль = больше предложений и доверие.',
    bullets: [
      '📸 Фото → сразу видно, кто ты',
      '🎸 Роль и услуги → тебя находят по делу',
      '🔗 Соцсети и портфолио → подтверждают опыт',
    ],
    cta: 'Заполнить профиль',
    ctaPath: '/profile',
    color: 'bg-primary-500/10 border-primary-500/20',
  },
  {
    icon: <Users size={40} className="text-indigo-400" />,
    badge: 'Друзья и связи',
    title: 'Два типа контактов — зачем?',
    description: 'Друзья — люди, с которыми общаешься лично. Связи — деловые партнёры: продюсеры, звукорежиссёры, агенты.',
    bullets: [
      'Друзья видят твои приватные посты',
      'Связи — это профессиональный нетворк',
      'Оба типа помогают строить карьеру',
    ],
    cta: 'Найти людей',
    ctaPath: '/friends',
    color: 'bg-indigo-500/10 border-indigo-500/20',
  },
  {
    icon: <MessageCircle size={40} className="text-rose-400" />,
    badge: 'Сообщения',
    title: 'Договаривайся напрямую',
    description: 'Нашёл интересного музыканта? Напиши ему. Обсуди проект, согласуй условия или просто познакомься.',
    bullets: [
      'Личка открыта для всех пользователей',
      'Отправляй файлы и ссылки прямо в чат',
      'Не теряй контакт с новыми знакомыми',
    ],
    color: 'bg-rose-500/10 border-rose-500/20',
  },
  {
    icon: <TrendingUp size={40} className="text-primary-400" />,
    badge: 'Готово!',
    title: 'Первые шаги для старта',
    description: 'Три действия, которые сразу дадут результат:',
    bullets: [
      '1. Заполни профиль — фото, роль, город',
      '2. Найди 3–5 музыкантов в каталоге и добавь',
      '3. Опубликуй первый пост в Потоке',
    ],
    cta: 'Заполнить профиль',
    ctaPath: '/profile',
    color: 'bg-primary-600/15 border-primary-500/20',
  },
];

export function useOnboarding() {
  const [show, setShow] = useState(true);

  const dismiss = () => setShow(false);
  const open = () => setShow(true);

  return { show, dismiss, open };
}

interface Props {
  onDone: () => void;
}

export default function OnboardingModal({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  const navigate = useNavigate();

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const goTo = (next: number, dir: 1 | -1 = 1) => {
    if (animating) return;
    setSlideDir(dir);
    setAnimating(true);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 200);
  };

  const handleNext = () => {
    if (isLast) {
      onDone();
      navigate('/profile');
    } else {
      goTo(step + 1, 1);
    }
  };

  const handleBack = () => {
    if (step > 0) goTo(step - 1, -1);
  };

  const handleCta = (path: string) => {
    onDone();
    navigate(path);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Progress + close */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
          <div className="flex gap-1.5 flex-1 mr-3">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => i !== step && goTo(i, i > step ? 1 : -1)}
                className={`h-1 rounded-full transition-all duration-300 flex-1 ${
                  i === step ? 'bg-primary-400' : i < step ? 'bg-primary-700' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
          <button
            onClick={onDone}
            className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Slide content */}
        <div
          className="flex-1 overflow-y-auto px-6 pb-2"
          style={{
            transition: 'transform 0.2s ease, opacity 0.2s ease',
            transform: animating ? `translateX(${slideDir > 0 ? '-16px' : '16px'})` : 'translateX(0)',
            opacity: animating ? 0 : 1,
          }}
        >
          {/* Icon */}
          <div className={`w-full rounded-2xl border ${current.color} flex items-center justify-center py-7 mb-5`}>
            {current.icon}
          </div>

          {/* Badge */}
          <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider mb-1.5">{current.badge}</p>

          {/* Title */}
          <h2 className="text-xl font-bold text-white leading-snug mb-2">{current.title}</h2>

          {/* Description */}
          <p className="text-sm text-slate-400 leading-relaxed mb-4">{current.description}</p>

          {/* Bullets */}
          {current.bullets && (
            <ul className="space-y-2 mb-5">
              {current.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 size={15} className="text-primary-500 flex-shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Optional secondary CTA */}
          {current.cta && current.ctaPath && !isLast && (
            <button
              onClick={() => handleCta(current.ctaPath!)}
              className="w-full text-left px-4 py-3 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/40 text-sm text-slate-300 hover:text-white transition-colors mb-2 flex items-center justify-between group"
            >
              <span>{current.cta}</span>
              <ChevronRight size={15} className="text-slate-600 group-hover:text-primary-400 transition-colors" />
            </button>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-6 pb-6 pt-3 flex gap-3 flex-shrink-0">
          {step > 0 && (
            <button
              onClick={handleBack}
              className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
            >
              Назад
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white text-sm font-semibold transition-all shadow-lg shadow-primary-900/40"
          >
            {isLast ? (
              <>
                <Sparkles size={16} />
                Заполнить профиль
              </>
            ) : (
              <>
                Далее
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
