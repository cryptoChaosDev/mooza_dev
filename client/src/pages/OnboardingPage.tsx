import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, X } from 'lucide-react';
import { userAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface Slide {
  emoji: string;
  title: string;
  description: string;
  features?: { icon: string; text: string }[];
  accent: string;
  requireTerms?: boolean;
}

const SLIDES: Slide[] = [
  {
    emoji: '🎵',
    title: 'Добро пожаловать\nв Moooza',
    description: 'Первая профессиональная платформа для музыкантов и всех, кто создаёт музыку. Здесь вы найдёте коллег, проекты и возможности для роста.',
    accent: 'from-primary-600/20 to-purple-600/20',
    features: [
      { icon: '🔍', text: 'Найди нужного специалиста' },
      { icon: '🤝', text: 'Установи профессиональные связи' },
      { icon: '💬', text: 'Общайся и создавай проекты' },
    ],
  },
  {
    emoji: '👤',
    title: 'Профиль',
    description: 'Ваш профессиональный профиль — лицо в музыкальном сообществе. Расскажите о себе, своих услугах и творческих проектах.',
    accent: 'from-sky-600/20 to-blue-600/20',
    features: [
      { icon: '🎼', text: 'Профессии и услуги из каталога' },
      { icon: '📺', text: 'Личный канал с публикациями' },
      { icon: '🎤', text: 'Артисты и группы, в которых вы участвуете' },
      { icon: '⭐', text: 'Отзывы 1-10 после совместной работы' },
    ],
  },
  {
    emoji: '🔍',
    title: 'Каталог',
    description: 'Умный поиск по всем участникам платформы. Находите нужных специалистов с точностью до профессии, жанра, города и бюджета.',
    accent: 'from-emerald-600/20 to-teal-600/20',
    features: [
      { icon: '🎼', text: 'Фильтры по жанру и профессии' },
      { icon: '📍', text: 'Поиск по городу и региону' },
      { icon: '💰', text: 'Фильтр по бюджету' },
    ],
  },
  {
    emoji: '🔗',
    title: 'Связи',
    description: 'Устанавливайте профессиональные связи с коллегами. Все совместные проекты, сделки и отзывы — в одном месте.',
    accent: 'from-violet-600/20 to-purple-600/20',
    features: [
      { icon: '🤝', text: 'Запрос → принятие → история проектов' },
      { icon: '💼', text: 'Сделки с этапами оплаты и сдачи' },
      { icon: '✅', text: 'Подтверждение обеими сторонами' },
    ],
  },
  {
    emoji: '💼',
    title: 'Сделки',
    description: 'Структурированный процесс совместной работы: от заказа до сдачи результата. Защищённые этапы оплаты и приёмки.',
    accent: 'from-cyan-600/20 to-blue-600/20',
    features: [
      { icon: '📝', text: 'Заказ → согласование → оплата' },
      { icon: '🎯', text: 'Сдача работы и приёмка' },
      { icon: '⭐', text: 'Отзыв 1-10 после завершения' },
    ],
  },
  {
    emoji: '💬',
    title: 'Чат',
    description: 'Общайтесь напрямую с участниками сообщества. Создавайте групповые чаты для совместных проектов и держите всё в одном месте.',
    accent: 'from-amber-600/20 to-orange-600/20',
    features: [
      { icon: '📎', text: 'Вложения: фото, документы' },
      { icon: '👥', text: 'Групповые чаты для проектов' },
      { icon: '⚡️', text: 'Сообщения в реальном времени' },
    ],
  },
  {
    emoji: '⚡️',
    title: 'Поток',
    description: 'Лента публикаций от музыкантов, с которыми вы связаны. Делитесь новостями, находками и достижениями.',
    accent: 'from-pink-600/20 to-rose-600/20',
    features: [
      { icon: '📝', text: 'Посты: блог, услуги и анонсы' },
      { icon: '❤️', text: 'Реакции и комментарии' },
      { icon: '🔔', text: 'Уведомления о важных событиях' },
    ],
  },
  {
    emoji: '🚀',
    title: 'Первые шаги',
    description: 'Вы готовы! Вот с чего лучше начать, чтобы вас быстрее заметили:',
    accent: 'from-primary-600/25 to-purple-600/25',
    requireTerms: true,
    features: [
      { icon: '1️⃣', text: 'Заполните профиль и добавьте фото' },
      { icon: '2️⃣', text: 'Укажите профессии и услуги' },
      { icon: '3️⃣', text: 'Найдите коллег в Каталоге и установите Связи' },
    ],
  },
];

const TOUR_KEY = 'mooza_tour_done';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [current, setCurrent] = useState(0);
  const [termsChecked, setTermsChecked] = useState(false);
  const startX = useRef<number | null>(null);

  const isLast = current === SLIDES.length - 1;
  const slide = SLIDES[current];

  const finish = () => {
    localStorage.setItem(TOUR_KEY, '1');
    if (user && !user.onboardingCompletedAt) {
      userAPI.completeOnboarding()
        .then(({ data }) => setUser({ ...user, onboardingCompletedAt: data.onboardingCompletedAt }))
        .catch(() => {});
    }
    if (termsChecked && user && !user.termsAgreedAt) {
      userAPI.agreeToTerms()
        .then(({ data }) => setUser({ ...user, termsAgreedAt: data.termsAgreedAt }))
        .catch(() => {});
    }
    navigate('/');
  };

  const next = () => {
    if (isLast) finish();
    else setCurrent(c => c + 1);
  };

  const prev = () => {
    if (current > 0) setCurrent(c => c - 1);
  };

  // Touch swipe
  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) next();
      else prev();
    }
    startX.current = null;
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950 flex flex-col select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Dots + Skip */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`rounded-full transition-all duration-300 ${
                i === current ? 'w-5 h-2 bg-primary-500' :
                i < current ? 'w-2 h-2 bg-primary-500/50' : 'w-2 h-2 bg-slate-700'
              }`}
            />
          ))}
        </div>
        <button
          onClick={finish}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          Пропустить <X size={14} />
        </button>
      </div>

      {/* Slide content */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${slide.accent} opacity-30 pointer-events-none blur-3xl`} />

        <div className="relative w-full max-w-sm flex flex-col gap-4">
          <div className="text-6xl text-center leading-none">{slide.emoji}</div>

          <h1 className="text-2xl font-bold text-white text-center leading-tight whitespace-pre-line">
            {slide.title}
          </h1>

          <p className="text-sm text-slate-400 text-center leading-relaxed">
            {slide.description}
          </p>

          {slide.features && (
            <div className="flex flex-col gap-2">
              {slide.features.map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/40 rounded-2xl px-4 py-3">
                  <span className="text-xl flex-shrink-0">{f.icon}</span>
                  <span className="text-sm text-slate-300">{f.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="px-5 pb-10 pt-3 flex-shrink-0">
        {isLast && slide.requireTerms && (
          <label className="flex items-start gap-3 bg-slate-800/50 border border-slate-700/40 rounded-2xl px-4 py-3 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={termsChecked}
              onChange={e => setTermsChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary-500 flex-shrink-0"
            />
            <span className="text-sm text-slate-300">
              Я согласен(а) с{' '}
              <a href="/terms" target="_blank" className="text-primary-400 hover:underline">условиями использования</a>{' '}
              и{' '}
              <a href="/privacy" target="_blank" className="text-primary-400 hover:underline">политикой конфиденциальности</a>
            </span>
          </label>
        )}
        <div className="flex items-center gap-3">
          {current > 0 && (
            <button
              onClick={prev}
              className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex-shrink-0"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <button
            onClick={next}
            disabled={isLast && slide.requireTerms === true && !termsChecked}
            className={`flex-1 py-3.5 rounded-2xl bg-primary-600 hover:bg-primary-500 active:scale-95 text-white font-semibold flex items-center justify-center gap-2 transition-all ${isLast && slide.requireTerms === true && !termsChecked ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {isLast ? <>Начать работу 🚀</> : <>Далее <ArrowRight size={18} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
