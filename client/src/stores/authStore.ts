import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queryClient } from '../lib/queryClient';
import { unsubscribePush } from '../lib/push';
import { useBadgeStore } from './badgeStore';

interface User {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  avatar?: string;
  bio?: string;
  country?: string;
  city?: string;
  role?: string;
  isAdmin?: boolean;
  genres?: string[];
  fieldOfActivityId?: string;
  fieldOfActivity?: { id: string; name: string };
  userProfessions?: {
    id: string;
    professionId: string;
    features: string[];
    profession: {
      id: string;
      name: string;
      fieldOfActivity: { id: string; name: string };
    };
  }[];
  userArtists?: {
    id: string;
    artistId: string;
    artist: { id: string; name: string };
  }[];
  employerId?: string;
  employer?: { id: string; name: string; inn?: string; ogrn?: string };
  termsAgreedAt?: string | null;
  onboardingCompletedAt?: string | null;
  birthDate?: string | null;
  isPro?: boolean;
  proUntil?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        // Новый вход — кэш предыдущей сессии не должен «просочиться»
        if (get().user?.id && get().user?.id !== user.id) queryClient.clear();
        localStorage.setItem('token', token);
        set({ user, token });
      },
      setUser: (user) => set({ user }),
      logout: () => {
        const prevToken = get().token ?? localStorage.getItem('token');
        localStorage.removeItem('token');
        set({ user: null, token: null });
        // Кэш react-query не привязан к userId (['profile'], ['notifications']…)
        // — без очистки следующий пользователь на устройстве видит чужие данные.
        queryClient.clear();
        useBadgeStore.getState().reset();
        // Push этого устройства больше не должен приходить на вышедший аккаунт.
        void unsubscribePush(prevToken);
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
