const KEY = 'mooza_cookie_consent';

export const getCookieConsent = (): 'all' | 'necessary' | null => {
  const v = localStorage.getItem(KEY);
  if (v === 'all' || v === 'necessary') return v;
  return null;
};

export const hasAnalyticsConsent = (): boolean => getCookieConsent() === 'all';
