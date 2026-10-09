// Яндекс.Метрика: безопасная обёртка над window.ym. Загрузчик (window.mzLoadMetrika)
// объявлен в client/index.html и запускается только после согласия на cookies
// («Принять»). Без согласия/если скрипт не загрузился — вызовы молча пропускаются.

export const YM_ID = 109562743;

/** Подключить счётчик после согласия на cookies (CookieConsent → «Принять»). */
export function enableMetrika(): void {
  try {
    (window as unknown as { mzLoadMetrika?: () => void }).mzLoadMetrika?.();
  } catch { /* ignore */ }
}

export type MetrikaGoal =
  | 'guest_view' | 'gate_open' | 'gate_login_click' | 'gate_access_click'
  | 'waitlist_submit' | 'invite_code_submit' | 'login_success' | 'register_success';

type Ym = (id: number, method: string, ...args: unknown[]) => void;

function ym(): Ym | null {
  const fn = (window as unknown as { ym?: unknown }).ym;
  return typeof fn === 'function' ? (fn as Ym) : null;
}

function isGuest(): boolean {
  try { return !localStorage.getItem('token'); } catch { return true; }
}

/** Цель Метрики. Гостю к параметрам добавляется guest:true. */
export function reachGoal(goal: MetrikaGoal, params: Record<string, unknown> = {}): void {
  try {
    const f = ym();
    if (!f) return;
    f(YM_ID, 'reachGoal', goal, isGuest() ? { guest: true, ...params } : params);
  } catch { /* метрика не должна ломать приложение */ }
}

/** Параметры визита (раздел B: guest:true для гостя). */
export function setVisitParams(params: Record<string, unknown>): void {
  try {
    ym()?.(YM_ID, 'params', params);
  } catch { /* ignore */ }
}

// guest_view — один раз на тип сущности за визит (не на каждый ререндер).
const seen = new Set<string>();
export function trackGuestView(type: string, id?: string | null): void {
  if (!isGuest()) return;
  const key = `${type}:${id ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  reachGoal('guest_view', { type });
}
