// «Сцена» — концерты по городам (model Concert).
//
// Источники и запись:
//  - YANDEX_MUSIC — syncYmConcerts из синка ЯМ (utils/yandexMusicSync) и
//    backfillYmConcerts при старте (из уже сохранённой витрины ymData);
//  - MANUAL — routes/scene.ts (админ артиста добавляет выступление);
//  - QTICKETS — runQticketsImport: ночной импорт афиши (lib/qtickets).
// После записи — notifyNewConcerts: push подписчикам артиста из того же города.
//
// На «Сцене» показываются концерты без артиста Moooza (афиша) и концерты
// проверенных артистов; концерты непроверенной карточки видны только на ней самой.
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { notify } from '../utils/notify';
import { tgLog } from '../utils/telegram';
import logger from '../utils/logger';
import { slugifyArtistName } from './artistSlug';
import { cityKey, crawlQticketsCity, fetchQticketsCities, isoOffsetMinutes, qticketsTicketUrl, type QticketsItem } from './qtickets';

export type ConcertSource = 'YANDEX_MUSIC' | 'MANUAL' | 'QTICKETS';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MSK_OFFSET = 3 * HOUR;
/** Концерт ещё показываем пару часов после начала — «идёт сейчас». */
const ONGOING_MS = 3 * HOUR;
/** Горизонт «Сцены»: дальше не показываем и не индексируем. */
export const SCENE_HORIZON_DAYS = 120;

const VISIBLE_ARTIST_STATUSES = ['VERIFIED', 'APPROVED'];

export function citySlug(cityName: string): string {
  return slugifyArtistName(cityKey(cityName)) || 'city';
}

const str = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const httpLink = (v: unknown) => (typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim().slice(0, 1000) : null);

// ─── Периоды (по Москве) ─────────────────────────────────────────────────────

export const SCENE_PERIODS = ['today', 'weekend', 'week', 'month', 'all'] as const;
export type ScenePeriod = (typeof SCENE_PERIODS)[number];

/** Начало суток по Москве (epoch ms) для момента t. */
function mskDayStart(t: number): number {
  const shifted = new Date(t + MSK_OFFSET);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - MSK_OFFSET;
}

/** Окно выборки для периода: «сегодня», «выходные» (сб–вс), неделя, месяц, всё. */
export function periodRange(period: ScenePeriod, now = new Date()): { from: Date; to: Date } {
  const t = now.getTime();
  const from = new Date(t - ONGOING_MS);
  const today = mskDayStart(t);
  switch (period) {
    case 'today':
      return { from, to: new Date(today + DAY) };
    case 'weekend': {
      const dow = new Date(t + MSK_OFFSET).getUTCDay(); // 0 — вс, 6 — сб
      if (dow === 6) return { from, to: new Date(today + 2 * DAY) };
      if (dow === 0) return { from, to: new Date(today + DAY) };
      const sat = today + (6 - dow) * DAY;
      return { from: new Date(sat), to: new Date(sat + 2 * DAY) };
    }
    case 'week':
      return { from, to: new Date(t + 7 * DAY) };
    case 'month':
      return { from, to: new Date(t + 30 * DAY) };
    default:
      return { from, to: new Date(t + SCENE_HORIZON_DAYS * DAY) };
  }
}

const MSK_OFFSET_MIN = 180;

/** «13 ноября, 19:00» по местному времени города (без пояса — по Москве; без времени — только дата). */
export function formatConcertLocal(startsAt: Date, hasTime: boolean, utcOffsetMin: number | null = null): string {
  const local = new Date(startsAt.getTime() + (utcOffsetMin ?? MSK_OFFSET_MIN) * 60_000);
  const date = local.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  if (!hasTime) return date;
  const time = local.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `${date}, ${time}`;
}

