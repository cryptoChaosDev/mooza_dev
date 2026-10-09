import { create } from 'zustand';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function fetchCount(path: string): Promise<number | null> {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.count === 'number' ? data.count : null;
  } catch {
    return null;
  }
}

interface BadgeState {
  unreadMessages: number;
  unreadNotifications: number;
  pendingFriendRequests: number;
  // Беседа, открытая сейчас в ChatPage (id беседы, не userId из URL) —
  // сообщения в неё не увеличивают бейдж и не показывают баннер.
  activeConversationId: string | null;

  setUnreadMessages: (n: number) => void;
  setUnreadNotifications: (n: number) => void;
  setPendingFriendRequests: (n: number) => void;
  setActiveConversationId: (id: string | null) => void;

  incrementMessages: () => void;
  incrementNotifications: () => void;
  incrementFriendRequests: () => void;

  clearMessages: () => void;
  clearNotifications: () => void;
  clearFriendRequests: () => void;

  // Серверные счётчики — единственный источник правды для бейджей
  refreshMessages: () => Promise<void>;
  refreshNotifications: () => Promise<void>;

  reset: () => void;
}

export const useBadgeStore = create<BadgeState>((set) => ({
  unreadMessages: 0,
  unreadNotifications: 0,
  pendingFriendRequests: 0,
  activeConversationId: null,

  setUnreadMessages: (n) => set({ unreadMessages: Math.max(0, n) }),
  setUnreadNotifications: (n) => set({ unreadNotifications: Math.max(0, n) }),
  setPendingFriendRequests: (n) => set({ pendingFriendRequests: Math.max(0, n) }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),

  incrementMessages: () => set((s) => ({ unreadMessages: s.unreadMessages + 1 })),
  incrementNotifications: () => set((s) => ({ unreadNotifications: s.unreadNotifications + 1 })),
  incrementFriendRequests: () => set((s) => ({ pendingFriendRequests: s.pendingFriendRequests + 1 })),

  clearMessages: () => set({ unreadMessages: 0 }),
  clearNotifications: () => set({ unreadNotifications: 0 }),
  clearFriendRequests: () => set({ pendingFriendRequests: 0 }),

  refreshMessages: async () => {
    const n = await fetchCount('/api/messages/unread/count');
    if (n != null) set({ unreadMessages: Math.max(0, n) });
  },
  refreshNotifications: async () => {
    const n = await fetchCount('/api/notifications/unread/count');
    if (n != null) set({ unreadNotifications: Math.max(0, n) });
  },

  reset: () => set({ unreadMessages: 0, unreadNotifications: 0, pendingFriendRequests: 0, activeConversationId: null }),
}));
