/**
 * Маскирование контактов для гостевого (неавторизованного) просмотра.
 *
 * Решение владельца: «Все действия и контакты доступны только после входа».
 * Гостю не отдаются ни контактные поля, ни контакты, вписанные в свободный текст
 * (описание заказа, био, пост…). Модуль чистый (без БД) — его используют и
 * JSON-эндпоинты (ветка `if (!req.userId)`), и будущие SEO-снимки (Ф4).
 */

export const CONTACT_MASK = '[контакт — после входа]';

// Порядок важен: сначала ссылки и email (в них бывают цифры и «@»), потом
// @handle, телефоны — последними.
const URL_CONTACT_PATTERNS: RegExp[] = [
  // Telegram: t.me/…, telegram.me/…, telegram.dog/…, tg://resolve?domain=…
  /(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.(?:me|dog)\/[^\s<>"')\]]*/gi,
  /tg:\/\/[^\s<>"')\]]+/gi,
  // WhatsApp: wa.me/…, api.whatsapp.com/…, chat.whatsapp.com/…
  /(?:https?:\/\/)?(?:www\.)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)(?:\/[^\s<>"')\]]*)?/gi,
  // VK: личная страница vk.com/id123, «написать» vk.com/write123, мессенджер vk.me/…
  /(?:https?:\/\/)?(?:www\.|m\.)?vk\.com\/(?:id\d+|write-?\d+)[^\s<>"')\]]*/gi,
  /(?:https?:\/\/)?(?:www\.)?vk\.me\/[^\s<>"')\]]*/gi,
  // Viber: viber://…
  /viber:\/\/[^\s<>"')\]]+/gi,
  // mailto:/tel: схемы
  /(?:mailto|tel):[^\s<>"')\]]+/gi,
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// @handle (Telegram/Instagram-стиль): латиница/цифры/«_», 4–32 символа, не часть
// email/слова. Кириллические упоминания («@Иван») под шаблон не попадают.
const HANDLE_RE = /(^|[^\w@.\/])@([A-Za-z][A-Za-z0-9_]{3,31})(?![\w@])/g;

// Кандидат в телефон: 10–15 цифр подряд, между цифрами — до двух разделителей
// (пробел, дефис, точка, скобки). Затем фильтр по количеству цифр.
const PHONE_CANDIDATE_RE = /(^|[^\w+])(\+?\d(?:[\s\-.()‐-‒]{0,2}\d){9,14})(?!\w)/g;

function maskPhones(text: string): string {
  return text.replace(PHONE_CANDIDATE_RE, (full, pre: string, candidate: string) => {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) return full;
    return `${pre}${CONTACT_MASK}`;
  });
}

/**
 * Заменяет контакты в свободном тексте на «[контакт — после входа]»:
 * телефоны, email, t.me / telegram.me, wa.me / whatsapp, @handle, vk.com/id…,
 * vk.me, viber://, mailto:/tel:. null/undefined возвращаются как есть.
 */
export function maskContacts<T extends string | null | undefined>(text: T): T {
  if (typeof text !== 'string' || !text) return text;
  let out: string = text;
  for (const re of URL_CONTACT_PATTERNS) out = out.replace(re, CONTACT_MASK);
  out = out.replace(EMAIL_RE, CONTACT_MASK);
  out = out.replace(HANDLE_RE, (_m, pre: string) => `${pre}${CONTACT_MASK}`);
  out = maskPhones(out);
  return out as T;
}

/** true, если в строке есть хоть один контакт, который маскируется. */
export function containsContact(text: string | null | undefined): boolean {
  if (typeof text !== 'string' || !text) return false;
  return maskContacts(text) !== text;
}

/**
 * Глубокое маскирование строк внутри JSON (например, `priceItems`, `pollOptions`):
 * каждая строка прогоняется через maskContacts, структура сохраняется.
 */
export function maskContactsDeep<T>(value: T, depth = 0): T {
  if (depth > 8) return value;
  if (typeof value === 'string') return maskContacts(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => maskContactsDeep(v, depth + 1)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskContactsDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/**
 * Ключи socialLinks, которые гостю не отдаются никогда (контакты и личные
 * соцсети человека; для артиста — только контактные ключи). Значения заменяются
 * флагом `contactsAvailable: boolean` в ответе.
 */
export const GUEST_HIDDEN_LINK_KEYS = {
  user: [
    // контакты
    'phone', 'email', 'tg_profile', 'whatsapp', 'viber', 'max', 'skype',
    // личные соцсети (по ним можно написать человеку напрямую)
    'telegram', 'tg_channel', 'vk', 'vk_profile', 'ok', 'tenchat',
    'instagram', 'facebook', 'twitter', 'threads', 'linkedin', 'discord',
  ],
  artist: ['phone', 'email', 'tg_profile', 'whatsapp', 'viber', 'max', 'skype'],
} as const;

export type LinkOwnerKind = keyof typeof GUEST_HIDDEN_LINK_KEYS;

/**
 * Гостевая версия socialLinks: без скрытых ключей, только строковые значения,
 * без значений, которые сами по себе выглядят как телефон/email.
 * Возвращает `{ links, contactsAvailable }`, где contactsAvailable — были ли
 * у владельца непустые контактные значения (для кнопки «Показать контакты»).
 */
export function stripLinksForGuest(
  socialLinks: unknown,
  kind: LinkOwnerKind,
): { links: Record<string, string>; contactsAvailable: boolean } {
  const links: Record<string, string> = {};
  let contactsAvailable = false;
  if (!socialLinks || typeof socialLinks !== 'object' || Array.isArray(socialLinks)) {
    return { links, contactsAvailable };
  }
  const hidden = new Set<string>(GUEST_HIDDEN_LINK_KEYS[kind]);
  for (const [key, raw] of Object.entries(socialLinks as Record<string, unknown>)) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const value = raw.trim();
    if (hidden.has(key)) { contactsAvailable = true; continue; }
    // Значение-контакт под «безобидным» ключом (например, телефон в website).
    EMAIL_RE.lastIndex = 0;
    if (EMAIL_RE.test(value) || maskPhones(value) !== value) { contactsAvailable = true; continue; }
    links[key] = value;
  }
  EMAIL_RE.lastIndex = 0;
  return { links, contactsAvailable };
}
