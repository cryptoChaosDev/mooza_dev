import { Link, useLocation } from 'react-router-dom';
import { Home, Search, Users, User, MessageCircle } from 'lucide-react';

export default function BottomNav() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/', icon: Home, label: 'Главная' },
    { path: '/search', icon: Search, label: 'Поиск' },
    { path: '/messages', icon: MessageCircle, label: 'Сообщения' },
    { path: '/friends', icon: Users, label: 'Друзья' },
    { path: '/profile', icon: User, label: 'Профиль' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/50 z-50 pb-safe">
      <div className="max-w-lg mx-auto px-2">
        <div className="flex items-center justify-around py-2">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={`relative flex flex-col items-center px-3 py-2 rounded-xl transition-all duration-200 touch-manipulation ${
                  active
                    ? 'text-primary-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                style={{ minWidth: '64px', minHeight: '48px' }}
              >
                <Icon
                  size={24}
                  className={`transition-transform duration-200 ${
                    active ? 'scale-110' : 'scale-100'
                  }`}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span className={`text-xs font-medium mt-1 ${
                  active ? 'opacity-100' : 'opacity-70'
                }`}>
                  {label}
                </span>
                {active && (
                  <span className="absolute inset-0 rounded-xl bg-primary-500/10 animate-fade-in" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
