// Афиша Qtickets (qtickets.events) для раздела «Сцена».
//
// По договорённости с Qtickets берём афишу с публичного сайта: раз в сутки, по
// одному запросу в секунду, только музыкальные события (QTICKETS_MUSIC_TYPES) в
// городах нашего каталога. Страницы событий не открываем — всё нужное есть в
// карточке ленты города (название, тип, дата с часовым поясом, площадка, цена,
// картинка, ссылка). Ссылка «Билеты» ведёт на страницу события Qtickets;
// партнёрский код — env QTICKETS_PARTNER_QUERY (например, «qpartner=moooza»).
//
// Разбор — регулярками по разметке ленты: если Qtickets поменяет вёрстку, парсер
// вернёт 0 событий, и импорт НЕ удалит уже сохранённые (см. complete в обходе).

export const QTICKETS_MUSIC_TYPES = new Set(['Концерт', 'Фестиваль', 'Рейв', 'Вечеринка']);

const SITE_ROOT = 'qtickets.events';
const UA = 'Mozilla/5.0 (compatible; MooozaScene/1.0; +https://moooza.ru)';

export interface QticketsItem {
  externalId: string;
  url: string;
  title: string;
  type: string;
  startsAt: Date;
  /** Смещение местного времени города от UTC в минутах (из datetime карточки). */
  utcOffsetMin: number | null;
  venue: string | null;
  imageUrl: string | null;
  /** Крупная версия афиши (наибольшая из image-set карточки). */
  posterUrl: string | null;
  priceFrom: number | null;
}

/** Подробности со страницы события (JSON-LD Event + возраст из разметки). */
export interface QticketsEventDetails {
  description: string | null;
  address: string | null;
  endsAt: Date | null;
  organizer: string | null;
  ageLimit: string | null;
  priceFrom: number | null;
  imageUrl: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Текст из фрагмента HTML: без тегов, с раскрытыми сущностями, без лишних пробелов. */
function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Смещение пояса из ISO-строки («+04:00» → 240, «Z» → 0); нет пояса — null. */
export function isoOffsetMinutes(iso: string): number | null {
  const m = /(?:([+-])(\d{2}):?(\d{2})|Z)$/.exec(iso.trim());
  if (!m) return null;
  if (!m[1]) return 0;
  return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

/** Ключ сравнения названий городов: регистр и ё не важны. */
export function cityKey(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Города Qtickets из выпадающего выбора города (есть на каждой странице ленты):
 * ключ cityKey(название) → поддомен.
 */
export function parseQticketsCities(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<a[^>]*href="https:\/\/([a-z0-9-]+)\.qtickets\.events\/?"[^>]*>\s*([^<]{1,60}?)\s*<\/a>/g;
  for (const m of html.matchAll(re)) {
    const name = text(m[2]);
    if (name && !out.has(cityKey(name))) out.set(cityKey(name), m[1]);
  }
  return out;
}

/** Одна страница ленты города: карточки событий, название города, есть ли следующая. */
export function parseQticketsListing(html: string): { cityName: string | null; items: QticketsItem[]; hasNext: boolean } {
  const h1 = /<h1>\s*Билеты на мероприятия в городе\s+([^<]+?)\s*<\/h1>/.exec(html);
  const items: QticketsItem[] = [];
  for (const block of html.matchAll(/<li class="item">([\s\S]*?)<\/li>/g)) {
    const b = block[1];
    const link = /href="(https:\/\/[a-z0-9-]+\.qtickets\.events\/(\d+)[^"]*)"/.exec(b);
    const title = /<h2>([\s\S]*?)<\/h2>/.exec(b);
    const type = /<div class="type">([\s\S]*?)<\/div>/.exec(b);
    const dt = /<time[^>]*datetime="([^"]+)"/.exec(b);
    if (!link || !title || !type || !dt) continue;
    const startsAt = new Date(dt[1]);
    const t = text(title[1]).slice(0, 300);
    if (!t || Number.isNaN(startsAt.getTime())) continue;
    const venue = /<span class="place-name">([\s\S]*?)<\/span>/.exec(b);
    const image = /url\('(https:\/\/cdn\.qtickets\.tech\/[^']+)'\)/.exec(b);
    // image-set: url(&quot;…&quot;) 1x/2x/3x — для страницы концерта берём самую крупную.
    let poster: { url: string; x: number } | null = null;
    for (const m of b.matchAll(/url\(&quot;(https:\/\/cdn\.qtickets\.tech\/[^&]+)&quot;\)\s*(\d)x/g)) {
      const x = Number(m[2]);
      if (!poster || x > poster.x) poster = { url: m[1], x };
    }
    // Цена — по тексту карточки: в разметке между разрядами бывает &nbsp;.
    const price = /от\s*([\d\s ]+?)\s*руб/.exec(text(b));
    const priceNum = price ? parseInt(price[1].replace(/[\s ]/g, ''), 10) : NaN;
    items.push({
      externalId: link[2],
      url: decodeEntities(link[1]),
      title: t,
      type: text(type[1]),
      startsAt,
      utcOffsetMin: isoOffsetMinutes(dt[1]),
      venue: venue ? text(venue[1]).slice(0, 300) || null : null,
      imageUrl: image ? image[1] : null,
      posterUrl: poster?.url ?? (image ? image[1] : null),
      priceFrom: Number.isFinite(priceNum) ? priceNum : null,
    });
  }
  return { cityName: h1 ? text(h1[1]) : null, items, hasNext: /id="next_page"/.test(html) };
}

