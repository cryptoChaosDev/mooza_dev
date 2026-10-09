import { useEffect } from 'react';

// SEO-мета при SPA-навигации (план, раздел B: useSeo). Первичную разметку для
// роботов отдают серверные снимки (Ф4); здесь — чтобы title/description/canonical
// не «залипали» от предыдущей страницы при переходах внутри приложения
// (Яндекс исполняет JS и видит эти значения, вкладки и история браузера — тоже).

export const SITE_ORIGIN = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '') || 'https://moooza.ru';
export const SITE_NAME = 'Moooza';

const DEFAULT_TITLE = 'Moooza — Музыкальная социальная сеть';
const DEFAULT_DESCRIPTION = 'Moooza — социальная сеть для музыкантов';
export const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
export const ROBOTS_NOINDEX = 'noindex, nofollow';
export const ROBOTS_NOINDEX_FOLLOW = 'noindex, follow';

export interface SeoOptions {
  /** Готовый заголовок (см. seoTitle). */
  title?: string | null;
  description?: string | null;
  /** Путь («/artist/123») или абсолютный URL. По умолчанию — текущий путь без query. */
  canonical?: string | null;
  robots?: string | null;
}

/** «Часть — часть | Moooza»: пустые части выкидываются. */
export function seoTitle(...parts: Array<string | null | undefined | false>): string {
  const body = parts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean).join(' — ');
  return body ? `${body} | ${SITE_NAME}` : DEFAULT_TITLE;
}

/** Описание для meta: без HTML, пробелы схлопнуты, до ~160 символов. */
export function seoDescription(text: string | null | undefined, max = 160): string {
  if (!text) return '';
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trim()}…`;
}

/**
 * robots для детальной страницы: сервер в гостевых ответах отдаёт indexable
 * (false → noindex: закрытые заказы, DRAFT/PENDING-артисты, запрет индексации
 * профиля и т.п.). `extra` — клиентские условия поверх (предпросмотр и др.).
 * Нет данных (404/загрузка) — noindex.
 */
export function robotsFor(data: { indexable?: boolean } | null | undefined, extra = true): string {
  return data && data.indexable !== false && extra ? ROBOTS_INDEX : ROBOTS_NOINDEX;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content == null) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function absolute(urlOrPath: string): string {
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  return `${SITE_ORIGIN}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
}

function apply(opts: SeoOptions) {
  const title = opts.title || DEFAULT_TITLE;
  const description = opts.description || DEFAULT_DESCRIPTION;
  const canonical = absolute(opts.canonical || window.location.pathname);
  document.title = title;
  upsertMeta('name', 'description', description);
  upsertMeta('name', 'robots', opts.robots || ROBOTS_INDEX);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', canonical);
  upsertCanonical(canonical);
}

/**
 * Обновляет title/description/canonical/robots, пока страница смонтирована.
 * При уходе со страницы возвращает значения по умолчанию (для страниц без
 * useSeo: приватные экраны не наследуют чужой title и canonical).
 */
export function useSeo(opts: SeoOptions): void {
  const { title, description, canonical, robots } = opts;
  useEffect(() => {
    apply({ title, description, canonical, robots });
  }, [title, description, canonical, robots]);
  useEffect(() => () => {
    // К моменту cleanup history уже указывает на новый адрес.
    apply({ robots: ROBOTS_NOINDEX_FOLLOW });
  }, []);
}
