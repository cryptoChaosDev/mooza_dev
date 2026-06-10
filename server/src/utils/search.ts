/**
 * ё/е-insensitive search helpers.
 *
 * The DB holds generated "*Norm" columns for every searchable text field:
 * lowercased with "ё" mapped to "е" (see migration 20260603000000). Search
 * queries must be normalized the SAME way before being compared against those
 * columns, so that "елка" matches "ёлка" and vice-versa. Original columns keep
 * "ё" for display.
 */

/** Normalize a search term the same way the generated *Norm columns are: lower + ё→е. */
export function yoNorm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/ё/g, 'е');
}
