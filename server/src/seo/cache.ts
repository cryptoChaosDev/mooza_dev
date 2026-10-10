/**
 * Кэш SEO-снимков и sitemap: LRU на 500 записей с TTL на запись
 * (10 мин — сущности, 2 мин — лента/каталог, 30 мин — sitemap).
 *
 * В кэше лежат ФРАГМЕНТЫ снимка (head/body/статус) и редиректы, а не готовый
 * HTML: шаблон с хешами ассетов подставляется на каждый запрос, поэтому после
 * деплоя кэш не отдаёт ссылки на удалённые чанки.
 *
 * Инвалидация — целиком (данные связаны: имя артиста есть на страницах релизов,
 * профилей, в ленте и sitemap):
 *   - seoCacheMiddleware (prisma.$use) — на любую запись в публичные модели;
 *     обновление User, меняющее только служебные поля (lastSeenAt раз в 30 с
 *     от сокета и т.п.), кэш НЕ сбрасывает;
 *   - onPublicDataChanged из lib/publicData (выдача/отзыв согласия, запрет индексации).
 * Поколение (generation) защищает от гонки «рендер начался → запись → рендер
 * закончился и положил устаревшее»: результат кладётся, только если поколение
 * не сменилось за время рендера.
 */

import type { Prisma } from '@prisma/client';

export const SEO_CACHE_MAX = 500;

export const SEO_TTL = {
  entity: 10 * 60_000,
  list: 2 * 60_000,
  sitemap: 30 * 60_000,
} as const;

type Entry<T> = { value: T; expiresAt: number };

export class LruCache<T> {
  private map = new Map<string, Entry<T>>();

  constructor(private readonly max: number) {}

  get(key: string, now = Date.now()): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= now) {
      this.map.delete(key);
      return undefined;
    }
    // освежаем позицию (Map хранит порядок вставки)
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: T, ttlMs: number, now = Date.now()): void {
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: now + ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export const seoCache = new LruCache<unknown>(SEO_CACHE_MAX);

let generation = 0;
/** Один расчёт на ключ одновременно (краулер, открывший 50 вкладок, — один запрос в БД). */
const inflight = new Map<string, Promise<unknown>>();

/** Текущее поколение кэша (меняется при каждой инвалидации). */
export function seoCacheGeneration(): number {
  return generation;
}

/** Сбросить кэш снимков и sitemap целиком. */
export function invalidateSeoCache(_reason?: string): void {
  generation++;
  seoCache.clear();
  inflight.clear();
}

/**
 * Получить из кэша или посчитать. Кладёт результат, только если за время
 * вычисления не было инвалидации.
 */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = seoCache.get(key) as T | undefined;
  if (hit !== undefined) return hit;
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const gen = generation;
  // eslint-disable-next-line prefer-const
  let p!: Promise<T>;
  p = (async () => {
    try {
      const value = await compute();
      if (gen === generation) seoCache.set(key, value, ttlMs);
      return value;
    } finally {
      if (inflight.get(key) === p) inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma-middleware: сброс на запись
// ─────────────────────────────────────────────────────────────────────────────

/** Модели, чьи данные попадают в снимки и sitemap. */
export const SEO_WATCHED_MODELS: ReadonlySet<string> = new Set([
  'Artist', 'Release', 'Clip', 'User', 'UserService', 'Order', 'Vacancy', 'Post',
  'UserArtist', 'ReleaseParticipant', 'ClipParticipant', 'Review',
  'LineupRequest', 'LineupResponse', 'Concert',
]);

const WRITE_ACTIONS: ReadonlySet<string> = new Set([
  'create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany',
]);

/**
 * Служебные поля User, которых нет ни в снимках, ни в sitemap: их обновление
 * кэш не сбрасывает (lastSeenAt пишется сокетом раз в 30 с на каждого онлайн-юзера).
 */
export const USER_NOISE_FIELDS: ReadonlySet<string> = new Set([
  'lastSeenAt', 'updatedAt', 'lastCodeSentAt', 'notificationPrefs', 'telegramNotifyEnabled',
  'publicConsentPromptAt', 'publicConsentPromptCount',
  'emailVerificationCode', 'emailVerificationExpires', 'passwordResetCode', 'passwordResetExpires',
  'pendingEmail', 'pendingEmailCodeHash', 'pendingEmailExpires',
]);

/** Запись в User, меняющая только служебные поля (lastSeenAt и т.п.)? */
export function isNoiseOnlyUserWrite(params: { model?: string; action: string; args?: any }): boolean {
  if (params.model !== 'User' || (params.action !== 'update' && params.action !== 'updateMany')) return false;
  const data = params.args?.data;
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data);
  return keys.length > 0 && keys.every((k) => USER_NOISE_FIELDS.has(k));
}

/** Нужно ли сбросить кэш после этого запроса Prisma. */
export function shouldInvalidateSeo(params: { model?: string; action: string; args?: any }): boolean {
  if (!params.model || !SEO_WATCHED_MODELS.has(params.model)) return false;
  if (!WRITE_ACTIONS.has(params.action)) return false;
  return !isNoiseOnlyUserWrite(params);
}

/** prisma.$use(seoCacheMiddleware) — регистрируется в index.ts. */
export const seoCacheMiddleware: Prisma.Middleware = async (params, next) => {
  const result = await next(params);
  if (shouldInvalidateSeo(params)) invalidateSeoCache(`${params.model}.${params.action}`);
  return result;
};
