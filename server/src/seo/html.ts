/**
 * Безопасная сборка HTML/JSON-LD для SEO-снимков. Любая строка из БД попадает
 * в снимок ТОЛЬКО через эти функции:
 *   - escapeHtml — текст и значения атрибутов;
 *   - safeHttpUrl / absUrl — ссылки и картинки (только http/https);
 *   - jsonForScript — JSON-LD внутри <script> (экранирование <, >, &, U+2028/2029);
 *   - stripTags + truncate — описания (без разметки, обрезка по кодпоинтам).
 */

import { appUrl } from './config';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Экранирование текста и значений атрибутов (& < > " '). */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** XML (sitemap): тот же набор сущностей. */
export const escapeXml = escapeHtml;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»',
  mdash: '—', ndash: '–', hellip: '…',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower.startsWith('#x') || lower.startsWith('#')) {
      const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ' ';
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[lower] ?? m;
  });
}

/**
 * Текст без разметки: теги вырезаются (script/style — с содержимым), сущности
 * декодируются, управляющие символы и пробелы схлопываются. Результат — ПЛОСКИЙ
 * текст: при выводе его всё равно нужно экранировать.
 */
export function stripTags(html: unknown): string {
  let s = String(html ?? '');
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/</g, ' '); // недозакрытый тег в конце
  s = decodeEntities(s);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Обрезка по кодпоинтам (эмодзи и суррогатные пары не рвутся), по слову, с «…». */
export function truncate(text: unknown, max: number): string {
  const s = String(text ?? '');
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  const cut = chars.slice(0, Math.max(1, max - 1)).join('');
  const sp = cut.lastIndexOf(' ');
  const head = sp > cut.length * 0.6 ? cut.slice(0, sp) : cut;
  return `${head.replace(/[\s,.;:—–-]+$/u, '')}…`;
}

/** Плоский текст для description: без тегов, ≤ max кодпоинтов. */
export function plainText(html: unknown, max = 160): string {
  return truncate(stripTags(html), max);
}

/** Только абсолютные http(s)-ссылки без учётных данных и управляющих символов; иначе null. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  // eslint-disable-next-line no-control-regex
  if (!s || s.length > 2048 || /[\u0000-\u001f\u007f\s\\]/.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Абсолютный URL: абсолютная http(s)-ссылка (аватары VK, обложки ЯМ…) — как
 * есть после проверки; путь от корня (`/uploads/…`, `/artist/…`) — от APP_URL.
 * `//host`, `javascript:`, относительные пути — null.
 */
export function absUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return safeHttpUrl(s);
  // eslint-disable-next-line no-control-regex
  if (!s.startsWith('/') || s.startsWith('//') || /[\u0000-\u001f\u007f\\]/.test(s) || s.length > 2048) return null;
  try {
    const base = appUrl();
    const u = new URL(s, `${base}/`);
    if (u.origin !== new URL(base).origin) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Картинка для og:image: absUrl + крупный размер обложек Яндекс.Музыки
 * (avatars.yandex.net/…/400x400 → …/1000x1000).
 */
export function ogImageUrl(value: unknown): string | null {
  const u = absUrl(value);
  if (!u) return null;
  try {
    const parsed = new URL(u);
    if (/(^|\.)avatars\.yandex\.net$/i.test(parsed.hostname)) {
      parsed.pathname = parsed.pathname.replace(/\/\d{2,4}x\d{2,4}$/, '/1000x1000');
      return parsed.toString();
    }
  } catch { /* как есть */ }
  return u;
}

/**
 * JSON для вставки в <script type="application/ld+json">: JSON.stringify +
 * экранирование <, >, & (не закрыть </script>, не открыть <!--) и U+2028/2029.
 * Результат остаётся валидным JSON (JSON.parse вернёт исходное значение).
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Дата для schema.org/sitemap: ISO 8601 без миллисекунд, UTC. */
export function isoDateTime(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Только дата YYYY-MM-DD (datePublished релиза и т.п.). */
export function isoDate(d: Date | string | null | undefined): string | null {
  const iso = isoDateTime(d);
  return iso ? iso.slice(0, 10) : null;
}

/** Длительность ISO 8601 из миллисекунд: 245000 → PT4M5S. */
export function isoDuration(ms: unknown): string | null {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  let total = Math.round(n / 1000);
  const h = Math.floor(total / 3600);
  total -= h * 3600;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s || (!h && !m) ? `${s}S` : ''}`;
}

/** Цена в рублях для текста: «от 1 000 до 5 000 ₽». */
export function formatRub(from: unknown, to: unknown): string | null {
  const f = Number(from);
  const t = Number(to);
  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/[\u00a0\u202f]/g, ' ');
  const hasF = from != null && Number.isFinite(f) && f > 0;
  const hasT = to != null && Number.isFinite(t) && t > 0;
  if (hasF && hasT) return f === t ? `${fmt(f)} ₽` : `от ${fmt(f)} до ${fmt(t)} ₽`;
  if (hasF) return `от ${fmt(f)} ₽`;
  if (hasT) return `до ${fmt(t)} ₽`;
  return null;
}
