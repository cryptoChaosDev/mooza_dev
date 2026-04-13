import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageCircle, UserPlus, UserCheck, MessageSquare, X, CheckCheck } from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useBadgeStore } from '../stores/badgeStore';
import AvatarComponent from './Avatar';
import { lockScroll, unlockScroll } from '../lib/scrollLock';

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

type Group = {
  key: string;
  actor: Notification['actor'];
  items: Notification[];
  hasUnread: boolean;
  latestTime: string;
};

const EMPTY: Notification[] = [];

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
    case 'message':         return <MessageCircle size={13} className="text-blue-400" />;
    case 'friend_request':  return <UserPlus      size={13} className="text-yellow-400" />;
    case 'friend_accepted': return <UserCheck     size={13} className="text-green-400" />;
    case 'post_reply':      return <MessageSquare size={13} className="text-purple-400" />;
  }
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'только что';
  if (diff < 3600)  return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return `${Math.floor(diff / 86400)} д`;
}

function groupNotifications(notifications: Notification[]): Group[] {
  const map = new Map<string, Group>();

  for (const n of notifications) {
    // System notifications (no actor) never group
    const key = n.actor?.id ?? `sys-${n.id}`;
    if (!map.has(key)) {
      map.set(key, { key, actor: n.actor, items: [], hasUnread: false, latestTime: n.createdAt });
    }
    const g = map.get(key)!;
    g.items.push(n);
    if (!n.read) g.hasUnread = true;
    if (n.createdAt > g.latestTime) g.latestTime = n.createdAt;
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime()
  );
}

// ── Single notification row ────────────────────────────────────────────────
function SingleRow({ n, actor, onClick }: { n: Notification; actor: Notification['actor']; onClick: () => void }) {
  const name = actor ? `${actor.firstName} ${actor.lastName}` : '?';
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/40 active:bg-slate-800/60 transition-colors ${!n.read ? 'bg-primary-500/5' : ''}`}
    >
      <div className="relative shrink-0 mt-0.5">
        <AvatarComponent src={actor?.avatar ?? null} name={name} size={42} />
        <span className="absolute -bottom-1 -right-1 bg-slate-950 rounded-full p-0.5 shadow">
          {typeIcon(n.type)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!n.read ? 'text-white font-semibold' : 'text-slate-300'}`}>
          {n.title}
        </p>
        {n.body && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
        )}
        <p className="text-[10px] text-slate-600 mt-1">{timeAgo(n.createdAt)}</p>
      </div>
      {!n.read && <span className="shrink-0 mt-2 w-2 h-2 rounded-full bg-primary-500" />}
    </button>
  );
}

// ── Grouped notification block ─────────────────────────────────────────────
function GroupBlock({ group, onClickItem }: { group: Group; onClickItem: (n: Notification) => void }) {
  const actor = group.actor;
  const name = actor ? `${actor.firstName} ${actor.lastName}` : '?';

  return (
    <div className={group.hasUnread ? 'bg-primary-500/5' : ''}>
      {/* Actor header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-1.5">
        <AvatarComponent src={actor?.avatar ?? null} name={name} size={42} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{name}</p>
          <p className="text-[11px] text-slate-500">{group.items.length} уведомления</p>
        </div>
        {group.hasUnread && <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />}
      </div>

      {/* Each notification indented */}
      {group.items.map(n => (
        <button
          key={n.id}
          onClick={() => onClickItem(n)}
          className="w-full flex items-center gap-2.5 pl-[70px] pr-4 py-2 text-left hover:bg-slate-800/40 active:bg-slate-800/60 transition-colors"
        >
          <span className="shrink-0">{typeIcon(n.type)}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-xs leading-snug truncate ${!n.read ? 'text-white font-medium' : 'text-slate-400'}`}>
              {n.title}
            </p>
          </div>
          <span className="text-[10px] text-slate-600 shrink-0">{timeAgo(n.createdAt)}</span>
          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0 ml-1" />}
        </button>
      ))}
      <div className="h-2" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { unreadNotifications, setUnreadNotifications, clearNotifications } = useBadgeStore();

  const { data: notifications = EMPTY } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: 60_000,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setUnreadNotifications(notifications.filter(n => !n.read).length); }, [notifications]);

  useEffect(() => {
    if (open) lockScroll();
    else unlockScroll();
    return () => unlockScroll();
  }, [open]);

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

  function handleClick(notif: Notification) {
    if (!notif.read) readOneMutation.mutate(notif.id);
    if (notif.link) navigate(notif.link);
    setOpen(false);
  }

  const groups = groupNotifications(notifications.filter(n => !n.read));

  const panel = open ? createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel — full-screen below app header, above bottom nav */}
      <div
        className="fixed inset-x-0 top-16 z-[61] flex flex-col bg-slate-950 border-t border-slate-800"
        style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' } as React.CSSProperties}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0 bg-slate-950/95 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-primary-400" />
            <span className="font-semibold text-white text-sm">Уведомления</span>
            {unreadNotifications > 0 && (
              <span className="px-1.5 py-0.5 bg-primary-500/20 text-primary-400 text-[11px] rounded-full font-semibold leading-none">
                {unreadNotifications}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadNotifications > 0 && (
              <button
                onClick={() => readAllMutation.mutate()}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary-400 transition-colors"
              >
                <CheckCheck size={13} />
                Прочитать все
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={17} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* List */}
        <div
          className="flex-1 overflow-y-auto divide-y divide-slate-800/60"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
              <div className="p-5 bg-slate-800/40 rounded-2xl">
                <Bell size={32} className="opacity-30" />
              </div>
              <p className="text-sm">Нет уведомлений</p>
            </div>
          ) : (
            groups.map(group =>
              group.items.length === 1 ? (
                <SingleRow
                  key={group.key}
                  n={group.items[0]}
                  actor={group.actor}
                  onClick={() => handleClick(group.items[0])}
                />
              ) : (
                <GroupBlock
                  key={group.key}
                  group={group}
                  onClickItem={handleClick}
                />
              )
            )
          )}
        </div>
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
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
      {panel}
    </>
  );
}
