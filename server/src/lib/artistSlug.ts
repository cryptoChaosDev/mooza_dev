/**
 * Человекочитаемые адреса артистов: /artist/:slug (Ф4, решение владельца 2026-10-09).
 *
 *   - slugifyArtistName — транслитерация имени (кириллица → латиница по
 *     «яндексовой» схеме: ж=zh, х=kh, ц=ts, ч=ch, ш=sh, щ=shch, ю=yu, я=ya,
 *     й/ы=y, ъ/ь — пусто, ё=e; латинская диакритика снимается), нижний регистр,
 *     только [a-z0-9-], дефисы схлопнуты, не длиннее 80. Та же схема — в SQL-
 *     миграции 20261011010000_seo_artist_slug (разовое заполнение существующих).
 *   - Дубли — суффикс -2, -3, …; зарезервированные слова (подмаршруты
 *     /artist/:id/… клиента и GET-маршруты /api/artists/<слово>) и UUID-подобные
 *     строки не выдаются; слаги из ArtistSlugHistory другим артистам не выдаются.
 *   - Prisma-middleware (artistSlugMiddleware): слаг назначается при create и
 *     пересчитывается при смене name, ТОЛЬКО если артист не VERIFIED (у
 *     верифицированных имя заблокировано, а адрес — стабилен). Прежний слаг
 *     сохраняется в ArtistSlugHistory → 301 со старого адреса.
 *   - backfillArtistSlugs — страховка при старте api: слаг тем, у кого его нет
 *     (основное заполнение делает миграция).
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../index';

export const ARTIST_SLUG_MAX = 80;

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // украинские / белорусские
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u',
};

/** Латиница, которая не раскладывается NFKD на «букву + диакритику». */
const LATIN_SPECIAL: Record<string, string> = {
  ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', ð: 'd', ı: 'i',
};

/**
 * Зарезервированные слаги: сегменты маршрутов артиста в client/src/App.tsx
 * (/artist/create, /artist/:id/{edit,releases/new,clips/new,vacancies/new,
 * members/add,invite,contacts,genres}) и GET-маршруты /api/artists/<слово>,
 * объявленные раньше /:id (suggest, following, check-name, my-invites,
 * join-requests) — иначе такой артист был бы недостижим. Список повторён в
 * SQL-миграции 20261011010000_seo_artist_slug.
 */
