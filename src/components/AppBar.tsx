import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface AppBarProps {
  onSearch?: (query: string) => void;
  showSearch?: boolean;
}

export function AppBar({ onSearch, showSearch = true }: AppBarProps) {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('light-mode', savedTheme === 'light');
    }
  }, []);

  // Apply theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery);
    }
  };

  // Don't show AppBar on welcome page
  if (location.pathname === '/') return null;

  return (
    <header className="sticky top-0 z-40 bg-dark-card/80 backdrop-blur-md border-b border-dark-bg/40">
      <div className="flex items-center justify-between p-4">
        {/* Left side - Logo */}
        <div className="flex items-center">
          <span className="text-2xl font-bold" style={{ 
            fontFamily: 'Pacifico, cursive', 
            background: 'linear-gradient(90deg,#4F8CFF,#38BDF8,#f472b6 80%)', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent' 
          }}>
            Mooza
          </span>
        </div>

        {/* Center - Search (if enabled) */}
        {showSearch && (
          <form onSubmit={handleSearch} className="flex-1 max-w-md mx-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск..."
                className="w-full py-2 pl-10 pr-4 rounded-full bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                aria-label="Поиск по сайту"
              />
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-muted">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          </form>
        )}

        {/* Right side - Theme toggle */}
        <div className="flex items-center">
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full bg-dark-bg/60 text-dark-text hover:bg-dark-accent/10 active:scale-95 transition-all"
            aria-label={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
          >
            {theme === 'dark' ? (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <path d="M12 16c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm0-12c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm0 18c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2zM4 12c0-1.105-.895-2-2-2s-2 .895-2 2 .895 2 2 2 2-.895 2-2zm18 0c0 1.105.895 2 2 2s2-.895 2-2-.895-2-2-2-2 .895-2 2zM6.343 6.343c-.78-.78.78-2.047 0-2.828-.78-.78-2.047-.78-2.828 0-.78.78-.78 2.047 0 2.828.78.78 2.047.78 2.828 0zm11.314 11.314c-.78.78-.78 2.047 0 2.828.78.78 2.047.78 2.828 0 .78-.78.78-2.047 0-2.828-.78-.78-2.047-.78-2.828 0zM6.343 17.657c-.78-.78-2.047-.78-2.828 0-.78.78-.78 2.047 0 2.828.78.78 2.047.78 2.828 0 .78-.78.78-2.047 0-2.828zm11.314-11.314c.78-.78.78-2.047 0-2.828-.78-.78-2.047-.78-2.828 0-.78.78-.78 2.047 0 2.828.78.78 2.047.78 2.828 0z" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <path d="M12 11c-2.757 0-5 2.243-5 5s2.243 5 5 5 5-2.243 5-5-2.243-5-5-5zm0 8c-1.654 0-3-1.346-3-3s1.346-3 3-3 3 1.346 3 3-1.346 3-3 3zM12 4c-1.654 0-3 1.346-3 3s1.346 3 3 3 3-1.346 3-3-1.346-3-3-3zm0 4c-.551 0-1-.449-1-1s.449-1 1-1 1 .449 1 1-.449 1-1 1zM3 12c0-1.654 1.346-3 3-3s3 1.346 3 3-1.346 3-3 3-3-1.346-3-3zm2 0c0 .551.449 1 1 1s1-.449 1-1-.449-1-1-1-1 .449-1 1zM21 12c0 1.654-1.346 3-3 3s-3-1.346-3-3 1.346-3 3-3 3 1.346 3 3zm-2 0c0-.551-.449-1-1-1s-1 .449-1 1 .449 1 1 1 1-.449 1-1zM6.343 6.343c-.78-.78-2.047-.78-2.828 0-.78.78-.78 2.047 0 2.828.78.78 2.047.78 2.828 0 .78-.78.78-2.047 0-2.828zm-1.414 1.414c.39.39 1.024.39 1.414 0s.39-1.024 0-1.414-1.024-.39-1.414 0-.39 1.024 0 1.414zM17.657 6.343c.78-.78.78-2.047 0-2.828-.78-.78-2.047-.78-2.828 0-.78.78-.78 2.047 0 2.828.78.78 2.047.78 2.828 0zm-1.414-1.414c-.39-.39-1.024-.39-1.414 0s-.39 1.024 0 1.414 1.024.39 1.414 0 .39-1.024 0-1.414z" fill="currentColor"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
