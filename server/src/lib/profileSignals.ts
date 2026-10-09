/**
 * Сигналы профиля для витрины и каталога:
 *   - «Подтверждённый опыт» — кредиты из релизов/клипов: участие подтверждено
 *     (ReleaseParticipant/ClipParticipant.confirmStatus = ACCEPTED) и артист не
 *     REJECTED. Агрегат — двумя запросами (релизы, клипы; без N+1), кэш 10 минут;
 *   - мини-бейдж «12 релизов» и аудиодемо для карточек каталога — фиксированным
 *     числом запросов на страницу выдачи.
 *
 * Здесь только загрузка и подсчёт. Гостевые ответы собираются из этих данных
 * белыми списками в lib/publicData.ts (toPublicCredits, toPublicCatalogSignals).
 */

import { prisma } from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// Кредиты
// ─────────────────────────────────────────────────────────────────────────────

/** where участия, которое считается подтверждённым опытом. */
export const CREDITED_RELEASE_WHERE = {
  confirmStatus: 'ACCEPTED' as const,
  release: { artist: { status: { not: 'REJECTED' as const } } },
};
export const CREDITED_CLIP_WHERE = {
  confirmStatus: 'ACCEPTED' as const,
  clip: { artist: { status: { not: 'REJECTED' as const } } },
};

/** Защитный потолок строк на тип (реальные профили — десятки кредитов). */
export const CREDITS_FETCH_MAX = 1000;
/** Сколько последних релизов показывать сразу (остальное — «Все кредиты»). */
export const CREDITS_RECENT_RELEASES = 6;
export const CREDITS_TTL_MS = 10 * 60 * 1000;
const CREDITS_CACHE_MAX = 2000;

export interface CreditArtist {
  id: string;
  slug: string | null;
  name: string;
  avatar: string | null;
  listeners: number;
  credits: number;
}

export interface CreditItem {
  id: string;
  title: string;
  coverUrl: string | null;
  releaseDate: Date | null;
  artist: { id: string; slug: string | null; name: string };
  roles: string[];
}

export interface CreditsSummary {
  releasesCount: number;
  clipsCount: number;
  /** Уникальные артисты: по слушателям, затем по числу кредитов. */
  artists: CreditArtist[];
  /** Роли по частоте («Барабаны», «Аранжировка»…). */
  roles: string[];
  /** Сумма Artist.listeners по уникальным артистам (Яндекс Музыка, в месяц). */
  listenersTotal: number;
  /** Новые сверху (дата релиза, затем дата добавления). */
  releases: CreditItem[];
  clips: CreditItem[];
}

const ARTIST_SELECT = { select: { id: true, slug: true, name: true, avatar: true, listeners: true, status: true } } as const;
const PARTICIPANT_ROLES_SELECT = { select: { role: { select: { name: true } } } } as const;

