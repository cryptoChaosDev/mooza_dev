// Общие проверки для экранов входа/регистрации/сброса пароля.
// Держим их в одном месте, чтобы клиент не расходился с сервером
// (server/src/routes/auth.ts: zod .email() и passwordSchema).

// Тот же шаблон, что у zod .email() на сервере: латиница, без «..», домен
// с TLD из 2+ букв. Кириллические адреса и «a@b.c» сервер отклоняет — значит,
// и шаг email не должен их пропускать (иначе 400 только в самом конце).
export const EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

// Требования к паролю — как на сервере при регистрации и сбросе пароля.
export function passwordChecks(password: string) {
  const longEnough = password.length >= 8;
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return { longEnough, hasDigit, hasSpecial, strong: longEnough && hasDigit && hasSpecial };
}

// Первое невыполненное требование к паролю (текст для подсказки) или null.
export function passwordProblem(password: string): string | null {
  const c = passwordChecks(password);
  if (!c.longEnough) return 'Пароль — минимум 8 символов';
  if (!c.hasDigit) return 'Пароль должен содержать хотя бы одну цифру';
  if (!c.hasSpecial) return 'Пароль должен содержать спецсимвол (например ! @ # $)';
  return null;
}

// Пройден ли онбординг. Источник истины — серверный onboardingCompletedAt.
// localStorage-флаг учитываем только для аккаунтов старше самого серверного флага
// (2026-05-29): на общем устройстве он может остаться от ДРУГОГО аккаунта и
// спрятать слайды новичку.
const ONBOARDING_FLAG_SINCE = Date.parse('2026-05-29T00:00:00Z');
export function isTourDone(user: any): boolean {
  if (user?.onboardingCompletedAt) return true;
  const legacy = !!user?.createdAt && Date.parse(user.createdAt) < ONBOARDING_FLAG_SINCE;
  try {
    return legacy && !!localStorage.getItem('mooza_tour_done');
  } catch {
    return false;
  }
}
