import { create } from 'zustand';

export type ToastType = 'error' | 'success' | 'info';
export interface ToastItem { id: number; message: string; type: ToastType }

interface ToastState {
  toasts: ToastItem[];
  add: (message: string, type: ToastType) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (message, type) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Module-level helpers — callable from anywhere (e.g. a mutation's onError),
// no hook required.
export const toast = {
  error: (message: string) => useToastStore.getState().add(message, 'error'),
  success: (message: string) => useToastStore.getState().add(message, 'success'),
  info: (message: string) => useToastStore.getState().add(message, 'info'),
};
