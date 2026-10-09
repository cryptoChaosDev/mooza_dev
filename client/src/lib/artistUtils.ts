// Мелкие хелперы страниц артиста/медиа.

/**
 * Адрес страницы артиста: /artist/<slug>, если слаг известен, иначе /artist/<id>
 * (страница и сервер сами заменят его на канонический /artist/<slug>).
 * Подстраницы (/artist/:id/edit и т.п.) строятся по id, не через этот хелпер.
 */
export function artistHref(
  a: { id?: string | null; slug?: string | null } | null | undefined,
  fallbackId?: string | null,
): string {
  const key = a?.slug || a?.id || fallbackId || '';
  return `/artist/${encodeURIComponent(key)}`;
}

/**
 * Безопасная ссылка для href: только http(s). Всё остальное (javascript:, data:,
 * vbscript:, «голый» текст) → undefined — <a> без href не исполняет скрипт.
 * Данные приходят от пользователей и из внешних каталогов — доверять нельзя.
 */
export function safeHref(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Копирование в буфер с фоллбэком: navigator.clipboard недоступен вне HTTPS,
 * в некоторых WebView и бросает при отказе в разрешении. Возвращает успех.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* фоллбэк ниже */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Дата релиза (календарная, хранится полднем UTC) → «15.03.2019» без сдвига пояса. */
export function formatReleaseDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}
