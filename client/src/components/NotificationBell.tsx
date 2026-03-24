import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageCircle, UserPlus, UserCheck, MessageSquare, X, CheckCheck } from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useBadgeStore } from '../stores/badgeStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Notification {
  id: string;
  type: 'message' | 'friend_request' | 'friend_accepted' | 'post_reply';
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
  actor?: { id: string; firstName: string; lastName: string; avatar?: string };
}

async function fetchNotifications(): Promise<Notification[]> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const res = await fetch(`${API_URL}/api/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

async function markRead(id: string) {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  await fetch(`${API_URL}/api/notifications/${id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function markAllRead() {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  await fetch(`${API_URL}/api/notifications/read-all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function typeIcon(type: Notification['type']) {
  switch (type) {
    case 'message':         return <MessageCircle size={14} className="text-blue-400" />;
    case 'friend_request':  return <UserPlus      size={14} className="text-yellow-400" />;
    case 'friend_accepted': return <UserCheck     size={14} className="text-green-400" />;
    case 'post_reply':      return <MessageSquare size={14} className="text-purple-400" />;
  }
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'только что';
  if (diff < 3600)  return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return `${Math.floor(diff / 86400)} д`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { unreadNotifications, setUnreadNotifications, clearNotifications } = useBadgeStore();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: 60_000,
  });

  // Keep badge store in sync with actual server data.
  // setUnreadNotifications is a stable zustand action — excluded from deps intentionally
  // to avoid a dependency cycle (store update → re-render → effect → store update → ...)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setUnreadNotifications(notifications.filter(n => !n.read).length); }, [notifications]);

  const readOneMutation = useMutation({
    mutationFn: markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const readAllMutation = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      clearNotifications();
    },
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleClick(notif: Notification) {
    if (!notif.read) readOneMutation.mutate(notif.id);
    if (notif.link) navigate(notif.link);
    setOpen(false);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
      >
        <Bell size={22} strokeWidth={open ? 2.5 : 2} className={open ? 'text-primary-400' : ''} />
        {unreadNotifications > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none shadow-lg shadow-red-500/30">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 max-h-[480px] bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl shadow-black/50 flex flex-col z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
            <span className="text-sm font-semibold text-white">Уведомления</span>
            <div className="flex items-center gap-2">
              {unreadNotifications > 0 && (
                <button
                  onClick={() => readAllMutation.mutate()}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary-400 transition-colors"
                >
                  <CheckCheck size={13} />
                  Прочитать все
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Bell size={32} className="mb-2 opacity-30" />
                <p className="text-sm">Нет уведомлений</p>
              </div>
            ) : (
              notifications.map(notif => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/60 transition-colors border-b border-slate-800/40 last:border-0 ${
                    !notif.read ? 'bg-primary-500/5' : ''
                  }`}
                >
                  <div className="relative shrink-0 mt-0.5">
                    {notif.actor?.avatar ? (
                      <img
                        src={`${API_URL}${notif.actor.avatar}`}
                        className="w-9 h-9 rounded-xl object-cover"
                        alt=""
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                        {notif.actor ? notif.actor.firstName[0] : '?'}
                      </div>
                    )}
                    <span className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-0.5">
                      {typeIcon(notif.type)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${!notif.read ? 'text-white font-medium' : 'text-slate-300'}`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{notif.body}</p>
                    <p className="text-[10px] text-slate-600 mt-1">{timeAgo(notif.createdAt)}</p>
                  </div>

                  {!notif.read && (
                    <span className="shrink-0 mt-2 w-2 h-2 rounded-full bg-primary-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
