import { useQuery } from '@tanstack/react-query';
import { siteSettingsAPI } from './api';

// Публичные настройки сайта (GET /api/site-settings). Ключ ['site-settings'] —
// общий с лендингом и админкой (форма данных та же: Record<string, string>).
export function useSiteSettings() {
  const query = useQuery({
    queryKey: ['site-settings'],
    queryFn: async () => { const { data } = await siteSettingsAPI.get(); return data as Record<string, string>; },
    staleTime: 60_000,
    retry: 1,
  });
  const s = query.data;
  return {
    settings: s,
    isLoading: query.isLoading,
    // Гостевой режим — аварийный выключатель (план, п. 0.7). Пока сервер не
    // отдаёт флаг или запрос упал — режим выключен (как было до фичи).
    guestBrowsingEnabled: s?.guestBrowsingEnabled === 'true',
    registrationEnabled: s?.registrationEnabled !== 'false',
    loginEnabled: s?.loginEnabled !== 'false',
    referralRegistrationEnabled: s?.referralRegistrationEnabled === 'true',
    // Открытый режим индексации (сервер: env SEO_INDEXABLE + гостевой режим).
    // false — легаси-режим «как сейчас на PROD»: /login и /register индексируются.
    seoIndexable: s?.seoIndexable === 'true',
    // Ссылка на APK для Android (лендинг, бургер-меню) — флаг админки.
    androidApkEnabled: s?.androidApkEnabled === 'true',
  };
}
