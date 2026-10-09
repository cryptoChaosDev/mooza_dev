import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Users, User, MessageCircle, Bell, ShieldCheck, X, Info, LifeBuoy, Gift, Zap, LogIn } from 'lucide-react';
import { APP_VERSION } from '../lib/changelog';
import BottomNav from './BottomNav';
import NotificationBell from './NotificationBell';
import InfoModal from './InfoModal';
import ProfessionGate from './ProfessionGate';
import PublicConsentPrompt from './PublicConsentPrompt';
import { useAuthStore } from '../stores/authStore';
import { enablePush } from '../lib/push';
import { saveReturnTo } from '../lib/authReturn';
import { openAuthGate } from './AuthGateModal';
import { useSiteSettings } from '../lib/siteSettings';

const GUEST_BANNER_KEY = 'mooza_guest_banner_dismissed';

/** «Войти» из шапки/меню: запоминаем текущую страницу для возврата. */
export function useGoToLogin() {
  const navigate = useNavigate();
  return () => {
    saveReturnTo(undefined, 'page');
    navigate('/login');
  };
}

// Плашка «Вы смотрите как гость» над нижним меню. Закрытие — до конца сессии
// вкладки (sessionStorage). Высота пробрасывается в CSS-переменную
// --guest-banner-h, чтобы плавающие кнопки страниц (FAB, «Наверх») не перекрывались.
function GuestBanner() {
  const goToLogin = useGoToLogin();
  const navigate = useNavigate();
  const { registrationEnabled } = useSiteSettings();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(GUEST_BANNER_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--guest-banner-h', dismissed ? '0px' : '44px');
    return () => { root.style.setProperty('--guest-banner-h', '0px'); };
  }, [dismissed]);
  if (dismissed) return null;
  const close = () => {
    setDismissed(true);
    try { sessionStorage.setItem(GUEST_BANNER_KEY, '1'); } catch { /* ignore */ }
  };
  const getAccess = () => {
    if (registrationEnabled) { saveReturnTo(undefined, 'page'); navigate('/register'); }
    else openAuthGate('page', { from: 'guest_banner' }, undefined, 'waitlist');
  };
  return (
    <div className="fixed left-0 right-0 lg:left-64 z-[45] bottom-[calc(60px_+_env(safe-area-inset-bottom,0px))] lg:bottom-0 h-11 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex items-center gap-2 px-4 text-xs">
      <span className="text-slate-400 truncate min-w-0">Вы смотрите как гость</span>
      <span className="text-slate-700">·</span>
      <button onClick={goToLogin} className="text-primary-400 hover:text-primary-300 font-semibold flex-shrink-0">Войти</button>
      <span className="text-slate-700">·</span>
      <button onClick={getAccess} className="text-primary-400 hover:text-primary-300 font-semibold flex-shrink-0">Получить доступ</button>
      <button onClick={close} aria-label="Скрыть" className="ml-auto p-1 text-slate-500 hover:text-white flex-shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [notifDismissed, setNotifDismissed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const isGuest = !token;
  const goToLogin = useGoToLogin();

  // The open chat thread is a fixed-overlay whose top is pinned to the plain header
  // height — the notification banner would grow the header and overlap the chat.
  const isChatThread = /^\/(messages|chat)\/[^/]+/.test(location.pathname);
  const notifPending = !isGuest && 'Notification' in window && Notification.permission === 'default' && !notifDismissed && !isChatThread;

  // Вызывается из клика (жест пользователя) — только так iOS/Safari/Firefox
  // показывают запрос разрешения. После «Разрешить» сразу подписываемся на
  // push (раньше разрешение выдавалось, а подписка не создавалась).
  function requestNotifications() {
    void enablePush().finally(() => setNotifDismissed(true));
  }

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const navItems = isGuest
    ? [
        { path: '/feed', icon: Zap, label: 'Поток' },
        { path: '/search', icon: Search, label: 'Каталог' },
      ]
    : [
        { path: '/', icon: Home, label: 'Главная' },
        { path: '/search', icon: Search, label: 'Каталог' },
        { path: '/messages', icon: MessageCircle, label: 'Сообщения' },
        { path: '/friends', icon: Users, label: 'Отношения' },
        { path: '/profile', icon: User, label: 'Профиль' },
      ];

  const isActive = (path: string) => location.pathname === path;

  // Full-screen pages bypass all Layout chrome: онбординг, экраны входа и
  // лендинг гостя (у них своя вёрстка на весь экран).
  const FULLSCREEN_PATHS = ['/onboarding', '/login', '/register', '/forgot-password'];
  if (FULLSCREEN_PATHS.includes(location.pathname) || (isGuest && location.pathname === '/')) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950">
      {/* Mobile Header (sticky — stays in document flow so content flows naturally below it) */}
      <div className="lg:hidden sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/50" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {/* Notification permission banner */}
        {notifPending && (
          <div className="bg-primary-600/90 px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-white min-w-0 flex-1">
              <Bell size={16} className="flex-shrink-0" />
              <span className="min-w-0">Разрешите уведомления, чтобы получать сообщения и события</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={requestNotifications} className="text-xs bg-white text-primary-700 font-semibold px-3 py-1 rounded-full hover:bg-primary-50 transition-colors">
                Разрешить
              </button>
              <button onClick={() => setNotifDismissed(true)} className="text-white/70 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        <header className="relative flex items-center justify-between px-4 h-11">
          <Link to="/" className="flex items-center gap-1.5">
            <img src="/logo.png" alt="Moooza" className="h-8 w-auto" />
            <span className="text-[9px] font-bold tracking-wider text-primary-400 bg-primary-500/15 border border-primary-500/30 rounded px-1 py-0.5 leading-none">BETA</span>
          </Link>
          {/* Centered blinking help link — visible on every page */}
          <a
            href="https://t.me/mooozahelpbot"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Помощь"
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-primary-600 text-white rounded-full pl-2 pr-3 py-1 animate-help-blink"
          >
            <LifeBuoy size={15} strokeWidth={2.5} />
            <span className="text-xs font-semibold leading-none">Помощь</span>
          </a>
          {isGuest ? (
            <button
              onClick={goToLogin}
              className="flex items-center gap-1.5 text-sm font-semibold text-primary-300 hover:text-white transition-colors"
            >
              <LogIn size={17} strokeWidth={2.25} /> Войти
            </button>
          ) : (
          <div className="flex items-center gap-3">
            <NotificationBell />
            {user?.isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className={`transition-colors ${isActive('/admin') ? 'text-primary-400' : 'text-slate-500 hover:text-slate-300'}`}
                aria-label="Администрирование"
              >
                <ShieldCheck size={20} strokeWidth={2} />
              </button>
            )}
            <button
              onClick={() => setShowInfo(true)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Информация"
            >
              <Info size={20} strokeWidth={2} />
            </button>
            <button
              onClick={() => navigate('/invite')}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Реферальная программа"
            >
              <Gift size={20} strokeWidth={2} />
            </button>
          </div>
          )}
          {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
        </header>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-slate-950 border-r border-slate-800/50 z-40">
        <div className="p-6 border-b border-slate-800/50">
          <Link to="/" className="flex items-center gap-1.5">
            <img src="/logo.png" alt="Moooza" className="h-14 w-auto" />
            <span className="text-[10px] font-bold tracking-wider text-primary-400 bg-primary-500/15 border border-primary-500/30 rounded px-1.5 py-0.5 leading-none">BETA</span>
          </Link>
          {!isGuest && (
          <div className="flex items-center justify-around mt-4">
            <NotificationBell />
            <button onClick={() => setShowInfo(true)} aria-label="Информация" className="text-slate-500 hover:text-slate-300 transition-colors">
              <Info size={20} strokeWidth={2} />
            </button>
            <button onClick={() => navigate('/invite')} aria-label="Реферальная программа" className="text-slate-500 hover:text-slate-300 transition-colors">
              <Gift size={20} strokeWidth={2} />
            </button>
          </div>
          )}
          {/* Blinking help link — visible on every page */}
          <a
            href="https://t.me/mooozahelpbot"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Помощь"
            className="mt-4 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-full px-4 py-2 animate-help-blink"
          >
            <LifeBuoy size={17} strokeWidth={2.5} />
            <span className="text-sm font-semibold leading-none">Помощь</span>
          </a>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  active
                    ? 'bg-primary-500/10 text-primary-400 shadow-glow'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon size={22} className={active ? 'scale-110' : ''} strokeWidth={active ? 2.5 : 2} />
                <span className="font-medium">{label}</span>
              </Link>
            );
          })}
          {isGuest && (
            <button
              onClick={goToLogin}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-200"
            >
              <LogIn size={22} strokeWidth={2} />
              <span className="font-medium">Войти</span>
            </button>
          )}
          {!isGuest && user?.isAdmin && (
            <Link
              to="/admin"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive('/admin')
                  ? 'bg-primary-500/10 text-primary-400 shadow-glow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <ShieldCheck size={22} strokeWidth={isActive('/admin') ? 2.5 : 2} />
              <span className="font-medium">Администрирование</span>
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800/50">
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-sm text-slate-300 mb-2">Moooza v{APP_VERSION}</p>
            <p className="text-xs text-slate-500">Социальная сеть для музыкантов</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen min-h-[100dvh]" style={isGuest ? { paddingBottom: 'var(--guest-banner-h, 0px)' } : undefined}>
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation — hidden on full-screen pages like onboarding */}
      {location.pathname !== '/onboarding' && (
        <div className="lg:hidden">
          <BottomNav />
        </div>
      )}

      {/* Гостю — плашка «Вы смотрите как гость» */}
      {isGuest && <GuestBanner />}

      {/* Обязательный выбор профессии для новых аккаунтов без неё */}
      {!isGuest && <ProfessionGate />}

      {/* Разовое окно «Сделайте профиль публичным» (Ф3) */}
      {!isGuest && <PublicConsentPrompt />}
    </div>
  );
}
