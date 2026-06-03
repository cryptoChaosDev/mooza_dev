// ё/е-insensitive search helpers for client-side filtering.
// Treat Cyrillic "е" and "ё" as the same letter (so "елка" matches "ёлка").
// Mirrors the server-side yoNorm used for DB search.

/** Lowercase a string and map "ё" → "е". */
export const yoNorm = (s?: string | null): string =>
  (s ?? '').toLowerCase().replace(/ё/g, 'е');

/** True if `haystack` contains `needle`, ignoring case and ё/е differences. */
export const yoIncludes = (haystack?: string | null, needle?: string | null): boolean =>
  yoNorm(haystack).includes(yoNorm(needle));
