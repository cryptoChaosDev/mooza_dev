// Календарные даты (дедлайны заказов/сделок, дата начала сотрудничества и т.п.)
// вводятся пользователем как день, без времени. Интерпретируем их по
// Europe/Moscow: дедлайн — это КОНЕЦ дня по МСК (23:59:59.999), а не полночь UTC
// (иначе «до 15.10» истекал 15.10 в 03:00 МСК и заказ архивировался утром).
// МСК = UTC+3 без перехода на летнее время (с 2014 г.), поэтому смещение фиксированное.

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface CalendarDay { y: number; m: number; d: number }

function validDay(y: number, m: number, d: number): CalendarDay | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Строгая проверка: 31.02 не «перекатывается» в 3 марта.
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { y, m, d };
}

/**
 * Строгий разбор календарного дня. Принимает «ДД.ММ.ГГГГ», «ГГГГ-ММ-ДД» или
 * полный ISO-момент («2026-10-15T20:59:59.999Z» — берётся его день по МСК).
 * Возвращает null для пустых/битых значений («31.02.2026», «13-й месяц», мусор).
 */
export function parseCalendarDay(input: unknown): CalendarDay | null {
  if (input == null || input === '') return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    const msk = new Date(input.getTime() + MSK_OFFSET_MS);
    return validDay(msk.getUTCFullYear(), msk.getUTCMonth() + 1, msk.getUTCDate());
  }
  if (typeof input !== 'string') return null;
  const s = input.trim();
  let m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (m) return validDay(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return validDay(Number(m[1]), Number(m[2]), Number(m[3]));
  // Полный ISO-момент: сначала строго проверяем саму дату, затем берём день по МСК.
  m = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m || !validDay(Number(m[1]), Number(m[2]), Number(m[3]))) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return parseCalendarDay(new Date(t));
}

/** Конец календарного дня по МСК (23:59:59.999 МСК) как момент UTC. */
export function endOfDayMsk(day: CalendarDay): Date {
  return new Date(Date.UTC(day.y, day.m - 1, day.d, 23, 59, 59, 999) - MSK_OFFSET_MS);
}

/** Начало календарного дня по МСК (00:00 МСК) как момент UTC. */
export function startOfDayMsk(day: CalendarDay): Date {
  return new Date(Date.UTC(day.y, day.m - 1, day.d) - MSK_OFFSET_MS);
}

/**
 * Разбор поля-дедлайна из тела запроса.
 *  - undefined → поле не передано (не менять);
 *  - null / '' → «без срока»;
 *  - валидный день → конец этого дня по МСК;
 *  - иначе → 'invalid'.
 */
export function parseDeadlineField(input: unknown): Date | null | undefined | 'invalid' {
  if (input === undefined) return undefined;
  if (input === null || input === '') return null;
  const day = parseCalendarDay(input);
  return day ? endOfDayMsk(day) : 'invalid';
}
