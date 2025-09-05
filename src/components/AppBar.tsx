import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function AppBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);
  
  return (
    <header 
      className="fixed top-0 left-0 right-0 z-50 bg-dark-card border-b border-dark-bg/40 flex items-center justify-between px-4"
      style={{
        height: 'var(--header-height)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.15)',
      }}
    >
      <div className="flex items-center flex-1">
        <span 
          className="text-xl font-bold text-dark-text select-none cursor-pointer hover:text-dark-accent transition-colors" 
          style={{fontFamily: 'Pacifico, cursive', letterSpacing: '0.04em'}} 
          onClick={() => navigate("/")}
        >
          Mooza
        </span>
      </div>
      
      <div className="relative" ref={menuRef}>
        <button
          className="touch-target rounded-full hover:bg-dark-bg/40 transition-colors text-dark-text"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Меню"
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        
        {menuOpen && (
          <div className="absolute top-full right-0 mt-2 w-64 bg-dark-card rounded-xl shadow-2xl py-2 flex flex-col animate-fade-in animate-scale-in z-50 border border-dark-bg/40">
            <button
              className="w-full flex items-center gap-3 text-left px-4 py-3 text-base text-dark-text hover:bg-dark-bg/40 transition-all font-medium"
              onClick={() => { setMenuOpen(false); navigate('/profile'); }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" stroke="#4F8CFF" strokeWidth="1.5"/>
                <path d="M4 20c0-2.21 3.582-4 8-4s8 1.79 8 4" stroke="#4F8CFF" strokeWidth="1.5"/>
              </svg>
              Профиль
            </button>
            <button
              className="w-full flex items-center gap-3 text-left px-4 py-3 text-base text-red-400 hover:bg-red-500/10 transition-all font-medium"
              onClick={() => {
                setMenuOpen(false);
                // @ts-ignore
                if (window.Telegram?.WebApp?.close) window.Telegram.WebApp.close();
                else alert('Закрытие доступно только в Telegram WebApp');
              }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/>
              </svg>
              Выйти
            </button>
          </div>
        )}
      </div>
    </header>
  );
}