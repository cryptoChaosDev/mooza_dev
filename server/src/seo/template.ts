/**
 * Шаблон SEO-снимка — настоящий собранный index.html из web-контейнера
 * (SPA_TEMPLATE_URL, по умолчанию http://web:3000/index.html), поэтому хеши
 * ассетов в снимке всегда совпадают с текущим деплоем.
 *
 *   - Условный GET (If-None-Match / If-Modified-Since): nginx отвечает 304,
 *     пока файл не изменился; мемоизация ~1 с — не дёргаем web на каждый запрос.
 *   - Ошибка загрузки при наличии прошлой версии — отдаём её (stale-if-error);
 *     без шаблона вообще — исключение (роутер ответит 503, nginx отдаст SPA).
 *   - applyTemplate: подстановка между маркерами <!--seo:head-->…<!--/seo:head-->
 *     и вместо <!--seo:body-->; если маркеров нет (старая сборка) — фолбэк-вставка
 *     перед </head> (с удалением дефолтных title/description/robots/OG/Twitter)
 *     и внутрь <div id="root">.
 */

import { spaTemplateUrl } from './config';

const MEMO_MS = 1_000;
const FETCH_TIMEOUT_MS = 1_500;

type CachedTemplate = { html: string; etag: string | null; lastModified: string | null; checkedAt: number };

let cached: CachedTemplate | null = null;
let inflight: Promise<string> | null = null;

async function refresh(): Promise<string> {
  const headers: Record<string, string> = { accept: 'text/html' };
  if (cached?.etag) headers['if-none-match'] = cached.etag;
  if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(spaTemplateUrl(), { headers, signal: ctrl.signal, redirect: 'error' });
    if (res.status === 304 && cached) {
      cached.checkedAt = Date.now();
      return cached.html;
    }
    if (!res.ok) throw new Error(`SPA template HTTP ${res.status}`);
    const html = await res.text();
    if (!/<div id="root">/i.test(html)) throw new Error('SPA template has no <div id="root">');
    cached = {
      html,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      checkedAt: Date.now(),
    };
    return html;
  } catch (err) {
    if (cached) {
      // stale-if-error: следующая попытка — через MEMO_MS
      cached.checkedAt = Date.now();
      console.warn('[seo] SPA template refresh failed, serving cached copy:', (err as Error)?.message ?? err);
      return cached.html;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Текущий шаблон (мемо ~1 с, условный GET, один запрос в полёте). */
export async function getTemplate(): Promise<string> {
  if (cached && Date.now() - cached.checkedAt < MEMO_MS) return cached.html;
  if (!inflight) inflight = refresh().finally(() => { inflight = null; });
  return inflight;
}

/** Для тестов: забыть шаблон. */
export function resetTemplateCache(): void {
  cached = null;
  inflight = null;
}

const HEAD_MARKERS_RE = /<!--seo:head-->[\s\S]*?<!--\/seo:head-->/;
const BODY_MARKER = '<!--seo:body-->';

/** Дефолтные теги, которые снимок заменяет (для фолбэка без маркеров). */
const DEFAULT_HEAD_TAG_RES: RegExp[] = [
  /<title\b[^>]*>[\s\S]*?<\/title>\s*/gi,
  /<meta\s+name="(?:description|robots)"[^>]*>\s*/gi,
  /<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi,
  /<meta\s+property="og:[^"]*"[^>]*>\s*/gi,
  /<link\s+rel="canonical"[^>]*>\s*/gi,
];

/** Подставить head/body снимка в шаблон. Замены — функциями (никаких `$&` из данных). */
export function applyTemplate(template: string, head: string, body: string): string {
  let out = template;
  if (HEAD_MARKERS_RE.test(out)) {
    out = out.replace(HEAD_MARKERS_RE, () => `<!--seo:head-->${head}<!--/seo:head-->`);
  } else if (head) {
    for (const re of DEFAULT_HEAD_TAG_RES) out = out.replace(re, '');
    out = out.replace(/<\/head>/i, () => `${head}</head>`);
  }
  if (out.includes(BODY_MARKER)) {
    out = out.replace(BODY_MARKER, () => body);
  } else if (body) {
    out = out.replace(/<div id="root">\s*<\/div>/i, () => `<div id="root">${body}</div>`);
  }
  return out;
}