/** ISO с местным поясом города: «2026-11-13T19:00:00+04:00» (JSON-LD, клиент). */
export function localIso(startsAt: Date, utcOffsetMin: number | null): string {
  const off = utcOffsetMin ?? MSK_OFFSET_MIN;
  const local = new Date(startsAt.getTime() + off * 60_000).toISOString().slice(0, 19);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/**
 * Пояс города для концерта, добавленного вручную: по уже известным концертам
 * этого города (Qtickets/ЯМ приносят время с поясом), иначе — Москва.
 */
export async function cityUtcOffset(key: string): Promise<number> {
  const known = await prisma.concert.findFirst({
    where: { cityKey: key, utcOffsetMin: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { utcOffsetMin: true },
  });
  return known?.utcOffsetMin ?? MSK_OFFSET_MIN;
}

// ─── Выдача ──────────────────────────────────────────────────────────────────

const CONCERT_SELECT = {
  id: true, source: true, title: true, type: true, startsAt: true, hasTime: true, utcOffsetMin: true,
  cityName: true, cityKey: true, venue: true, address: true, url: true, ticketUrl: true,
  imageUrl: true, priceFrom: true, artistId: true,
  artist: { select: { id: true, slug: true, name: true, avatar: true, status: true } },
} satisfies Prisma.ConcertSelect;

type ConcertRow = Prisma.ConcertGetPayload<{ select: typeof CONCERT_SELECT }>;

export interface ConcertDTO {
  id: string;
  source: ConcertSource;
  title: string;
  type: string | null;
  /** ISO с местным поясом города («…T19:00:00+04:00»). */
  startsAt: string;
  hasTime: boolean;
  /** Смещение местного времени города от UTC, минут (по умолчанию — Москва). */
  utcOffsetMin: number;
  cityName: string;
  citySlug: string;
  venue: string | null;
  address: string | null;
  url: string | null;
  ticketUrl: string | null;
  imageUrl: string | null;
  priceFrom: number | null;
  artist: { id: string; slug: string | null; name: string; avatar: string | null; verified: boolean } | null;
}

export function serializeConcert(c: ConcertRow): ConcertDTO {
  const ticket = c.ticketUrl ?? c.url;
  return {
    id: c.id,
    source: c.source as ConcertSource,
    title: c.title,
    type: c.type,
    startsAt: localIso(c.startsAt, c.utcOffsetMin),
    hasTime: c.hasTime,
    utcOffsetMin: c.utcOffsetMin ?? MSK_OFFSET_MIN,
    cityName: c.cityName,
    citySlug: citySlug(c.cityName),
    venue: c.venue,
    address: c.address,
    url: c.url,
    // Партнёрский код Qtickets — при выдаче: смена env действует сразу.
    ticketUrl: ticket && c.source === 'QTICKETS' ? qticketsTicketUrl(ticket) : ticket,
    imageUrl: c.imageUrl,
    priceFrom: c.priceFrom,
    artist: c.artist
      ? {
          id: c.artist.id, slug: c.artist.slug ?? null, name: c.artist.name, avatar: c.artist.avatar ?? null,
          verified: VISIBLE_ARTIST_STATUSES.includes(c.artist.status),
        }
      : null,
  };
}

/** Видимость на «Сцене»: афиша без артиста или проверенный артист. */
const sceneVisible: Prisma.ConcertWhereInput = {
  OR: [{ artistId: null }, { artist: { status: { in: VISIBLE_ARTIST_STATUSES as any } } }],
};

/** Источник, который показываем при дубле одного выступления (у Qtickets — картинка и цена). */
const SOURCE_RANK: Record<string, number> = { QTICKETS: 0, MANUAL: 1, YANDEX_MUSIC: 2 };

/**
 * Один концерт артиста может прийти из нескольких источников (ЯМ + Qtickets).
 * Оставляем по одному на артист+город+день (по Москве), предпочитая Qtickets.
 */
export function dedupeConcerts<T extends { artistId: string | null; cityKey: string; startsAt: Date; source: string }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r.artistId) { out.push(r); continue; }
    const key = `${r.artistId}|${r.cityKey}|${mskDayStart(r.startsAt.getTime())}`;
    const prev = best.get(key);
    if (!prev) { best.set(key, r); out.push(r); continue; }
    if ((SOURCE_RANK[r.source] ?? 9) < (SOURCE_RANK[prev.source] ?? 9)) {
      out[out.indexOf(prev)] = r;
      best.set(key, r);
    }
  }
  return out;
}

