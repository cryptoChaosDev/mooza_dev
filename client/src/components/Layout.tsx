import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Search, Users, User, MessageCircle, Menu, X, Music } from 'lucide-react';
import BottomNav from './BottomNav';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Главная' },
    { path: '/search', icon: Search, label: 'Поиск' },
    { path: '/messages', icon: MessageCircle, label: 'Сообщения' },
    { path: '/friends', icon: Users, label: 'Друзья' },
    { path: '/profile', icon: User, label: 'Профиль' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/50">
        <div className="flex items-center justify-between px-4 h-16">
          <Link to="/" className="flex items-center gap-2">
            <Music size={24} className="text-primary-400" />
            <span className="text-xl font-bold bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              Mooza
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            {sidebarOpen ? <X size={24} className="text-slate-300" /> : <Menu size={24} className="text-slate-300" />}
          </button>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-slate-950 border-r border-slate-800/50 z-40">
        <div className="p-6 border-b border-slate-800/50">
          <Link to="/" className="flex items-center gap-3">
            <Music size={32} className="text-primary-400" />
            <span className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              Mooza
            </span>
          </Link>
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
        </nav>

        <div className="p-4 border-t border-slate-800/50">
          <div className="bg-gradient-to-br from-primary-500/10 to-purple-500/10 rounded-xl p-4 border border-primary-500/20">
            <p className="text-sm text-slate-300 mb-2">Mooza v1.0</p>
            <p className="text-xs text-slate-500">Социальная сеть для музыкантов</p>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}
      
      {/* Mobile Sidebar */}
      <aside className={`lg:hidden fixed top-0 right-0 bottom-0 w-72 bg-slate-950 border-l border-slate-800/50 z-50 transform transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
          <span className="text-lg font-semibold text-white">Меню</span>
          <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>
        
        <nav className="p-4 space-y-2">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  active
                    ? 'bg-primary-500/10 text-primary-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                <span className="font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
