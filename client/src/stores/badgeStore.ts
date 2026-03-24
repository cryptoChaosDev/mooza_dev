import { create } from 'zustand';

interface BadgeState {
  unreadMessages: number;
  unreadNotifications: number;
  pendingFriendRequests: number;

  setUnreadMessages: (n: number) => void;
  setUnreadNotifications: (n: number) => void;
  setPendingFriendRequests: (n: number) => void;

  incrementMessages: () => void;
  incrementNotifications: () => void;
  incrementFriendRequests: () => void;

  clearMessages: () => void;
  clearNotifications: () => void;
  clearFriendRequests: () => void;
}

export const useBadgeStore = create<BadgeState>((set) => ({
  unreadMessages: 0,
  unreadNotifications: 0,
  pendingFriendRequests: 0,

  setUnreadMessages: (n) => set({ unreadMessages: Math.max(0, n) }),
  setUnreadNotifications: (n) => set({ unreadNotifications: Math.max(0, n) }),
  setPendingFriendRequests: (n) => set({ pendingFriendRequests: Math.max(0, n) }),

  incrementMessages: () => set((s) => ({ unreadMessages: s.unreadMessages + 1 })),
  incrementNotifications: () => set((s) => ({ unreadNotifications: s.unreadNotifications + 1 })),
  incrementFriendRequests: () => set((s) => ({ pendingFriendRequests: s.pendingFriendRequests + 1 })),

  clearMessages: () => set({ unreadMessages: 0 }),
  clearNotifications: () => set({ unreadNotifications: 0 }),
  clearFriendRequests: () => set({ pendingFriendRequests: 0 }),
}));
