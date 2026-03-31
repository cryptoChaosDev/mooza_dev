import { create } from 'zustand';

interface PresenceStore {
  onlineUsers: Set<string>;
  setOnlineUsers: (users: string[]) => void;
  addOnline: (userId: string) => void;
  removeOnline: (userId: string) => void;
  isOnline: (userId: string) => boolean;
}

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  onlineUsers: new Set(),
  setOnlineUsers: (users) => set({ onlineUsers: new Set(users) }),
  addOnline: (userId) =>
    set((state) => ({ onlineUsers: new Set([...state.onlineUsers, userId]) })),
  removeOnline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    }),
  isOnline: (userId) => get().onlineUsers.has(userId),
}));
