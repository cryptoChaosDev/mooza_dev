import { QueryClient } from '@tanstack/react-query';

// Единый QueryClient приложения. Вынесен из main.tsx, чтобы logout
// (stores/authStore) мог очистить кэш: ключи ['profile'], ['notifications'] и
// др. не привязаны к userId — без clear() следующий вошедший на этом
// устройстве увидел бы данные предыдущего пользователя.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
