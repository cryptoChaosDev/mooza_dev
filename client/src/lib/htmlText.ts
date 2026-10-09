/**
 * Текст поста без HTML-тегов — для превью и подписей (контент постов хранится
 * как санитизированный HTML). DOMParser не исполняет скрипты и не грузит
 * картинки. Между блоками (<p>, <br>, <li>…) — пробел, чтобы слова не слипались.
 */
export function htmlToText(html?: string | null): string {
  if (!html) return '';
  const spaced = html.replace(/<\/(p|div|li|h[1-6]|blockquote)>|<br\s*\/?>/gi, '$& ');
  try {
    return (new DOMParser().parseFromString(spaced, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return spaced.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