export interface SceneCity { slug: string; name: string; upcoming: number }

/** Города с предстоящими концертами (для выбора города, /scene и sitemap). */
export async function listSceneCities(now = new Date()): Promise<SceneCity[]> {
  const { from, to } = periodRange('all', now);
  const groups = await prisma.concert.groupBy({
    by: ['cityKey', 'cityName'],
    where: { AND: [sceneVisible, { startsAt: { gte: from, lt: to } }] },
    _count: { _all: true },
  });
  // Каноническое написание — из каталога городов («Орёл», а не «Орел»); варианты
  // написания одного города (ключ одинаковый) складываем.
  const catalog = await prisma.city.findMany({ select: { name: true } });
  const canonical = new Map(catalog.map((c) => [cityKey(c.name), c.name]));
  const byKey = new Map<string, { name: string; n: number }>();
  for (const g of groups) {
    const prev = byKey.get(g.cityKey);
    const name = canonical.get(g.cityKey) ?? prev?.name ?? g.cityName;
    byKey.set(g.cityKey, { name, n: (prev?.n ?? 0) + g._count._all });
  }
  return [...byKey.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'))
    .map((c) => ({ slug: citySlug(c.name), name: c.name, upcoming: c.n }));
}

/** Город по слагу: среди городов с концертами и каталога. null — нет такого. */
export async function resolveSceneCity(slug: string, now = new Date()): Promise<{ slug: string; name: string; key: string } | null> {
  const withConcerts = await listSceneCities(now);
  const hit = withConcerts.find((c) => c.slug === slug);
  if (hit) return { slug: hit.slug, name: hit.name, key: cityKey(hit.name) };
  const catalog = await prisma.city.findMany({ select: { name: true } });
  const c = catalog.find((x) => citySlug(x.name) === slug);
  return c ? { slug, name: c.name, key: cityKey(c.name) } : null;
}

/** Концерты для «Сцены»: город (ключ) или вся страна, период, страница. */
export async function listSceneConcerts(opts: {
  cityKey?: string | null; period?: ScenePeriod; page?: number; limit?: number; now?: Date;
}): Promise<{ items: ConcertDTO[]; page: number; hasMore: boolean; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const { from, to } = periodRange(opts.period ?? 'all', opts.now);
  const where: Prisma.ConcertWhereInput = {
    AND: [sceneVisible, { startsAt: { gte: from, lt: to } }, ...(opts.cityKey ? [{ cityKey: opts.cityKey }] : [])],
  };
  const [rows, total] = await Promise.all([
    prisma.concert.findMany({
      where, select: CONCERT_SELECT, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit, take: limit + 1,
    }),
    prisma.concert.count({ where }),
  ]);
  const hasMore = rows.length > limit;
  return { items: dedupeConcerts(rows.slice(0, limit)).map(serializeConcert), page, hasMore, total };
}

/** Предстоящие концерты артиста (визитка) — все источники, без фильтра видимости. */
export async function listArtistConcerts(artistId: string, now = new Date()): Promise<ConcertDTO[]> {
  const rows = await prisma.concert.findMany({
    where: { artistId, startsAt: { gte: new Date(now.getTime() - ONGOING_MS), lt: new Date(now.getTime() + 365 * DAY) } },
    select: CONCERT_SELECT,
    orderBy: { startsAt: 'asc' },
    take: 30,
  });
  return dedupeConcerts(rows).map(serializeConcert);
}

/** sitemap-scene.xml: хаб /scene и города с предстоящими концертами. */
export async function listSitemapScene(): Promise<{ path: string; lastmod: Date | null }[]> {
  const cities = await listSceneCities();
  if (!cities.length) return [];
  return [{ path: '/scene', lastmod: null }, ...cities.map((c) => ({ path: `/scene/${c.slug}`, lastmod: null }))];
}

// ─── Яндекс Музыка ───────────────────────────────────────────────────────────

/** Начало концерта из витрины ЯМ: datetime с поясом или только дата (полдень МСК). */
export function ymConcertStart(c: any): { startsAt: Date; hasTime: boolean; utcOffsetMin: number | null } | null {
  if (typeof c?.datetime === 'string') {
    const d = new Date(c.datetime);
    if (!Number.isNaN(d.getTime())) return { startsAt: d, hasTime: true, utcOffsetMin: isoOffsetMinutes(c.datetime) };
  }
  if (typeof c?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(c.date)) {
    const d = new Date(`${c.date.slice(0, 10)}T12:00:00+03:00`);
    if (!Number.isNaN(d.getTime())) return { startsAt: d, hasTime: false, utcOffsetMin: null };
  }
  return null;
}

/**
 * Концерты из витрины ЯМ (ymData.concerts) → Concert. Пропавшие из ЯМ будущие
 * концерты артиста (отмена, перенос) удаляются. Возвращает число новых.
 */
export async function syncYmConcerts(artist: { id: string; name: string }, concerts: unknown, now = new Date()): Promise<number> {
  const list: any[] = Array.isArray(concerts) ? concerts : [];
  const keep: string[] = [];
  let created = 0;
  for (const c of list) {
    const when = ymConcertStart(c);
    const city = str(c?.city, 120);
    if (!when || !city) continue;
    const key = cityKey(city);
    const externalId = crypto.createHash('sha1')
      .update(`${artist.id}|${when.startsAt.toISOString()}|${key}`).digest('hex').slice(0, 24);
    if (keep.includes(externalId)) continue;
    keep.push(externalId);
    const link = httpLink(c?.afishaUrl) ?? httpLink(c?.url);
    const data = {
      artistId: artist.id,
      title: str(c?.concertTitle) ?? str(c?.title) ?? artist.name,
      type: 'Концерт',
      startsAt: when.startsAt,
      hasTime: when.hasTime,
      utcOffsetMin: when.utcOffsetMin,
      cityName: city,
      cityKey: key,
      venue: str(c?.place),
      address: str(c?.address),
      url: link,
      ticketUrl: link,
    };
    const existing = await prisma.concert.findUnique({
      where: { source_externalId: { source: 'YANDEX_MUSIC', externalId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.concert.update({ where: { id: existing.id }, data });
    } else {
      try {
        await prisma.concert.create({ data: { ...data, source: 'YANDEX_MUSIC', externalId } });
        created++;
      } catch (e) {
        // Параллельный прогон уже создал — не ошибка.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
  }
  await prisma.concert.deleteMany({
    where: { source: 'YANDEX_MUSIC', artistId: artist.id, startsAt: { gte: now }, externalId: { notIn: keep } },
  });
  return created;
}

/** При старте: концерты из уже сохранённых витрин ЯМ (идемпотентно). */
export async function backfillYmConcerts(): Promise<number> {
  const artists = await prisma.artist.findMany({
    where: { ymData: { not: Prisma.AnyNull } },
    select: { id: true, name: true, ymData: true },
  });
  let created = 0;
  for (const a of artists) {
    created += await syncYmConcerts(a, (a.ymData as any)?.concerts);
  }
  if (created > 0) await notifyNewConcerts();
  return created;
}

// ─── Push подписчикам ────────────────────────────────────────────────────────

/**
 * Новые концерты артистов → push подписчикам артиста из того же города
 * (User.cityNorm = ключ города). Каждый концерт — один раз (notifiedAt).
 */
export async function notifyNewConcerts(now = new Date(), limit = 200): Promise<number> {
  const rows = await prisma.concert.findMany({
    where: { artistId: { not: null }, notifiedAt: null, startsAt: { gt: now } },
    select: {
      id: true, artistId: true, startsAt: true, hasTime: true, utcOffsetMin: true, cityName: true, cityKey: true, venue: true,
      artist: { select: { name: true } },
    },
    orderBy: { startsAt: 'asc' },
    take: limit,
  });
  let sent = 0;
  const notifiedToday = new Set<string>();
  for (const c of rows) {
    // «Захват» концерта: параллельный прогон не отправит его второй раз.
    const claim = await prisma.concert.updateMany({ where: { id: c.id, notifiedAt: null }, data: { notifiedAt: now } });
    if (!claim.count || !c.artistId || !c.artist) continue;
    // Тот же концерт из другого источника (ЯМ + Qtickets) — второй push не нужен.
    const day = mskDayStart(c.startsAt.getTime());
    const dupKey = `${c.artistId}|${c.cityKey}|${day}`;
    if (notifiedToday.has(dupKey)) continue;
    notifiedToday.add(dupKey);
    const twin = await prisma.concert.count({
      where: {
        id: { not: c.id }, artistId: c.artistId, cityKey: c.cityKey, notifiedAt: { not: null, lt: now },
        startsAt: { gte: new Date(day), lt: new Date(day + DAY) },
      },
    });
    if (twin > 0) continue;

    const followers = await prisma.artistFollower.findMany({
      where: { artistId: c.artistId, user: { cityNorm: c.cityKey } },
      select: { userId: true },
    });
    for (const f of followers) {
      await notify({
        userId: f.userId,
        type: 'scene_concert',
        title: `${c.artist.name}: концерт в ${c.cityName}`,
        body: [formatConcertLocal(c.startsAt, c.hasTime, c.utcOffsetMin), c.venue].filter(Boolean).join(' · '),
        link: `/artist/${c.artistId}`,
      });
      sent++;
    }
  }
  return sent;
}

// ─── Qtickets ────────────────────────────────────────────────────────────────

/** Ключ сравнения названий: регистр, ё, кавычки и лишние пробелы не важны. */
export function normName(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”„'’]/g, '').replace(/\s+/g, ' ').trim();
}

/** Проверенные артисты по названию (неоднозначные и короче 3 символов — не сопоставляем). */
export async function verifiedArtistNameIndex(): Promise<Map<string, string>> {
  const rows = await prisma.artist.findMany({
    where: { status: { in: VISIBLE_ARTIST_STATUSES as any } },
    select: { id: true, name: true },
  });
  const index = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const r of rows) {
    const k = normName(r.name);
    if (k.length < 3) continue;
    if (index.has(k)) ambiguous.add(k);
    else index.set(k, r.id);
  }
  for (const k of ambiguous) index.delete(k);
  return index;
}

/**
 * Артист Moooza для события афиши: точное совпадение названия события или его
 * части до « - », « — », « | », «:» или скобки («Полумягкие | 10 октября Самара»).
 */
export function matchArtist(title: string, index: Map<string, string>): string | null {
  const t = normName(title);
  const candidates = [t, t.split(/\s[-—–|:]\s|:\s/)[0], t.split(/\s*[([]/)[0]];
  for (const c of candidates) {
    const id = index.get(c.trim());
    if (id) return id;
  }
  return null;
}

/**
 * Сохранить ленту одного города. complete=false (обход оборвался) — пропавшие
 * события НЕ удаляем: иначе сбой сети стёр бы афишу города.
 */
export async function saveQticketsCity(
  cityName: string, items: QticketsItem[], complete: boolean, artistIndex: Map<string, string>, now = new Date(),
): Promise<{ created: number; updated: number; removed: number; matched: number }> {
  const key = cityKey(cityName);
  let created = 0;
  let updated = 0;
  let matched = 0;
  for (const it of items) {
    const artistId = matchArtist(it.title, artistIndex);
    if (artistId) matched++;
    const data = {
      artistId, title: it.title, type: it.type, startsAt: it.startsAt, hasTime: true, utcOffsetMin: it.utcOffsetMin,
      cityName, cityKey: key, venue: it.venue, url: it.url, ticketUrl: it.url,
      imageUrl: it.imageUrl, priceFrom: it.priceFrom,
    };
    const existing = await prisma.concert.findUnique({
      where: { source_externalId: { source: 'QTICKETS', externalId: it.externalId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.concert.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      try {
        await prisma.concert.create({ data: { ...data, source: 'QTICKETS', externalId: it.externalId } });
        created++;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
  }
  let removed = 0;
  if (complete) {
    const r = await prisma.concert.deleteMany({
      where: {
        source: 'QTICKETS', cityKey: key, startsAt: { gte: new Date(now.getTime() - ONGOING_MS) },
        externalId: { notIn: items.map((i) => i.externalId) },
      },
    });
    removed = r.count;
  }
  return { created, updated, removed, matched };
}

let qticketsRunning = false;

/**
 * Импорт афиши Qtickets по городам нашего каталога. cities — только эти города
 * (ручной запуск/проверка). Возвращает итог или null, если прогон уже идёт.
 */
export async function runQticketsImport(opts: { cities?: string[]; delayMs?: number; maxPages?: number } = {}) {
  if (qticketsRunning) return null;
  qticketsRunning = true;
  const started = Date.now();
  const summary = { cities: 0, events: 0, created: 0, removed: 0, matched: 0, incomplete: 0 };
  try {
    const qtCities = await fetchQticketsCities();
    if (qtCities.size === 0) {
      logger.warn('[scene] Qtickets: список городов пуст — вёрстка изменилась или сайт недоступен');
      return summary;
    }
    const only = opts.cities?.length ? new Set(opts.cities.map(cityKey)) : null;
    const catalog = await prisma.city.findMany({ select: { name: true }, orderBy: { sortOrder: 'asc' } });
    const targets = catalog.filter((c) => qtCities.has(cityKey(c.name)) && (!only || only.has(cityKey(c.name))));
    const artistIndex = await verifiedArtistNameIndex();
    const delayMs = opts.delayMs ?? 1000;
    for (const city of targets) {
      try {
        const crawl = await crawlQticketsCity(qtCities.get(cityKey(city.name))!, { delayMs, maxPages: opts.maxPages });
        const r = await saveQticketsCity(city.name, crawl.items, crawl.complete, artistIndex);
        summary.cities++;
        summary.events += crawl.items.length;
        summary.created += r.created;
        summary.removed += r.removed;
        summary.matched += r.matched;
        if (!crawl.complete) summary.incomplete++;
      } catch (e: any) {
        summary.incomplete++;
        logger.warn(`[scene] Qtickets: город ${city.name} не загружен: ${e?.message}`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    await notifyNewConcerts();
    const secs = Math.round((Date.now() - started) / 1000);
    const line = `🎫 Афиша Qtickets: городов ${summary.cities}, событий ${summary.events} (новых ${summary.created}, `
      + `снято ${summary.removed}), артистов Moooza ${summary.matched}, не до конца ${summary.incomplete} (${secs}с)`;
    logger.info(`[scene] ${line}`);
    void tgLog(line);
    return summary;
  } finally {
    qticketsRunning = false;
  }
}

/** Ночной импорт — 05:30 МСК (после синка ЯМ в 04:30). Включается env QTICKETS_IMPORT=true. */
export function scheduleQticketsImport(): void {
  if (process.env.QTICKETS_IMPORT !== 'true') {
    logger.info('[scene] Qtickets import disabled (QTICKETS_IMPORT != true)');
    return;
  }
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(2, 30, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    setTimeout(async () => {
      try { await runQticketsImport(); } catch (e: any) { logger.error(`[scene] Qtickets import failed: ${e?.message}`); }
      schedule();
    }, next.getTime() - now.getTime());
  };
  schedule();
}
