import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Home, Search, User, Users, MessageCircle,
  ChevronRight, X, Music2, Mic2, Star, Briefcase,
  ArrowRight, Sparkles,
} from 'lucide-react';

const STORAGE_KEY = 'mooza_onboarding_done_v1';

interface Step {
  emoji: string;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  visual: React.ReactNode;
  action?: { label: string; path: string };
}

function FeedVisual() {
  return (
    <div className="w-full space-y-2">
      {[
        { name: 'Артём Волков', text: 'Записал новый трек 🎸', time: '2 мин' },
        { name: 'Юлия Сорокина', text: 'Ищу барабанщика в группу', time: '15 мин' },
      ].map((p, i) => (
        <div key={i} className="flex gap-2.5 bg-slate-800/60 rounded-2xl p-3 border border-slate-700/40">
          <div className="w-8 h-8 rounded-full bg-primary-600/30 flex items-center justify-center flex-shrink-0">
            <Music2 size={14} className="text-primary-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">{p.name}</span>
              <span className="text-[10px] text-slate-500">{p.time}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{p.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchVisual() {
  const tags = ['Гитарист', 'Вокалист', 'Продюсер', 'DJ', 'Москва', 'Rock'];
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-2 bg-slate-800/60 rounded-2xl px-3 py-2.5 border border-slate-700/40">
        <Search size={14} className="text-slate-400" />
        <span className="text-xs text-slate-500">Найти музыканта…</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span key={t} className="px-2.5 py-1 bg-slate-800/60 border border-slate-700/40 rounded-full text-[11px] text-slate-300">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProfileVisual() {
  return (
    <div className="w-full bg-slate-800/60 rounded-2xl p-3 border border-slate-700/40 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary-600/30 flex items-center justify-center">
          <Mic2 size={16} className="text-primary-400" />
        </div>
        <div>
          <p className="text-xs font-semibold text-white">Ваше имя</p>
          <p className="text-[11px] text-slate-400">Вокалист · Москва</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[['24', 'Друзья'], ['8', 'Связи'], ['3', 'Услуги'], ['12', 'Фолл']].map(([n, l]) => (
          <div key={l}>
            <p className="text-sm font-bold text-white">{n}</p>
            <p className="text-[10px] text-slate-500">{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FriendsVisual() {
  return (
    <div className="w-full space-y-2">
      {[
        { name: 'Денис Ковалёв', role: 'Барабанщик', badge: 'Связь' },
        { name: 'Анна Павлова', role: 'Клавишник', badge: 'Друг' },
      ].map((u, i) => (
        <div key={i} className="flex items-center gap-2.5 bg-slate-800/60 rounded-2xl p-3 border border-slate-700/40">
          <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white">{u.name}</p>
            <p className="text-[11px] text-slate-400">{u.role}</p>
          </div>
          <span className="px-2 py-0.5 bg-primary-600/20 text-primary-400 rounded-full text-[10px] font-medium">
            {u.badge}
          </span>
        </div>
      ))}
    </div>
  );
}

function MessagesVisual() {
  return (
    <div className="w-full space-y-2">
      <div className="flex justify-end">
        <div className="bg-primary-600 rounded-2xl rounded-tr-sm px-3 py-2 max-w-[70%]">
          <p className="text-xs text-white">Привет! Нужен вокалист на студийную запись?</p>
        </div>
      </div>
      <div className="flex justify-start">
        <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[70%]">
          <p className="text-xs text-slate-200">Да, как раз ищу! Давай обсудим 🎤</p>
        </div>
      </div>
    </div>
  );
}

function GroupsVisual() {
  return (
    <div className="w-full space-y-2.5">
      <div className="flex gap-2">
        {['🎸', '🎹', '🥁'].map((e, i) => (
          <div key={i} className="flex-1 bg-slate-800/60 rounded-2xl p-3 border border-slate-700/40 flex flex-col items-center gap-1">
            <span className="text-xl">{e}</span>
            <p className="text-[10px] text-slate-400 text-center">Группа {i + 1}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 bg-primary-600/10 rounded-2xl p-3 border border-primary-500/20">
        <Star size={14} className="text-primary-400" />
        <p className="text-xs text-slate-300">Создайте свой коллектив</p>
      </div>
    </div>
  );
}

const STEPS: Step[] = [
  {
    emoji: '🎵',
    title: 'Добро пожаловать\nв Moooza',
    subtitle: 'Соцсеть для музыкантов',
    description: 'Место, где музыканты находят коллег, клиентов и возможности. Покажем, как устроена платформа.',
    color: 'from-primary-600/20 to-violet-600/10',
    visual: (
      <div className="w-20 h-20 rounded-3xl bg-primary-600/20 border border-primary-500/30 flex items-center justify-center mx-auto">
        <Music2 size={36} className="text-primary-400" />
      </div>
    ),
  },
  {
    emoji: '🏠',
    title: 'Лента',
    subtitle: 'Главная страница',
    description: 'Здесь вы видите публикации друзей, новости коллег и посты музыкантов из вашего круга. Делитесь своим творчеством!',
    color: 'from-blue-600/20 to-cyan-600/10',
    visual: <FeedVisual />,
    action: { label: 'Открыть ленту', path: '/' },
  },
  {
    emoji: '🔍',
    title: 'Каталог',
    subtitle: 'Поиск музыкантов',
    description: 'Ищите по специализации, городу, жанру. Нужен барабанщик в Питере? Продюсер для записи? Всё здесь.',
    color: 'from-emerald-600/20 to-teal-600/10',
    visual: <SearchVisual />,
    action: { label: 'Найти музыкантов', path: '/search' },
  },
  {
    emoji: '👤',
    title: 'Профиль',
    subtitle: 'Ваша визитка',
    description: 'Заполните роль, услуги и портфолио — это ваша цифровая визитка. Чем полнее профиль, тем больше предложений.',
    color: 'from-amber-600/20 to-orange-600/10',
    visual: <ProfileVisual />,
    action: { label: 'Заполнить профиль', path: '/profile' },
  },
  {
    emoji: '👥',
    title: 'Друзья и связи',
    subtitle: 'Ваш нетворк',
    description: 'Друзья — личные контакты. Связи — деловые партнёры. Стройте профессиональную сеть и находите новые проекты.',
    color: 'from-indigo-600/20 to-purple-600/10',
    visual: <FriendsVisual />,
    action: { label: 'Найти друзей', path: '/friends' },
  },
  {
    emoji: '💬',
    title: 'Сообщения',
    subtitle: 'Общайтесь напрямую',
    description: 'Договаривайтесь о сотрудничестве, обсуждайте проекты, отправляйте файлы — всё в личных сообщениях.',
    color: 'from-rose-600/20 to-pink-600/10',
    visual: <MessagesVisual />,
    action: { label: 'Написать кому-то', path: '/friends' },
  },
  {
    emoji: '🎉',
    title: 'Всё готово!',
    subtitle: 'Начните знакомство',
    description: 'Заполните профиль, найдите первых коллег и опубликуйте свою первую запись. Музыканты ждут вас!',
    color: 'from-primary-600/20 to-violet-600/10',
    visual: (
      <div className="w-full flex justify-center gap-4">
        {[Home, Search, Users, User, MessageCircle].map((Icon, i) => (
          <div key={i} className="w-10 h-10 rounded-2xl bg-primary-600/20 border border-primary-500/30 flex items-center justify-center">
            <Icon size={18} className="text-primary-400" />
          </div>
        ))}
      </div>
    ),
  },
];

export function useOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setShow(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setShow(false);
  };

  return { show, dismiss };
}

interface Props {
  onDone: () => void;
}

export default function OnboardingModal({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const navigate = useNavigate();

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const goTo = (next: number, direction: 1 | -1 = 1) => {
    setDir(direction);
    setExiting(true);
    setTimeout(() => {
      setStep(next);
      setExiting(false);
    }, 180);
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

  const handleSkip = () => {
    onDone();
  };

  const handleActionClick = (path: string) => {
    onDone();
    navigate(path);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/95 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm bg-slate-900 sm:rounded-3xl rounded-t-3xl border border-slate-800/60 overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => i !== step && goTo(i, i > step ? 1 : -1)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-primary-400' : i < step ? 'w-1.5 bg-primary-700' : 'w-1.5 bg-slate-700'
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleSkip}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1"
          >
            <X size={14} />
            Пропустить
          </button>
        </div>

        {/* Content */}
        <div
          className={`flex-1 overflow-y-auto px-6 pb-2 transition-all duration-180 ${
            exiting
              ? dir > 0
                ? '-translate-x-4 opacity-0'
                : 'translate-x-4 opacity-0'
              : 'translate-x-0 opacity-100'
          }`}
          style={{ transition: 'transform 0.18s ease, opacity 0.18s ease' }}
        >
          {/* Gradient banner */}
          <div className={`w-full rounded-2xl bg-gradient-to-br ${current.color} border border-white/5 p-5 mb-5`}>
            {current.visual}
          </div>

          {/* Text */}
          <div className="mb-5">
            <p className="text-xs font-medium text-primary-400 uppercase tracking-wider mb-1">{current.subtitle}</p>
            <h2 className="text-2xl font-bold text-white whitespace-pre-line leading-tight mb-2">{current.title}</h2>
            <p className="text-sm text-slate-400 leading-relaxed">{current.description}</p>
          </div>

          {/* Optional shortcut action */}
          {current.action && !isLast && (
            <button
              onClick={() => handleActionClick(current.action!.path)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/40 rounded-2xl transition-colors mb-2 group"
            >
              <span className="text-sm text-slate-300 group-hover:text-white">{current.action.label}</span>
              <ArrowRight size={15} className="text-slate-500 group-hover:text-primary-400 transition-colors" />
            </button>
          )}
        </div>

        {/* Bottom buttons */}
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
                Начать использовать
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
