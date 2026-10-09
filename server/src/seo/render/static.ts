/**
 * Снимки /privacy и /terms: текст документа из /legal/*.html (тот же файл, что
 * грузит LegalDocView на клиенте) — с web-контейнера, рядом с шаблоном.
 * Сами /legal/*.html закрыты noindex (nginx), индексируется страница приложения.
 * Документ недоступен — короткий снимок со ссылкой.
 */

import { SITE_NAME, spaTemplateUrl } from '../config';
import { escapeHtml, stripTags, truncate } from '../html';
import { RenderOutcome, buildSnapshot, pageTitle, h1, para, linkList } from './common';

const DOCS = {
  privacy: { slug: 'privacy-policy', title: 'Политика конфиденциальности', path: '/privacy' },
  terms: { slug: 'user-agreement', title: 'Пользовательское соглашение', path: '/terms' },
} as const;

export type StaticDoc = keyof typeof DOCS;

const MAX_PARAGRAPHS = 400;
const MAX_CHARS = 60_000;

/** HTML документа → абзацы плоского текста. */
export function docParagraphs(html: string): string[] {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  let s = bodyMatch ? bodyMatch[1] : html;
  s = s.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  // Блочные теги → разделитель абзацев
  s = s.replace(/<\/?(p|div|li|h[1-6]|tr|section|article|blockquote|br)\b[^>]*>/gi, '\n\n');
  const out: string[] = [];
  let total = 0;
  for (const chunk of s.split(/\n\s*\n/)) {
    const text = stripTags(chunk);
    if (!text) continue;
    out.push(text);
    total += text.length;
    if (out.length >= MAX_PARAGRAPHS || total >= MAX_CHARS) break;
  }
  return out;
}

async function fetchDoc(slug: string): Promise<string[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1_500);
  try {
    const url = new URL(`/legal/${slug}.html`, spaTemplateUrl()).toString();
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'error', headers: { accept: 'text/html' } });
    if (!res.ok) return null;
    const paragraphs = docParagraphs(await res.text());
    return paragraphs.length ? paragraphs : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function renderStaticDoc(doc: StaticDoc): Promise<RenderOutcome> {
  const meta = DOCS[doc];
  const paragraphs = await fetchDoc(meta.slug);
  // Первый абзац обычно повторяет заголовок документа — пропускаем его в теле.
  const bodyParas = (paragraphs ?? []).filter((p, i) => !(i === 0 && p.toLowerCase().includes(meta.title.toLowerCase().slice(0, 12))));
  const description = bodyParas.length
    ? truncate(bodyParas.slice(0, 3).join(' '), 160)
    : `${meta.title} сервиса ${SITE_NAME}.`;
  const bodyHtml =
    h1(meta.title)
    + (bodyParas.length
      ? bodyParas.map((p) => `<p class="ssr-desc">${escapeHtml(p)}</p>`).join('')
      : para(`${meta.title} сервиса ${SITE_NAME}.`))
    + linkList(null, [{ href: `/legal/${meta.slug}.html`, text: 'Документ целиком' }]);
  return buildSnapshot({
    title: pageTitle(meta.title),
    description,
    canonicalPath: meta.path,
    indexable: true,
    crumbs: [{ name: SITE_NAME, url: '/' }, { name: meta.title }],
    bodyHtml,
  });
}