/** Описание события: без HTML, абзацы сохраняем, не длиннее 4000 символов. */
function cleanDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = decodeEntities(raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s ? s.slice(0, 4000) : null;
}

/** Страница события Qtickets: JSON-LD Event и возрастное ограничение. Null — разметки нет. */
export function parseQticketsEvent(html: string): QticketsEventDetails | null {
  let ev: any = null;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      for (const o of Array.isArray(data) ? data : [data]) {
        if (o && typeof o === 'object' && /Event$/.test(String(o['@type'] ?? ''))) { ev = o; break; }
      }
    } catch { /* битый блок — пропускаем */ }
    if (ev) break;
  }
  if (!ev) return null;
  const loc = ev.location ?? {};
  const addr = typeof loc.address === 'string'
    ? loc.address
    : [loc.address?.streetAddress, loc.address?.addressLocality].filter((x: unknown) => typeof x === 'string' && x).join(', ');
  const end = typeof ev.endDate === 'string' ? new Date(ev.endDate) : null;
  const offers = Array.isArray(ev.offers) ? ev.offers : ev.offers ? [ev.offers] : [];
  const prices = offers
    .map((o: any) => Number(o?.lowPrice ?? o?.price))
    .filter((n: number) => Number.isFinite(n) && n > 0);
  const age = /<span class="place"[^>]*>\s*(\d{1,2}\+)\s*<\/span>/.exec(html);
  const organizer = typeof ev.organizer?.name === 'string' ? text(ev.organizer.name) : '';
  const image = typeof ev.image === 'string' && /^https:\/\/cdn\.qtickets\.tech\//.test(ev.image) ? ev.image : null;
  return {
    description: cleanDescription(ev.description),
    address: addr ? text(addr).slice(0, 300) : null,
    endsAt: end && !Number.isNaN(end.getTime()) ? end : null,
    organizer: organizer ? organizer.slice(0, 200) : null,
    ageLimit: age ? age[1] : null,
    priceFrom: prices.length ? Math.min(...prices) : null,
    imageUrl: image,
  };
}

/** Подробности события по ссылке на его страницу (null — недоступно). */
export async function fetchQticketsEventDetails(url: string, timeoutMs = 20_000): Promise<QticketsEventDetails | null> {
  if (!/^https:\/\/[a-z0-9-]+\.qtickets\.events\//.test(url)) return null;
  const html = await fetchHtml(url, timeoutMs);
  return html ? parseQticketsEvent(html) : null;
}

/** Ссылка на событие с партнёрским кодом (env QTICKETS_PARTNER_QUERY), если он задан. */
export function qticketsTicketUrl(url: string): string {
  const q = (process.env.QTICKETS_PARTNER_QUERY || '').trim().replace(/^[?&]+/, '');
  if (!q) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${q}`;
}

// ─── Загрузка ─────────────────────────────────────────────────────────────────

async function fetchHtml(url: string, timeoutMs = 20_000): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch {
      /* повтор ниже */
    }
    await sleep(3000);
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CrawlOptions {
  /** Пауза между запросами — не нагружаем Qtickets. */
  delayMs?: number;
  /** Предел страниц ленты на город (по 9 событий на страницу). */
  maxPages?: number;
  /** Брать события не дальше стольких дней вперёд. */
  horizonDays?: number;
}

/** Города Qtickets (cityKey → поддомен) — с главной ленты одного города. */
export async function fetchQticketsCities(): Promise<Map<string, string>> {
  const html = await fetchHtml(`https://moscow.${SITE_ROOT}/`);
  return html ? parseQticketsCities(html) : new Map();
}

/**
 * Лента одного города целиком: музыкальные события в пределах горизонта.
 * complete=false — обход оборвался (ошибка или предел страниц): тогда вызывающий
 * не должен удалять «пропавшие» события этого города.
 */
export async function crawlQticketsCity(
  subdomain: string,
  opts: CrawlOptions = {},
): Promise<{ items: QticketsItem[]; complete: boolean; pages: number }> {
  const { delayMs = 1000, maxPages = 150, horizonDays = 120 } = opts;
  const horizon = Date.now() + horizonDays * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const items: QticketsItem[] = [];
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(delayMs);
    const html = await fetchHtml(`https://${subdomain}.${SITE_ROOT}/${page > 1 ? `?page=${page}` : ''}`);
    if (html === null) return { items, complete: false, pages: page };
    const parsed = parseQticketsListing(html);
    for (const it of parsed.items) {
      if (seen.has(it.externalId)) continue;
      seen.add(it.externalId);
      if (!QTICKETS_MUSIC_TYPES.has(it.type)) continue;
      const t = it.startsAt.getTime();
      if (t < Date.now() - 6 * 60 * 60 * 1000 || t > horizon) continue;
      items.push(it);
    }
    if (!parsed.hasNext) return { items, complete: true, pages: page };
  }
  return { items, complete: false, pages: maxPages };
}
