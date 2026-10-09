// Возврат после входа: гость нажал действие («Написать», «Откликнуться», …) или
// открыл приватную страницу → запоминаем, куда вернуть его после входа или
// регистрации. Само действие повторно НЕ выполняется (план, раздел A): после
// возврата показываем тост «Теперь можно …».
//
// Храним в sessionStorage: живёт в пределах вкладки и переживает жёсткие
// переходы (window.location.href после подтверждения email, OAuth-редирект VK).

const RETURN_KEY = 'mooza_return_to';
const TOAST_KEY = 'mooza_return_toast';
// Старше часа — уже не «только что нажатое» действие, не возвращаем.
const MAX_AGE_MS = 60 * 60 * 1000;

export type GateReason =
  | 'message' | 'contacts' | 'connect' | 'friend' | 'favorite' | 'follow'
  | 'deal' | 'respondOrder' | 'respondVacancy' | 'join' | 'like' | 'reaction'
  | 'comment' | 'save' | 'repost' | 'vote' | 'create' | 'complaint' | 'feedWall'
  | 'saved' | 'preset' | 'page' | 'generic';

interface StoredReturn { path: string; reason?: GateReason; ts: number }

// Только внутренние пути вида «/что-то» (не «//evil.com», не схема) и не
// экраны входа — иначе после входа вернёмся на /login по кругу.
export function isSafeReturnPath(path: unknown): path is string {
  if (typeof path !== 'string' || !/^\/(?!\/)/.test(path)) return false;
  if (/[\r\n\\]/.test(path)) return false;
  const pathname = path.split(/[?#]/)[0];
  if (/^\/(login|register|forgot-password)(\/|$)/.test(pathname)) return false;
  return true;
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** Запомнить, куда вернуть после входа (по умолчанию — текущая страница). */
export function saveReturnTo(path: string = currentPath(), reason?: GateReason): void {
  if (!isSafeReturnPath(path)) return;
  try {
    const value: StoredReturn = { path, reason, ts: Date.now() };
    sessionStorage.setItem(RETURN_KEY, JSON.stringify(value));
  } catch { /* storage недоступен — просто не вернём */ }
}

function read(): StoredReturn | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredReturn;
    if (!v || !isSafeReturnPath(v.path) || Date.now() - (v.ts || 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(RETURN_KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

/** Посмотреть сохранённый путь, не забирая его. */
export function peekReturnTo(): string | null {
  return read()?.path ?? null;
}

export function clearReturnTo(): void {
  try { sessionStorage.removeItem(RETURN_KEY); } catch { /* ignore */ }
}

/**
 * Забрать путь возврата (одноразово). Вызывается во всех местах успешного входа.
 * Если у возврата была причина (действие), ставит тост «Теперь можно …»,
 * который покажется, когда пользователь окажется на этой странице.
 */
export function consumeReturnTo(): string | null {
  const v = read();
  clearReturnTo();
  if (!v) return null;
  if (v.reason && v.reason !== 'page' && v.reason !== 'generic') {
    try {
      sessionStorage.setItem(TOAST_KEY, JSON.stringify({ path: v.path.split(/[?#]/)[0], reason: v.reason, ts: Date.now() }));
    } catch { /* ignore */ }
  }
  return v.path;
}

const NOW_YOU_CAN: Partial<Record<GateReason, string>> = {
  message: 'Теперь можно написать сообщение',
  contacts: 'Теперь можно посмотреть контакты',
  connect: 'Теперь можно установить связь',
  friend: 'Теперь можно добавить в друзья',
  favorite: 'Теперь можно добавить в избранное',
  follow: 'Теперь можно добавить артиста в избранное',
  deal: 'Теперь можно оформить сделку',
  respondOrder: 'Теперь можно откликнуться на заказ',
  respondVacancy: 'Теперь можно откликнуться на вакансию',
  join: 'Теперь можно вступить в состав',
  like: 'Теперь можно ставить лайки',
  reaction: 'Теперь можно ставить реакции',
  comment: 'Теперь можно читать и писать комментарии',
  save: 'Теперь можно сохранять посты',
  repost: 'Теперь можно делиться постами в ленте',
  vote: 'Теперь можно голосовать',
  create: 'Теперь можно публиковать',
  complaint: 'Теперь можно отправить жалобу',
  feedWall: 'Теперь можно смотреть ленту дальше',
  saved: 'Теперь можно открыть сохранённые',
  preset: 'Теперь можно сохранять пресеты',
};

/**
 * Тост после возврата: отдаёт текст, если пользователь уже на странице возврата.
 * Одноразово. Если пользователь ушёл в онбординг — тост дождётся возврата.
 */
export function takeReturnToast(pathname: string): string | null {
  try {
    const raw = sessionStorage.getItem(TOAST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { path: string; reason: GateReason; ts: number };
    if (!v || Date.now() - (v.ts || 0) > MAX_AGE_MS) { sessionStorage.removeItem(TOAST_KEY); return null; }
    if (v.path !== pathname) return null;
    sessionStorage.removeItem(TOAST_KEY);
    return NOW_YOU_CAN[v.reason] ?? null;
  } catch {
    return null;
  }
}
