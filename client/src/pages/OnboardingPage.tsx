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
    description: 'Moooza — это площадка для музыкальной тусовки. Здесь специалисты находят заказы, а артисты — людей, с которыми получается результат. Ты можешь предлагать свои услуги, искать исполнителей для проекта и строить профессиональные связи — всё в одном месте.',
    accent: 'from-primary-600/20 to-purple-600/20',
  },
  {
    emoji: '👤',
    title: 'Твой профиль —\nтвоя витрина',
    description: 'Профиль — это первое, что видит человек, который хочет с тобой работать. Здесь твои услуги, примеры работ, специализация. Чем полнее профиль — тем выше доверие и вероятность, что напишут именно тебе, а не пройдут мимо.',
    accent: 'from-sky-600/20 to-blue-600/20',
  },
  {
    emoji: '🔗',
    title: 'Связи — это твоя\nпрофессиональная история',
    description: 'Связи показывают, с кем ты работал. Это не просто контакты — это подтверждение твоего опыта и репутации на платформе. Когда коллега принимает связь, это видно в профиле у вас обоих.',
    accent: 'from-violet-600/20 to-purple-600/20',
  },
  {
    emoji: '🫂',
    title: 'Друзья — это твой круг',
    description: 'Друзья — люди, с которыми ты на связи лично. Их посты и активность будут заметнее в Потоке. Связи — про работу. Друзья — про людей. Можно совмещать.',
    accent: 'from-emerald-600/20 to-teal-600/20',
  },
  {
    emoji: '💬',
    title: 'Три вида чата —\nдля разных задач',
    description: 'Личный чат — общение с любым пользователем платформы. Групповой — когда нужно собрать несколько человек в одном разговоре. Деловой чат создаётся автоматически при оформлении сделки — там обсуждается всё по конкретному заказу.',
    accent: 'from-amber-600/20 to-orange-600/20',
  },
  {
    emoji: '⚡️',
    title: 'Поток — это жизнь\nплатформы',
    description: 'Поток — лента активности. Здесь ты можешь показывать, что делаешь, следить за коллегами и оставаться в тусовке. Публикуй релизы, делись мыслями, реагируй на чужое — или просто смотри, что происходит.',
    accent: 'from-pink-600/20 to-rose-600/20',
  },
  {
    emoji: '🚀',
    title: 'С чего начать',
    description: 'Заполни профиль — расскажи о себе, добавь артистов, с которыми работаешь, услуги и примеры работ.\n\nХочешь, чтобы коллеги подтвердили связь или вошли в карточку артиста? Пришли им реферальную ссылку — так их опыт становится частью твоей репутации на платформе.',
    accent: 'from-primary-600/25 to-purple-600/25',
    requireTerms: true,
  },
];

const TOUR_KEY = 'mooza_tour_done';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [current, setCurrent] = useState(0);
  const startX = useRef<number | null>(null);

  const isLast = current === SLIDES.length - 1;
  const slide = SLIDES[current];

  const finish = (toProfile = false) => {
    localStorage.setItem(TOUR_KEY, '1');
    if (user && !user.onboardingCompletedAt) {
      userAPI.completeOnboarding()
        .then(({ data }) => setUser({ ...user, onboardingCompletedAt: data.onboardingCompletedAt }))
        .catch(() => {});
    }
    navigate(toProfile ? '/profile' : '/');
  };

  const next = () => {
    if (isLast) finish(true);
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
          onClick={() => finish(false)}
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

          <p className="text-sm text-slate-400 text-center leading-relaxed whitespace-pre-line">
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
            className="flex-1 py-3.5 rounded-2xl bg-primary-600 hover:bg-primary-500 active:scale-95 text-white font-semibold flex items-center justify-center gap-2 transition-all"
          >
            {isLast ? <>Перейти в профиль <ArrowRight size={18} /></> : <>Далее <ArrowRight size={18} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