function toNumber(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function time(d: unknown): number {
  if (!d) return NaN;
  const t = new Date(d as any).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Свести строки участия в сводку. Повторно фильтрует подтверждённость и
 * REJECTED в памяти (defense in depth — как в publicData).
 */
export function buildCreditsSummary(releaseRows: any[], clipRows: any[]): CreditsSummary {
  const artists = new Map<string, CreditArtist>();
  const roleCount = new Map<string, number>();
  const take = (row: any, kind: 'release' | 'clip'): CreditItem | null => {
    if ((row?.confirmStatus ?? 'ACCEPTED') !== 'ACCEPTED') return null;
    const media = row?.[kind];
    const a = media?.artist;
    if (!media?.id || !a?.id || a.status === 'REJECTED') return null;
    const prev = artists.get(a.id);
    if (prev) prev.credits++;
    else artists.set(a.id, {
      id: a.id, slug: a.slug ?? null, name: a.name ?? '', avatar: a.avatar ?? null, listeners: toNumber(a.listeners), credits: 1,
    });
    const roles: string[] = [];
    for (const r of row.roles ?? []) {
      const name = typeof r?.role?.name === 'string' ? r.role.name.trim() : '';
      if (!name || roles.includes(name)) continue;
      roles.push(name);
      roleCount.set(name, (roleCount.get(name) ?? 0) + 1);
    }
    return {
      id: media.id,
      title: media.title ?? '',
      coverUrl: media.coverUrl ?? null,
      releaseDate: kind === 'release' ? (media.releaseDate ?? null) : null,
      artist: { id: a.id, slug: a.slug ?? null, name: a.name ?? '' },
      roles,
      // служебное для сортировки — срезается ниже
      _sortAt: time(media.releaseDate) || time(media.createdAt) || 0,
      _createdAt: time(media.createdAt) || 0,
    } as CreditItem & { _sortAt: number; _createdAt: number };
  };
  const byNewest = (x: any, y: any) => (y._sortAt - x._sortAt) || (y._createdAt - x._createdAt);
  const strip = ({ _sortAt, _createdAt, ...item }: any): CreditItem => item;

  const seenReleases = new Set<string>();
  const releases = releaseRows.map((r) => take(r, 'release')).filter((x): x is CreditItem => {
    if (!x || seenReleases.has(x.id)) return false;
    seenReleases.add(x.id);
    return true;
  });
  const seenClips = new Set<string>();
  const clips = clipRows.map((c) => take(c, 'clip')).filter((x): x is CreditItem => {
    if (!x || seenClips.has(x.id)) return false;
    seenClips.add(x.id);
    return true;
  });
  releases.sort(byNewest);
  clips.sort(byNewest);

  const artistList = [...artists.values()].sort((a, b) => (b.listeners - a.listeners) || (b.credits - a.credits) || a.name.localeCompare(b.name, 'ru'));
  const roles = [...roleCount.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'ru')).map(([name]) => name);
  return {
    releasesCount: releases.length,
    clipsCount: clips.length,
    artists: artistList,
    roles,
    listenersTotal: artistList.reduce((s, a) => s + (a.listeners > 0 ? a.listeners : 0), 0),
    releases: releases.map(strip),
    clips: clips.map(strip),
  };
}

const creditsCache = new Map<string, { at: number; data: CreditsSummary }>();

export function clearCreditsCache(): void {
  creditsCache.clear();
}

/** Сводка «Подтверждённый опыт» пользователя (кэш 10 минут). */
export async function getCreditsSummary(userId: string, nowMs: number = Date.now()): Promise<CreditsSummary> {
  const key = String(userId ?? '');
  const hit = creditsCache.get(key);
  if (hit && nowMs - hit.at < CREDITS_TTL_MS) return hit.data;
  const [releaseRows, clipRows] = key
    ? await Promise.all([
        prisma.releaseParticipant.findMany({
          where: { userId: key, ...CREDITED_RELEASE_WHERE },
          select: {
            confirmStatus: true,
            roles: PARTICIPANT_ROLES_SELECT,
            release: {
              select: { id: true, title: true, coverUrl: true, releaseDate: true, createdAt: true, artist: ARTIST_SELECT },
            },
          },
          take: CREDITS_FETCH_MAX,
        }),
        prisma.clipParticipant.findMany({
          where: { userId: key, ...CREDITED_CLIP_WHERE },
          select: {
            confirmStatus: true,
            roles: PARTICIPANT_ROLES_SELECT,
            clip: { select: { id: true, title: true, coverUrl: true, createdAt: true, artist: ARTIST_SELECT } },
          },
          take: CREDITS_FETCH_MAX,
        }),
      ])
    : [[], []];
  const data = buildCreditsSummary(releaseRows ?? [], clipRows ?? []);
  if (creditsCache.size >= CREDITS_CACHE_MAX) creditsCache.clear();
  creditsCache.set(key, { at: nowMs, data });
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Каталог: мини-бейдж релизов и аудиодемо
// ─────────────────────────────────────────────────────────────────────────────

export interface PortfolioDemo {
  url: string;
  title: string;
}

export interface CatalogExtra {
  releasesCount: number;
  demo: PortfolioDemo | null;
}

/** Только наши загрузки: /uploads/<путь> без «..» и посторонних символов. */
export function isUploadsPath(u: unknown): u is string {
  return typeof u === 'string' && /^\/uploads\/[\w\-./]+$/.test(u) && !u.includes('..') && !u.includes('//');
}

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;

/**
 * Первое аудио портфолио для проигрывания в выдаче: файл audio/* (по порядку
 * портфолио), иначе ссылка type='audio' — только если это прямой аудиофайл на
 * /uploads/ (стриминги и внешние ссылки не проигрываем). Документы — никогда.
 */
export function pickPortfolioDemo(
  files: Array<{ url?: string | null; mimeType?: string | null; title?: string | null; originalName?: string | null }>,
  links: Array<{ url?: string | null; type?: string | null; title?: string | null }> = [],
): PortfolioDemo | null {
  for (const f of files ?? []) {
    if (typeof f?.mimeType !== 'string' || !f.mimeType.toLowerCase().startsWith('audio/')) continue;
    if (!isUploadsPath(f.url)) continue;
    const title = String(f.title ?? '').trim() || String(f.originalName ?? '').trim() || 'Демо';
    return { url: f.url, title: title.slice(0, 200) };
  }
  for (const l of links ?? []) {
    if (l?.type !== 'audio' || !isUploadsPath(l.url) || !AUDIO_EXT_RE.test(l.url)) continue;
    return { url: l.url, title: (String(l.title ?? '').trim() || 'Демо').slice(0, 200) };
  }
  return null;
}

/**
 * Сигналы для страницы каталога: число подтверждённых релизов (groupBy) и демо
 * (первое аудио портфолио) — три запроса на всю страницу.
 */
export async function loadCatalogExtras(userIds: string[]): Promise<Map<string, CatalogExtra>> {
  const ids = [...new Set((userIds ?? []).filter((x) => typeof x === 'string' && x))];
  const out = new Map<string, CatalogExtra>();
  if (ids.length === 0) return out;
  const [counts, files, links] = await Promise.all([
    prisma.releaseParticipant.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, ...CREDITED_RELEASE_WHERE },
      _count: { _all: true },
    }),
    prisma.portfolioFile.findMany({
      where: { userId: { in: ids }, mimeType: { startsWith: 'audio/' } },
      select: { userId: true, url: true, title: true, originalName: true, mimeType: true, sortOrder: true, createdAt: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.portfolioLink.findMany({
      where: { userId: { in: ids }, type: 'audio', url: { startsWith: '/uploads/' } },
      select: { userId: true, url: true, type: true, title: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const countBy = new Map<string, number>();
  for (const c of (counts ?? []) as any[]) countBy.set(c.userId, Number(c._count?._all ?? 0));
  const filesBy = new Map<string, any[]>();
  for (const f of (files ?? []) as any[]) {
    if (!filesBy.has(f.userId)) filesBy.set(f.userId, []);
    filesBy.get(f.userId)!.push(f);
  }
  const linksBy = new Map<string, any[]>();
  for (const l of (links ?? []) as any[]) {
    if (!linksBy.has(l.userId)) linksBy.set(l.userId, []);
    linksBy.get(l.userId)!.push(l);
  }
  for (const id of ids) {
    const fl = (filesBy.get(id) ?? []).slice().sort((a, b) => ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || (time(a.createdAt) - time(b.createdAt)) || 0);
    out.set(id, {
      releasesCount: countBy.get(id) ?? 0,
      demo: pickPortfolioDemo(fl, linksBy.get(id) ?? []),
    });
  }
  return out;
}
