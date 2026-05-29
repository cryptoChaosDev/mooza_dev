import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Users, User, MessageCircle, Bell, ShieldCheck, Gift, X, Info } from 'lucide-react';
import BottomNav from './BottomNav';
import NotificationBell from './NotificationBell';
import InfoModal from './InfoModal';
import { useAuthStore } from '../stores/authStore';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [notifDismissed, setNotifDismissed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const notifPending = 'Notification' in window && Notification.permission === 'default' && !notifDismissed;

  function requestNotifications() {
    Notification.requestPermission().then(() => setNotifDismissed(true));
  }

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const navItems = [
    { path: '/', icon: Home, label: 'Главная' },
    { path: '/search', icon: Search, label: 'Каталог' },
    { path: '/messages', icon: MessageCircle, label: 'Сообщения' },
    { path: '/friends', icon: Users, label: 'Друзья' },
    { path: '/profile', icon: User, label: 'Профиль' },
  ];

  const isActive = (path: string) => location.pathname === path;

  // Full-screen pages bypass all Layout chrome
  const FULLSCREEN_PATHS = ['/onboarding'];
  if (FULLSCREEN_PATHS.includes(location.pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Mobile Header (sticky — stays in document flow so content flows naturally below it) */}
      <div className="lg:hidden sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/50" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {/* Notification permission banner */}
        {notifPending && (
          <div className="bg-primary-600/90 px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-white">
              <Bell size={16} />
              <span>Разрешите уведомления, чтобы получать сообщения и события</span>
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
        <header className="flex items-center justify-between px-4 h-11">
          <Link to="/" className="flex items-center">
            <img src="/logo.png" alt="Moooza" className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={() => setShowInfo(true)}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
              title="Информация"
            >
              <Info size={22} className="text-slate-300" />
            </button>
            <button
              onClick={() => navigate('/invite')}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
              title="Реферальная программа"
            >
              <Gift size={22} className="text-slate-300" />
            </button>
          </div>
          {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
        </header>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-slate-950 border-r border-slate-800/50 z-40">
        <div className="p-6 border-b border-slate-800/50">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center">
              <img src="/logo.png" alt="Moooza" className="h-14 w-auto" />
            </Link>
            <div className="flex items-center gap-1">
              <NotificationBell />
            </div>
          </div>
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
          {user?.isAdmin && (
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
            <p className="text-sm text-slate-300 mb-2">Moooza v1.0</p>
            <p className="text-xs text-slate-500">Социальная сеть для музыкантов</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen">
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
    </div>
  );
}
