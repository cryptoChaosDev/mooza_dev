import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Users, User, MessageCircle, Zap, LogIn, Ticket } from 'lucide-react';
import { useBadgeStore } from '../stores/badgeStore';
import { useAuthStore } from '../stores/authStore';
import { useKeyboardViewport } from '../lib/viewport';
import { saveReturnTo } from '../lib/authReturn';

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none shadow-lg shadow-red-500/30">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function BottomNav() {
  const location = useLocation();
  const { unreadMessages, pendingFriendRequests } = useBadgeStore();
  // Пока открыта экранная клавиатура, нижняя навигация прячется: на iOS она
  // «прыгает» над/под клавиатурой, на Android (resizes-content) отъедает место
  // у поля ввода чата.
  const keyboard = useKeyboardViewport();
  const navigate = useNavigate();
  const isGuest = !useAuthStore((s) => s.token);

  const isActive = (path: string) => location.pathname === path || (path === '/scene' && location.pathname.startsWith('/scene/'));

  if (keyboard.open) return null;

  // Гостю — Поток / Каталог / Войти (без чатов, отношений и бейджей).
  if (isGuest) {
    const guestItems = [
      { path: '/feed',   icon: Zap,    label: 'Поток' },
      { path: '/search', icon: Search, label: 'Каталог' },
      { path: '/scene',  icon: Ticket, label: 'Сцена' },
    ];
    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/50 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-lg mx-auto px-1 flex items-center justify-around h-[60px]">
          {guestItems.map(({ path, icon: Icon, label }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                aria-label={label}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all duration-200 touch-manipulation ${
                  active ? 'text-primary-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => { saveReturnTo(undefined, 'page'); navigate('/login'); }}
            aria-label="Войти"
            className="relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl text-primary-300 hover:text-white transition-all duration-200 touch-manipulation"
          >
            <LogIn size={20} strokeWidth={2.25} />
            <span className="text-[10px] font-semibold leading-none">Войти</span>
          </button>
        </div>
      </nav>
    );
  }

  const navItems = [
    { path: '/',         icon: Home,          label: 'Главная',  badge: 0 },
    { path: '/search',   icon: Search,        label: 'Каталог',  badge: 0 },
    { path: '/messages', icon: MessageCircle, label: 'Чат',      badge: unreadMessages },
    { path: '/friends',  icon: Users,         label: 'Отношения', badge: pendingFriendRequests },
    { path: '/profile',  icon: User,          label: 'Профиль',  badge: 0 },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/50 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="max-w-lg mx-auto px-1 flex items-center justify-around h-[60px]">
        {navItems.map(({ path, icon: Icon, label, badge }) => {
          const active = isActive(path);
          return (
            <Link
              key={path}
              to={path}
              aria-label={label}
              className={`relative flex items-center justify-center flex-1 h-full rounded-xl transition-all duration-200 touch-manipulation ${
                active ? 'text-primary-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {active && <span className="absolute inset-x-2 inset-y-2 rounded-xl bg-primary-500/10" />}
              <div className="relative">
                <Icon
                  size={20}
                  className={`transition-transform duration-200 ${active ? 'scale-110' : 'scale-100'}`}
                  strokeWidth={active ? 2.5 : 2}
                />
                <Badge count={badge} />
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
