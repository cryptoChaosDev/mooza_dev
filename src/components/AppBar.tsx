import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

type NotificationItem = {
  id: string | number;
  title: string;
  body?: string;
  read?: boolean;
  createdAt?: string;
  url?: string;
};

export function AppBar() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [notifsError, setNotifsError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!notifOpen) return;
    // Fetch notifications when opening the modal
    const token = localStorage.getItem('token');
    const fetchNotifs = async () => {
      setLoadingNotifs(true);
      setNotifsError(null);
      try {
        const res = await fetch('http://localhost:4000/notifications', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('no-endpoint');
        const data = await res.json();
        if (Array.isArray(data)) setNotifications(data);
        else if (data.notifications && Array.isArray(data.notifications)) setNotifications(data.notifications);
        else setNotifications([]);
      } catch (err) {
        // If backend endpoint is missing, fallback to a small mock list
        setNotifsError('Не удалось загрузить уведомления, используются локальные демо-уведомления');
        setNotifications([
          { id: 1, title: 'Добро пожаловать в Mooza!', body: 'Спасибо за регистрацию — начните с заполнения профиля.', read: false, createdAt: new Date().toISOString() },
          { id: 2, title: 'Новая активность', body: 'Вам поставили лайк на посте.', read: false, createdAt: new Date().toISOString() },
        ]);
      } finally {
        setLoadingNotifs(false);
      }
    };
    fetchNotifs();
  }, [notifOpen]);

  useEffect(() => {
    if (!notifOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNotifOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [notifOpen]);
  
  return (
    <header 
      className="fixed top-0 left-0 right-0 z-50 bg-dark-card border-b border-dark-bg/40 flex items-center justify-between px-4 overflow-x-hidden"
      style={{
        height: 'var(--header-height)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.15)',
        maxWidth: '100vw',
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
      
      <div className="flex items-center gap-2">
        {/* Logout icon always visible */}
        <button
          className="touch-target rounded-full hover:bg-dark-bg/40 transition-colors text-red-400"
          onClick={() => {
            try { localStorage.removeItem('token'); } catch {}
            try { localStorage.removeItem('profile'); } catch {}
            window.location.href = '/';
          }}
          aria-label="Выйти"
          title="Выйти"
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M10 17l5-5-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M15 12H3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Bell notifications button */}
        <div className="relative">
          <button
            className="touch-target relative rounded-full hover:bg-dark-bg/40 transition-colors text-dark-text p-2"
            onClick={() => setNotifOpen(v => !v)}
            aria-label="Уведомления"
            title="Уведомления"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h11z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0 -right-0 min-w-[18px] h-4 px-1 rounded-full text-xs font-semibold bg-red-500 text-white flex items-center justify-center">{unreadCount}</span>
            )}
          </button>

          {notifOpen && (
            <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
              <div ref={modalRef} className="w-full max-w-lg bg-dark-card rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-dark-bg/30">
                  <div className="flex items-center gap-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h11z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <div className="text-lg font-bold text-dark-text">Уведомления</div>
                    {notifsError && <div className="text-sm text-yellow-400">•</div>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="text-sm text-dark-muted hover:text-dark-text" onClick={() => {
                      // mark all read locally
                      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                    }}>Отметить все как прочитанные</button>
                    <button className="p-2 rounded-full hover:bg-dark-bg/40" onClick={() => setNotifOpen(false)} aria-label="Закрыть">✕</button>
                  </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-4 flex flex-col gap-3">
                  {loadingNotifs && <div className="text-center text-dark-muted">Загрузка...</div>}
                  {!loadingNotifs && notifications.length === 0 && <div className="text-center text-dark-muted">Нет уведомлений</div>}
                  {notifications.map(n => (
                    <div key={String(n.id)} className={`p-3 rounded-xl border ${n.read ? 'bg-dark-bg/10 border-dark-bg/30' : 'bg-gradient-to-r from-blue-500/10 to-cyan-400/5 border-blue-400/20'} cursor-pointer`} onClick={() => {
                      // mark read and navigate if url provided
                      setNotifications(prev => prev.map(it => it.id === n.id ? { ...it, read: true } : it));
                      if (n.url) navigate(n.url);
                    }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold text-dark-text">{n.title}</div>
                        <div className="text-xs text-dark-muted">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
                      </div>
                      {n.body && <div className="text-sm text-dark-muted mt-1">{n.body}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}