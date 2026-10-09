// Статистика визитки артиста (/artist/<slug> как «ссылка в био»).
//
// Только агрегаты за календарный день по МСК (ArtistPageStat): просмотры и
// переходы по ссылкам площадок/концертов. Никаких ПДн — IP, userId и User-Agent
// не сохраняются (IP живёт только в памяти лимитера частоты).
//
// Дедуп просмотров — на клиенте (один view на сессию вкладки на артиста,
// sessionStorage); боты/превью-краулеры отсекаются здесь по User-Agent.
import { prisma } from '../index';
import { parseCalendarDay } from './mskDate';

export type TrackEvent = 'view' | 'click';

/**
 * Белый список целей перехода (ключ в ArtistPageStat.clicks). Произвольные
 * строки не принимаем — иначе JSON дня раздувается мусорными ключами.
 * Зеркало: client/src/components/artist/linkPlatforms.ts (TRACK_TARGETS) —
 * держать в синхроне.
 */
export const TRACK_TARGETS: readonly string[] = [
  // Площадки «Слушать»
  'yandex_music', 'vk_music', 'zvuk', 'mts_music', 'apple_music', 'spotify',
  'soundcloud', 'deezer', 'bandcamp', 'bandlink',
  // Соцсети/сообщества
  'vk', 'telegram', 'ok', 'dzen', 'tenchat', 'rutube', 'website',
  // Карточки визитки
  'release', 'tickets',
];
const TARGET_SET = new Set(TRACK_TARGETS);

export function isTrackTarget(v: unknown): v is string {
  return typeof v === 'string' && TARGET_SET.has(v);
}

// Роботы поисковиков, превью ссылок мессенджеров/соцсетей, headless-браузеры и
// HTTP-клиенты. Пустой UA — тоже не человек с браузером.
const BOT_UA_RE = /bot|crawler|spider|crawl|preview|slurp|facebookexternalhit|vkshare|whatsapp|skypeuripreview|headless|lighthouse|pingdom|curl|wget|python-requests|httpclient|okhttp|axios|node-fetch|go-http-client|java\//i;

export function isBotUserAgent(ua: unknown): boolean {
  if (typeof ua !== 'string' || !ua.trim()) return true;
  return BOT_UA_RE.test(ua);
}

/** Календарный день по МСК → 'YYYY-MM-DD'. */
export function mskDayString(at: Date = new Date()): string {
  const d = parseCalendarDay(at)!;
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' ± n дней (календарно, без часовых поясов). */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

/**
 * +1 просмотр или +1 переход за сегодняшний день (МСК). Один атомарный
 * INSERT … ON CONFLICT: гонки параллельных запросов не теряют счёт.
 */
export async function recordArtistPageEvent(
  artistId: string,
  event: TrackEvent,
  target: string | null,
  at: Date = new Date(),
): Promise<void> {
  const day = mskDayString(at);
  if (event === 'view') {
    await prisma.$executeRaw`
      INSERT INTO "ArtistPageStat" ("artistId", "day", "views", "clicks", "updatedAt")
      VALUES (${artistId}, ${day}::date, 1, '{}'::jsonb, NOW())
      ON CONFLICT ("artistId", "day") DO UPDATE
        SET "views" = "ArtistPageStat"."views" + 1,
            "updatedAt" = NOW()`;
    return;
  }
  if (!target || !isTrackTarget(target)) return;
  await prisma.$executeRaw`
    INSERT INTO "ArtistPageStat" ("artistId", "day", "views", "clicks", "updatedAt")
    VALUES (${artistId}, ${day}::date, 0, jsonb_build_object(${target}::text, 1), NOW())
    ON CONFLICT ("artistId", "day") DO UPDATE
      SET "clicks" = jsonb_set(
            "ArtistPageStat"."clicks",
            ARRAY[${target}::text],
            to_jsonb(COALESCE(("ArtistPageStat"."clicks" ->> ${target}::text)::int, 0) + 1)
          ),
          "updatedAt" = NOW()`;
}

export const STATS_DEFAULT_DAYS = 30;
export const STATS_MAX_DAYS = 90;

export function parseStatsDays(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return STATS_DEFAULT_DAYS;
  return Math.min(n, STATS_MAX_DAYS);
}

export interface ArtistPageStatsResult {
  days: number;
  from: string;
  to: string;
  views: number;
  clicks: number;
  clicksByTarget: Array<{ target: string; count: number }>;
  series: Array<{ date: string; views: number; clicks: number }>;
}

function toCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Агрегаты за последние `days` дней (включая сегодня по МСК): итоги, переходы
 * по целям и ряд по дням (дни без данных — нули). Только числа — никаких ПДн.
 */
export async function getArtistPageStats(
  artistId: string,
  days: number,
  at: Date = new Date(),
): Promise<ArtistPageStatsResult> {
  const to = mskDayString(at);
  const from = shiftDay(to, -(days - 1));
  const rows = await prisma.artistPageStat.findMany({
    where: { artistId, day: { gte: new Date(`${from}T00:00:00.000Z`) } },
    select: { day: true, views: true, clicks: true },
    orderBy: { day: 'asc' },
  });

  const byDay = new Map<string, { views: number; clicks: number }>();
  const byTarget = new Map<string, number>();
  for (const r of rows as Array<{ day: Date | string; views: number; clicks: unknown }>) {
    const date = (r.day instanceof Date ? r.day.toISOString() : String(r.day)).slice(0, 10);
    if (date < from || date > to) continue;
    const acc = byDay.get(date) ?? { views: 0, clicks: 0 };
    acc.views += toCount(r.views);
    const clicks = r.clicks && typeof r.clicks === 'object' && !Array.isArray(r.clicks)
      ? (r.clicks as Record<string, unknown>)
      : {};
    for (const [target, raw] of Object.entries(clicks)) {
      // Только известные цели: старые/чужие ключи в выдачу не попадают.
      if (!isTrackTarget(target)) continue;
      const n = toCount(raw);
      if (!n) continue;
      acc.clicks += n;
      byTarget.set(target, (byTarget.get(target) ?? 0) + n);
    }
    byDay.set(date, acc);
  }

  const series: ArtistPageStatsResult['series'] = [];
  for (let i = 0; i < days; i++) {
    const date = shiftDay(from, i);
    const v = byDay.get(date);
    series.push({ date, views: v?.views ?? 0, clicks: v?.clicks ?? 0 });
  }
  const clicksByTarget = [...byTarget.entries()]
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count || TRACK_TARGETS.indexOf(a.target) - TRACK_TARGETS.indexOf(b.target));

  return {
    days,
    from,
    to,
    views: series.reduce((s, d) => s + d.views, 0),
    clicks: series.reduce((s, d) => s + d.clicks, 0),
    clicksByTarget,
    series,
  };
}
