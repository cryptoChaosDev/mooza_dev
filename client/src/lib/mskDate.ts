// Календарные даты (сроки заказов/сделок, дата начала сотрудничества) вводятся
// маской ДД.ММ.ГГГГ (как дата рождения в профиле) — нативный <input type="date">
// на iOS ломал вёрстку и давал разный формат. Срок — это КОНЕЦ дня по Москве
// (23:59:59 МСК), а не полночь UTC. МСК = UTC+3 без перехода на летнее время.

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface CalendarDay { y: number; m: number; d: number }

/** Маска ввода: оставляет цифры и расставляет точки → «ДД.ММ.ГГГГ». */
export function maskDateInput(raw: string): string {
  let v = raw.replace(/\D/g, '');
  if (v.length >= 3) v = v.slice(0, 2) + '.' + v.slice(2);
  if (v.length >= 6) v = v.slice(0, 5) + '.' + v.slice(5);
  return v.slice(0, 10);
}

/** Строгий разбор «ДД.ММ.ГГГГ»: 31.02 и 13-й месяц → null. */
export function parseMaskedDate(v: string): CalendarDay | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const d = Number(m[1]); const mo = Number(m[2]); const y = Number(m[3]);
  if (y < 1900 || y > 2200) return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** Конец дня по МСК для календарного дня → момент UTC. */
export function endOfDayMsk(day: CalendarDay): Date {
  return new Date(Date.UTC(day.y, day.m - 1, day.d, 23, 59, 59, 999) - MSK_OFFSET_MS);
}

/** «ДД.ММ.ГГГГ» → ISO конца этого дня по МСК; null, если дата некорректна. */
export function maskedToMskEndOfDayIso(v: string): string | null {
  const day = parseMaskedDate(v);
  return day ? endOfDayMsk(day).toISOString() : null;
}

/** «ДД.ММ.ГГГГ» → «ГГГГ-ММ-ДД» (календарный день без времени); null, если некорректна. */
export function maskedToIsoDay(v: string): string | null {
  const day = parseMaskedDate(v);
  if (!day) return null;
  return `${day.y}-${String(day.m).padStart(2, '0')}-${String(day.d).padStart(2, '0')}`;
}

/** Истёк ли уже этот день по МСК (конец дня в прошлом). */
export function isMaskedDatePast(v: string): boolean {
  const day = parseMaskedDate(v);
  return !!day && endOfDayMsk(day).getTime() < Date.now();
}

/** ISO-момент → «ДД.ММ.ГГГГ» по МСК (для префилла маски из сохранённого срока). */
export function isoToMaskedMsk(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const msk = new Date(t + MSK_OFFSET_MS);
  return `${String(msk.getUTCDate()).padStart(2, '0')}.${String(msk.getUTCMonth() + 1).padStart(2, '0')}.${msk.getUTCFullYear()}`;
}

/** Отображение даты срока по МСК (одинаково во всех часовых поясах). */
export function formatDateMsk(iso?: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', ...opts });
}
