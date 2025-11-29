import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface AppBarProps {
  onSearch?: (query: string) => void;
  showSearch?: boolean;
}

export function AppBar({ onSearch, showSearch = false }: AppBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
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

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('profile');
    window.location.reload();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-dark-card/80 backdrop-blur-md border-b border-dark-bg/40">
      <div className="flex items-center justify-between p-4 max-w-md mx-auto">
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

        {/* Right side - Notification and Logout buttons */}
        <div className="flex items-center gap-2">
          <button 
            className="p-2 rounded-full bg-dark-bg/60 text-dark-text hover:bg-dark-accent/10 active:scale-95 transition-all"
            aria-label="Уведомления"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9Z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 rounded-full bg-dark-bg/60 text-dark-text hover:bg-dark-accent/10 active:scale-95 transition-all"
            aria-label="Выйти"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full bg-dark-bg/60 text-dark-text hover:bg-dark-accent/10 active:scale-95 transition-all"
            aria-label={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
          >
            {theme === 'dark' ? (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <path d="M12 16c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm0-12c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm0 18c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2zM4 12c0-1.105-.895-2-2-2s-2 .895-2 2 .895 2 2 2 2-.895 2-2zm18 0c0 1.105.895 2 2 2s2-.895 2-2-.895-2-2-2-2 .895-2 2zM6.343 6.343c-.78-.78.78-2.047 0-2.828-.78-.78-2.047-.78-2.828 0-.78.78-.78 2.047 0 2.828.78.78 2.047.78 2.828 0zm11.314 11.314c-.78.78-.78 2.047 0 2.828.78.78 2.047.78 2.828 0 .78-.78.78-2.047 0-2.828-.78-.78-2.047-.78-2.828 0zM6.343 17.657c-.78-.78-2.047-.78-2.828 0-.78.78-2.047.78-2.828 0-.78-.78-.78-2.047 0-2.828.78-.78 2.047-.78 2.828 0 .78.78.78 2.047 0 2.828zm11.314-11.314c.78-.78.78-2.047 0-2.828-.78-.78-2.047-.78-2.828 0-.78.78-.78 2.047 0 2.828.78.78 2.047.78 2.828 0z" fill="currentColor"/>
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