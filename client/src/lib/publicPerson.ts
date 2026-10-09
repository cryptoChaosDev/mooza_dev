// Люди в гостевых ответах сервера. Человек без согласия на публичное
// распространение ПДн приходит обезличенным: toPublicPerson →
// { id: null, displayName: 'Участник Moooza', avatar: null, isPublic: false }.
// Для авторизованного — обычный объект с id/firstName/lastName.

export interface PersonLike {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  isPublic?: boolean;
}

export const ANONYMOUS_NAME = 'Участник Moooza';

/** Обезличенный участник: ни id, ни имени. */
export function isAnonymousPerson(p: PersonLike | null | undefined): boolean {
  if (!p) return true;
  return !p.id || p.isPublic === false;
}

/** Имя для показа. `surnameFirst` — «Фамилия Имя» (составы, каталог). */
export function personName(p: PersonLike | null | undefined, opts: { surnameFirst?: boolean; fallback?: string } = {}): string {
  const fallback = opts.fallback ?? ANONYMOUS_NAME;
  if (!p) return fallback;
  const first = (p.firstName ?? '').trim();
  const last = (p.lastName ?? '').trim();
  const full = (opts.surnameFirst ? `${last} ${first}` : `${first} ${last}`).trim();
  return full || (p.displayName ?? '').trim() || fallback;
}

/** Ссылка на профиль или null (обезличенному ссылки нет). */
export function personHref(p: PersonLike | null | undefined): string | null {
  return p?.id && p.isPublic !== false ? `/profile/${p.id}` : null;
}