export const RESERVED_ARTIST_SLUGS: ReadonlySet<string> = new Set([
  'add', 'admin', 'admins', 'api', 'artist', 'artists', 'avatar', 'banner',
  'check-name', 'clips', 'contacts', 'create', 'edit', 'follow', 'following',
  'genres', 'groups', 'invite', 'invite-link', 'invites', 'join', 'join-request',
  'join-requests', 'members', 'memberships', 'my-invites', 'new', 'null',
  'releases', 'search', 'settings', 'suggest', 'undefined', 'vacancies',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Строка похожа на слаг (формат, без проверки существования). */
export function isSlugLike(value: unknown): boolean {
  return typeof value === 'string' && value.length <= ARTIST_SLUG_MAX && SLUG_RE.test(value);
}

function clipSlug(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/-+$/, '');
}

/** Транслитерация имени в слаг (может вернуть '' — для имён без букв/цифр). */
export function slugifyArtistName(name: unknown): string {
  const lower = String(name ?? '').normalize('NFC').toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (ch in CYRILLIC) out += CYRILLIC[ch];
    else if (ch in LATIN_SPECIAL) out += LATIN_SPECIAL[ch];
    else out += ch;
  }
  // NFD (каноническое разложение) снимает диакритику: é → e. Не NFKD: оно
  // «расшифровывает» № → No, ™ → TM и т.п., а SQL-миграция так не делает.
  out = out
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // диакритика
    .toLowerCase()
    .replace(/['’ʼ`]/g, '') // апострофы: rock'n'roll → rocknroll
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clipSlug(out, ARTIST_SLUG_MAX);
}

/** Базовый слаг: транслит или 'artist', если в имени нет латиницы/кириллицы/цифр. */
export function baseArtistSlug(name: unknown): string {
  return slugifyArtistName(name) || 'artist';
}

/** Кандидат с суффиксом: n=1 → base, n≥2 → base-n (база укорачивается до ≤ 80 всего). */
export function slugCandidate(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = `-${n}`;
  return `${clipSlug(base, ARTIST_SLUG_MAX - suffix.length)}${suffix}`;
}

/** Слаг нельзя выдать никому: зарезервирован или похож на UUID. */
export function isBlockedSlug(slug: string): boolean {
  return RESERVED_ARTIST_SLUGS.has(slug) || isUuid(slug);
}

/**
 * Свободный слаг для имени. `artistId` — свой артист (его текущий слаг и его
 * собственные слаги из истории считаются свободными: переименование обратно
 * возвращает прежний адрес).
 */
export async function generateUniqueArtistSlug(name: unknown, artistId?: string | null): Promise<string> {
  const base = baseArtistSlug(name);
  // Все занятые слаги с тем же началом — одним запросом на таблицу.
  const stem = clipSlug(base, ARTIST_SLUG_MAX - 6);
  const [artists, history] = await Promise.all([
    prisma.artist.findMany({ where: { slug: { startsWith: stem } }, select: { id: true, slug: true } }),
    prisma.artistSlugHistory.findMany({ where: { slug: { startsWith: stem } }, select: { artistId: true, slug: true } }),
  ]);
  const taken = new Set<string>();
  for (const a of artists ?? []) if (a?.slug && a.id !== artistId) taken.add(a.slug);
  for (const h of history ?? []) if (h?.slug && h.artistId !== artistId) taken.add(h.slug);
  for (let n = 1; n <= 10_000; n++) {
    const cand = slugCandidate(base, n);
    if (!isBlockedSlug(cand) && !taken.has(cand)) return cand;
  }
  // Практически недостижимо: 10 000 одноимённых артистов.
  return slugCandidate(base, 10_001 + Math.floor(Math.random() * 1_000_000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Поиск артиста по uuid или слагу
// ─────────────────────────────────────────────────────────────────────────────

/**
 * where для findUnique по ключу из адреса: UUID → по id, иначе — по слагу
 * (в нижнем регистре). null — ключ заведомо невалиден.
 */
export function artistKeyWhere(key: unknown): Prisma.ArtistWhereUniqueInput | null {
  const raw = String(key ?? '').trim();
  if (!raw || raw.length > 200) return null;
  if (isUuid(raw)) return { id: raw };
  return { slug: raw.toLowerCase() };
}

/** id артиста по прежнему слагу (ArtistSlugHistory) — для 301 со старого адреса. */
export async function findArtistIdBySlugHistory(key: unknown): Promise<string | null> {
  const raw = String(key ?? '').trim().toLowerCase();
  if (!raw || isUuid(raw) || raw.length > 200) return null;
  const row = await prisma.artistSlugHistory.findUnique({ where: { slug: raw }, select: { artistId: true } });
  return row?.artistId ?? null;
}

/** Адрес страницы артиста: по слагу, если он есть, иначе по id. */
export function artistPath(a: { id: string; slug?: string | null }): string {
  return `/artist/${a.slug || a.id}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma-middleware: назначение и пересчёт слага
// ─────────────────────────────────────────────────────────────────────────────

function nameFromData(data: any): string | undefined {
  if (!data) return undefined;
  if (typeof data.name === 'string') return data.name;
  if (data.name && typeof data.name === 'object' && typeof data.name.set === 'string') return data.name.set;
  return undefined;
}

function isSlugConflict(err: any): boolean {
  if (err?.code !== 'P2002') return false;
  const target = err?.meta?.target;
  return Array.isArray(target) ? target.includes('slug') : String(target ?? '').includes('slug');
}

/** Сохранить прежний слаг в историю (дубли пропускаются). */
async function rememberOldSlug(artistId: string, oldSlug: string, newSlug: string): Promise<void> {
  try {
    await prisma.artistSlugHistory.createMany({ data: [{ artistId, slug: oldSlug }], skipDuplicates: true });
    // Текущий слаг не должен одновременно числиться «прежним» (переименование обратно).
    await prisma.artistSlugHistory.deleteMany({ where: { artistId, slug: newSlug } });
  } catch (err) {
    console.error('[artistSlug] failed to store slug history:', err);
  }
}

/**
 * Prisma-middleware (регистрируется в index.ts): Artist.create — слаг по имени;
 * Artist.update с новым именем — новый слаг, если артист не VERIFIED, прежний
 * слаг → ArtistSlugHistory. Явно переданный slug не трогает. Конфликт
 * уникальности (гонка одноимённых) — до 3 повторов с пересчётом.
 */
export const artistSlugMiddleware: Prisma.Middleware = async (params, next) => {
  if (params.model !== 'Artist') return next(params);

  if (params.action === 'create') {
    const data = params.args?.data;
    const name = nameFromData(data);
    if (!data || name === undefined || data.slug != null) return next(params);
    for (let attempt = 0; ; attempt++) {
      data.slug = await generateUniqueArtistSlug(name);
      try {
        return await next(params);
      } catch (err) {
        if (attempt < 3 && isSlugConflict(err)) continue;
        throw err;
      }
    }
  }

  if (params.action === 'update') {
    const data = params.args?.data;
    const id = params.args?.where?.id;
    const name = nameFromData(data);
    if (!data || name === undefined || data.slug !== undefined || typeof id !== 'string') return next(params);
    const prev = await prisma.artist.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, status: true },
    });
    if (!prev) return next(params);
    // Верифицированный артист: адрес стабилен (имя меняет только поддержка).
    if (prev.slug && prev.status === 'VERIFIED') return next(params);
    if (prev.slug && prev.name === name) return next(params);
    const slug = await generateUniqueArtistSlug(name, prev.id);
    if (slug === prev.slug) return next(params);
    data.slug = slug;
    let result;
    try {
      result = await next(params);
    } catch (err) {
      if (!isSlugConflict(err)) throw err;
      // Гонка: слаг успели занять — сохраняем имя без смены адреса.
      delete data.slug;
      return next(params);
    }
    if (prev.slug) await rememberOldSlug(prev.id, prev.slug, slug);
    return result;
  }

  return next(params);
};

/**
 * Страховка при старте api: слаг артистам, у которых его нет (основное
 * заполнение — SQL-миграция). Идемпотентно; возвращает число заполненных.
 */
export async function backfillArtistSlugs(batch = 500): Promise<number> {
  let filled = 0;
  const failed: string[] = [];
  for (let round = 0; round < 100; round++) {
    const rows = await prisma.artist.findMany({
      where: { slug: null, ...(failed.length ? { id: { notIn: failed } } : {}) },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
      take: batch,
    });
    if (!rows?.length) break;
    for (const row of rows) {
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        try {
          const slug = await generateUniqueArtistSlug(row.name, row.id);
          // updateMany с условием slug: null — гонка с другим процессом безопасна
          // (middleware переименования на updateMany не срабатывает).
          await prisma.artist.updateMany({ where: { id: row.id, slug: null }, data: { slug } });
          filled++;
          done = true;
        } catch (err) {
          if (!isSlugConflict(err) || attempt === 2) {
            console.error(`[artistSlug] backfill failed for artist ${row.id}:`, err);
            break;
          }
        }
      }
      if (!done) failed.push(row.id);
    }
    if (rows.length < batch) break;
  }
  return filled;
}
