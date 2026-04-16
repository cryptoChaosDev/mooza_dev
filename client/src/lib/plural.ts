/**
 * Russian pluralization: plural(3, 'связь', 'связи', 'связей') → 'связи'
 * Forms: one (1, 21...), few (2-4, 22-24...), many (5-20, 25-30...)
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Returns number + correctly inflected word: pluralN(3, 'связь', 'связи', 'связей') → '3 связи' */
export function pluralN(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`;
}
