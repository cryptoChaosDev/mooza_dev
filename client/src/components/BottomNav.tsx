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
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 z-50 pb-safe">
      <div className="max-w-lg mx-auto px-4">
        <div className="flex items-center justify-around">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center py-3 px-4 transition-colors ${
                  active
                    ? 'text-primary-400'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <Icon
                  size={24}
                  className={`mb-1 transition-transform ${
                    active ? 'scale-110' : ''
                  }`}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span className="text-xs font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
