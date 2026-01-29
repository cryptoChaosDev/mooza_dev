import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('token', token);
        set({ user, token });
      },
      logout: () => {
        localStorage.removeItem('token');
        set({ user: null, token: null });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
