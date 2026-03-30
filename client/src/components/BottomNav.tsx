import { Link, useLocation } from 'react-router-dom';
import { Home, Search, Users, User, MessageCircle } from 'lucide-react';
import { useBadgeStore } from '../stores/badgeStore';

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

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/',         icon: Home,          label: 'Главная',   badge: 0 },
    { path: '/search',   icon: Search,        label: 'Поиск',     badge: 0 },
    { path: '/messages', icon: MessageCircle, label: 'Сообщения', badge: unreadMessages },
    { path: '/friends',  icon: Users,         label: 'Друзья',    badge: pendingFriendRequests },
    { path: '/profile',  icon: User,          label: 'Профиль',   badge: 0 },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/50 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="max-w-lg mx-auto px-2">
        <div className="flex items-center justify-around h-16">
          {navItems.map(({ path, icon: Icon, label, badge }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={`relative flex flex-col items-center px-3 py-1.5 rounded-xl transition-all duration-200 touch-manipulation ${
                  active
                    ? 'text-primary-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                style={{ minWidth: '56px' }}
              >
                <div className="relative">
                  <Icon
                    size={24}
                    className={`transition-transform duration-200 ${active ? 'scale-110' : 'scale-100'}`}
                    strokeWidth={active ? 2.5 : 2}
                  />
                  <Badge count={badge} />
                </div>
                <span className={`text-xs font-medium mt-1 ${active ? 'opacity-100' : 'opacity-70'}`}>
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
