/**
 * Публичные (гостевые) данные — «Moooza доступна без регистрации».
 *
 * ЕДИНСТВЕННОЕ место, где собираются ответы для неавторизованного зрителя:
 *   - JSON-эндпоинты (ветка `if (!req.userId)` в роутерах);
 *   - SEO-снимки и sitemap (Ф4) — переиспользуют загрузчики как есть.
 *
 * Правила:
 *   1. Только БЕЛЫЕ списки: Prisma `select` + явная сборка объекта. Никакого
 *      `...rest` и никакого переиспользования объектов авторизованной ветки.
 *   2. Люди без согласия на публичное распространение ПДн (publicConsentAt,
 *      152-ФЗ ст. 10.1) и заблокированные — обезличиваются (toPublicPerson),
 *      их профили/услуги/отзывы — одинаковый 404.
 *   3. Контакты гостю не отдаются никогда: socialLinks без контактных ключей +
 *      `contactsAvailable: boolean`, свободный текст — через maskContacts.
 *   4. Загрузчики возвращают `{ status: 'ok' | 'not_found' | 'noindex', data, lastModified }`:
 *      ok — видно и индексируется; noindex — видно (200), но не индексировать
 *      (закрытый заказ, архивная вакансия, артист на модерации, запрет индексации
 *      профиля); not_found — 404.
 */

import type { Prisma } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import { prisma } from '../index';
import { maskContacts, maskContactsDeep, stripLinksForGuest, CONTACT_MASK } from './maskContacts';
import { buildFeedWhere, diversifyByAuthor, clampInt, TEAM_EMAIL, FeedFilterQuery } from './feedQuery';
import { artistKeyWhere, findArtistIdBySlugHistory } from './artistSlug';

// ─────────────────────────────────────────────────────────────────────────────
// Результат загрузчика
// ─────────────────────────────────────────────────────────────────────────────

export type PublicStatus = 'ok' | 'not_found' | 'noindex';

export type PublicResult<T> =
  | { status: 'ok' | 'noindex'; data: T; lastModified: Date | null }
  | { status: 'not_found'; data: null; lastModified: null };

function notFound<T = never>(): PublicResult<T> {
  return { status: 'not_found', data: null, lastModified: null };
}

function found<T>(data: T, lastModified: Date | null, indexable: boolean): PublicResult<T> {
  return { status: indexable ? 'ok' : 'noindex', data, lastModified };
}

function maxDate(...dates: Array<Date | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    const dd = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dd.getTime())) continue;
    if (!best || dd > best) best = dd;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// «Гость не получает никогда» — тот же список запретный в тестах
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ключи, которых не должно быть НИГДЕ (на любой глубине) в гостевом ответе.
 * Список из плана (docs/public-access-plan.md, раздел C) + служебные поля,
 * которые гостевые сериализаторы тоже никогда не выдают.
 */
export const GUEST_FORBIDDEN_KEYS: readonly string[] = [
  // идентификация и вход
  'email', 'phone', 'password', 'passwordHash',
  'telegramId', 'telegramUsername', 'vkId',
  'emailVerified', 'passwordChangedAt', 'lastCodeSentAt', 'telegramNotifyEnabled',
  // личное
  'birthDate', 'birthDateVisible', 'lastSeenAt', 'notificationPrefs',
  // модерация / права
  'isBlocked', 'blockedUntil', 'isAdmin',
  // коды
  'code', 'token', 'emailVerificationCode', 'emailVerificationExpires',
  'passwordResetCode', 'passwordResetExpires', 'verificationCode', 'verificationProofUrl',
  // модерация артиста
  'rejectionReason', 'submittedById', 'submitterRoles',
  // приватность и согласия
  'contactsVisibility', 'contactsVisible', 'termsAgreedAt',
  'publicConsentAt', 'publicConsentVersion', 'publicConsentRevokedAt', 'searchIndexingOptOut',
  'publicConsentPromptAt', 'publicConsentPromptCount',
  // рефералы и Pro-служебное
  'referrerId', 'referralLinkUsed', 'proUntil', 'proMonthsFromReferrals',
  // метрики и связи
  'avgResponseMinutes', 'viewerProfileComplete', 'isFriend',
  // отклики и материалы
  'responses', 'myResponse', 'offeredCandidateIds',
  // идентификаторы людей вне объекта персоны (userId в реакциях и т.п.)
  'userId', 'authorId', 'executorId', 'applicantId', 'candidateId', 'invitedById', 'requesterId', 'receiverId',
];

/** Префиксы запретных ключей: friendship*, referrer*, referral*, reference*. */
export const GUEST_FORBIDDEN_KEY_PREFIXES: readonly string[] = ['friendship', 'referrer', 'referral', 'reference'];

const FORBIDDEN_SET = new Set(GUEST_FORBIDDEN_KEYS);

export function isGuestForbiddenKey(key: string): boolean {
  if (FORBIDDEN_SET.has(key)) return true;
  return GUEST_FORBIDDEN_KEY_PREFIXES.some((p) => key.startsWith(p));
}

/** Рекурсивно найти запретные ключи; возвращает пути вида `a.b[0].email`. */
export function findGuestForbiddenKeys(value: unknown, path = '$', out: string[] = [], depth = 0): string[] {
  if (depth > 25 || value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => findGuestForbiddenKeys(v, `${path}[${i}]`, out, depth + 1));
    return out;
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isGuestForbiddenKey(k)) out.push(`${path}.${k}`);
      findGuestForbiddenKeys(v, `${path}.${k}`, out, depth + 1);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Публичный человек
// ─────────────────────────────────────────────────────────────────────────────

export const ANON_PERSON_NAME = 'Участник Moooza';
export const ANON_CUSTOMER_NAME = 'Заказчик на Moooza';
export const ANON_REVIEWER_NAME = 'Пользователь Moooza';

/**
 * Prisma where «человек виден гостю»: есть согласие (publicConsentAt), не
 * заблокирован, срок блокировки (blockedUntil) пуст или в прошлом.
 * searchIndexingOptOut на видимость НЕ влияет (только на индексацию/sitemap).
 * Функция (а не константа) — blockedUntil сравнивается с текущим временем.
 * Комбинировать через `{ AND: [другое, publicPersonWhere()] }`.
 */
export function publicPersonWhere(now: Date = new Date()): Prisma.UserWhereInput {
  return {
    AND: [
      { publicConsentAt: { not: null } },
      { isBlocked: false },
      { OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }] },
    ],
  };
}

/** Алиас под имя из плана. */
export const PUBLIC_PERSON_WHERE = publicPersonWhere;

/** Prisma where «не заблокирован сейчас» (для авторов заказов/постов артистов). */
export function notBlockedWhere(now: Date = new Date()): Prisma.UserWhereInput {
  return {
    AND: [
      { isBlocked: false },
      { OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }] },
    ],
  };
}

type PersonRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  nickname?: string | null;
  avatar?: string | null;
  isVerified?: boolean | null;
  isPremium?: boolean | null;
  publicConsentAt?: Date | null;
  isBlocked?: boolean | null;
  blockedUntil?: Date | null;
};

/** Поля, нужные toPublicPerson. Служебные (согласие/блок) читаются, но не выдаются. */
export const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatar: true,
  isVerified: true,
  isPremium: true,
  publicConsentAt: true,
  isBlocked: true,
  blockedUntil: true,
} as const;

function isBlockedNow(u: { isBlocked?: boolean | null; blockedUntil?: Date | null } | null | undefined, now = new Date()): boolean {
  if (!u) return true;
  if (u.isBlocked) return true;
  return !!(u.blockedUntil && new Date(u.blockedUntil) >= now);
}

export function isPublicPerson(u: PersonRow | null | undefined, now = new Date()): boolean {
  if (!u || !u.publicConsentAt) return false;
  if (u.isBlocked) return false;
  if (u.blockedUntil && new Date(u.blockedUntil) >= now) return false;
  return true;
}

export interface PublicPerson {
  id: string | null;
  displayName: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  avatar: string | null;
  isVerified: boolean;
  isPremium: boolean;
  isPublic: boolean;
}

/**
 * Человек для гостя. С согласием — имя, ник, аватар, id (ссылка на профиль).
 * Без согласия / заблокирован → `{ id: null, displayName: 'Участник Moooza',
 * avatar: null, isPublic: false }` (имя и фото без ссылки — тоже ПДн).
 * firstName/lastName дублируются для совместимости с существующими карточками.
 */
export function toPublicPerson(u: PersonRow | null | undefined, fallbackName: string = ANON_PERSON_NAME): PublicPerson {
  if (!u || !isPublicPerson(u)) {
    return {
      id: null,
      displayName: fallbackName,
      firstName: fallbackName,
      lastName: '',
      nickname: null,
      avatar: null,
      isVerified: false,
      isPremium: false,
      isPublic: false,
    };
  }
  const firstName = u.firstName ?? '';
  const lastName = u.lastName ?? '';
  return {
    id: u.id,
    displayName: `${firstName} ${lastName}`.trim() || fallbackName,
    firstName,
    lastName,
    nickname: u.nickname ?? null,
    avatar: u.avatar ?? null,
    isVerified: !!u.isVerified,
    isPremium: !!u.isPremium,
    isPublic: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Хук инвалидации (Ф4: кэш снимков/sitemap подпишется здесь)
// ─────────────────────────────────────────────────────────────────────────────

export type PublicDataChange = {
  type: 'user' | 'artist' | 'service' | 'order' | 'vacancy' | 'post' | 'release' | 'clip';
  id: string;
  reason?: string;
};

type PublicDataListener = (change: PublicDataChange) => void;
const publicDataListeners = new Set<PublicDataListener>();

/** Подписка на изменение публичных данных. Возвращает функцию отписки. */
export function onPublicDataChanged(cb: PublicDataListener): () => void {
  publicDataListeners.add(cb);
  return () => { publicDataListeners.delete(cb); };
}

/** Сообщить об изменении (отзыв/выдача согласия, запрет индексации…). */
export function notifyPublicDataChanged(change: PublicDataChange): void {
  clearGuestFeedCache();
  for (const cb of publicDataListeners) {
    try { cb(change); } catch (err) { console.error('[publicData] listener failed:', err); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Общие сериализаторы
// ─────────────────────────────────────────────────────────────────────────────

const ID_NAME = { select: { id: true, name: true } } as const;

const CFV_SELECT = {
  select: { id: true, filterId: true, value: true, filter: { select: { id: true, name: true } } },
} as const;

type CfvRow = { id: string; filterId?: string; value: string; filter?: { id: string; name: string } | null };

function serializeCfv(v: CfvRow) {
  return {
    id: v.id,
    filterId: v.filterId ?? v.filter?.id ?? null,
    value: v.value,
    filter: v.filter ? { id: v.filter.id, name: v.filter.name } : null,
  };
}

function idName(x: { id: string; name: string } | null | undefined) {
  return x ? { id: x.id, name: x.name } : null;
}

function effectivePro(u: { isPro?: boolean | null; proUntil?: Date | null }): boolean {
  if (u.isPro) return true;
  return !!(u.proUntil && new Date(u.proUntil).getTime() > Date.now());
}

// ── Услуга (UserService) ─────────────────────────────────────────────────────

export const PUBLIC_SERVICE_SELECT = {
  id: true,
  name: true,
  priceFrom: true,
  priceTo: true,
  deadlineFrom: true,
  deadlineTo: true,
  description: true,
  priceItems: true,
  status: true,
  professionId: true,
  serviceId: true,
  createdAt: true,
  updatedAt: true,
  profession: {
    select: {
      id: true,
      name: true,
      directionId: true,
      direction: {
        select: {
          id: true,
          name: true,
          allowedFilterTypes: true,
          customFilters: {
            select: {
              id: true,
              name: true,
              values: { select: { id: true, value: true }, orderBy: { sortOrder: 'asc' as const } },
            },
          },
          fieldOfActivity: ID_NAME,
        },
      },
    },
  },
  service: { select: { id: true, name: true, section: ID_NAME } },
  genres: ID_NAME,
  workFormats: ID_NAME,
  employmentTypes: ID_NAME,
  skillLevels: ID_NAME,
  availabilities: ID_NAME,
  geographies: ID_NAME,
  selectedCustomFilterValues: CFV_SELECT,
} as const;

function serializeService(us: any) {
  const direction = us.profession?.direction;
  return {
    id: us.id,
    name: maskContacts(us.name ?? null),
    priceFrom: us.priceFrom ?? null,
    priceTo: us.priceTo ?? null,
    deadlineFrom: us.deadlineFrom ?? null,
    deadlineTo: us.deadlineTo ?? null,
    description: maskContacts(us.description ?? null),
    priceItems: us.priceItems != null ? maskContactsDeep(us.priceItems) : null,
    status: us.status,
    professionId: us.professionId ?? null,
    serviceId: us.serviceId ?? null,
    createdAt: us.createdAt,
    updatedAt: us.updatedAt,
    profession: us.profession
      ? {
          id: us.profession.id,
          name: us.profession.name,
          directionId: us.profession.directionId ?? null,
          direction: direction
            ? {
                id: direction.id,
                name: direction.name,
                allowedFilterTypes: direction.allowedFilterTypes ?? [],
                customFilters: (direction.customFilters ?? []).map((cf: any) => ({
                  id: cf.id,
                  name: cf.name,
                  values: (cf.values ?? []).map((v: any) => ({ id: v.id, value: v.value })),
                })),
                fieldOfActivity: idName(direction.fieldOfActivity),
              }
            : null,
        }
      : null,
    service: us.service
      ? { id: us.service.id, name: us.service.name, section: idName(us.service.section) }
      : null,
    genres: (us.genres ?? []).map(idName),
    workFormats: (us.workFormats ?? []).map(idName),
    employmentTypes: (us.employmentTypes ?? []).map(idName),
    skillLevels: (us.skillLevels ?? []).map(idName),
    availabilities: (us.availabilities ?? []).map(idName),
    geographies: (us.geographies ?? []).map(idName),
    selectedCustomFilterValues: (us.selectedCustomFilterValues ?? []).map(serializeCfv),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Профиль
// ─────────────────────────────────────────────────────────────────────────────

const PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatar: true,
  bannerImage: true,
  bio: true,
  country: true,
  city: true,
  role: true,
  isPremium: true,
  isPro: true,
  proUntil: true, // только для вычисления isPro, не выдаётся
  isVerified: true,
  genres: true,
  occupancyStatus: true,
  socialLinks: true,
  contactsVisibility: true, // только для contactsAvailable, не выдаётся
  searchIndexingOptOut: true, // только для статуса noindex, не выдаётся
  publicConsentAt: true, // повторная проверка в памяти (defense in depth), не выдаётся
  isBlocked: true,
  blockedUntil: true,
  createdAt: true,
  updatedAt: true,
  fieldOfActivity: ID_NAME,
  userProfessions: {
    select: {
      id: true,
      features: true,
      profession: {
        select: { id: true, name: true, directionId: true, direction: ID_NAME },
      },
      selectedCustomFilterValues: CFV_SELECT,
    },
  },
  userServices: {
    where: { status: 'active' },
    select: PUBLIC_SERVICE_SELECT,
    orderBy: { professionId: 'asc' as const },
  },
  userArtists: {
    where: { inviteStatus: 'ACCEPTED' as const, artist: { status: { not: 'REJECTED' as const } } },
    select: {
      id: true,
      isOwner: true,
      participationStatus: true,
      artist: { select: { id: true, slug: true, name: true, avatar: true, status: true } },
    },
  },
  channel: {
    select: {
      id: true,
      name: true,
      description: true,
      avatar: true,
      _count: { select: { subscriptions: true, posts: true } },
    },
  },
  portfolioFiles: {
    select: { id: true, url: true, originalName: true, title: true, size: true, mimeType: true, sortOrder: true, createdAt: true },
    orderBy: { sortOrder: 'asc' as const },
  },
  portfolioLinks: {
    select: { id: true, type: true, url: true, title: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { posts: true } },
} as const;

/** Минимальная длина «о себе» для порога качества профиля (символов). */
export const PROFILE_QUALITY_BIO_MIN = 80;

/**
 * Порог качества профиля для индексации и sitemap (план, раздел E): есть аватар
 * И (bio ≥ 80 символов, ИЛИ активная услуга, ИЛИ участие в артисте). Ниже
 * порога профиль виден гостю, но noindex — «малоценные страницы» не плодим.
 */
export function meetsProfileQuality(p: {
  avatar?: string | null;
  bio?: string | null;
  servicesCount?: number;
  artistsCount?: number;
}): boolean {
  if (!p.avatar) return false;
  const bioLen = Array.from(String(p.bio ?? '').trim()).length;
  return bioLen >= PROFILE_QUALITY_BIO_MIN || (p.servicesCount ?? 0) > 0 || (p.artistsCount ?? 0) > 0;
}

/**
 * Гостевой профиль. Нет пользователя / нет согласия / заблокирован →
 * not_found (одинаково — существование не раскрывается).
 * `byHandle`: ключ — ник (с «@» или без) или UUID.
 * indexable = нет запрета индексации И пройден порог качества (meetsProfileQuality).
 */
export async function getPublicProfile(key: string, opts: { byHandle?: boolean } = {}): Promise<PublicResult<any>> {
  const clean = String(key ?? '').trim().replace(/^@/, '');
  if (!clean) return notFound();
  const keyWhere: Prisma.UserWhereInput = opts.byHandle
    ? { OR: [{ nickname: { equals: clean, mode: 'insensitive' } }, { id: clean }] }
    : { id: clean };

  const user: any = await prisma.user.findFirst({
    where: { AND: [keyWhere, publicPersonWhere()] },
    select: PROFILE_SELECT,
  });
  // Фильтр по согласию стоит в where; повторяем проверку в памяти, чтобы ошибка
  // в запросе не превратилась в утечку.
  if (!user || !isPublicPerson(user)) return notFound();

  const dealsCount = await prisma.deal.count({
    where: { status: 'COMPLETED', OR: [{ customerId: user.id }, { executorId: user.id }] },
  });

  const { links, contactsAvailable } = stripLinksForGuest(user.socialLinks, 'user');
  const visibility = user.contactsVisibility || 'ALL';
  const services = (user.userServices ?? []).filter((us: any) => us.status === 'active').map(serializeService);
  const visibleArtists = (user.userArtists ?? []).filter(
    (ua: any) => (ua.inviteStatus ?? 'ACCEPTED') === 'ACCEPTED' && ua.artist && ua.artist.status !== 'REJECTED',
  );
  const indexable = !user.searchIndexingOptOut && meetsProfileQuality({
    avatar: user.avatar,
    bio: user.bio,
    servicesCount: services.length,
    artistsCount: visibleArtists.length,
  });

  const data = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
    nickname: user.nickname ?? null,
    avatar: user.avatar ?? null,
    bannerImage: user.bannerImage ?? null,
    bio: maskContacts(user.bio ?? null),
    country: user.country ?? null,
    city: user.city ?? null,
    role: user.role ?? null,
    isPremium: !!user.isPremium,
    isPro: effectivePro(user),
    isVerified: !!user.isVerified,
    genres: user.genres ?? [],
    occupancyStatus: user.occupancyStatus ?? null,
    createdAt: user.createdAt,
    fieldOfActivity: idName(user.fieldOfActivity),
    userProfessions: (user.userProfessions ?? []).map((up: any) => ({
      id: up.id,
      features: up.features ?? [],
      profession: up.profession
        ? {
            id: up.profession.id,
            name: up.profession.name,
            directionId: up.profession.directionId ?? null,
            direction: idName(up.profession.direction),
          }
        : null,
      selectedCustomFilterValues: (up.selectedCustomFilterValues ?? []).map(serializeCfv),
    })),
    userServices: services,
    userArtists: visibleArtists.map((ua: any) => ({
      id: ua.id,
      isOwner: !!ua.isOwner,
      participationStatus: ua.participationStatus,
      artist: ua.artist
        ? { id: ua.artist.id, slug: ua.artist.slug ?? null, name: ua.artist.name, avatar: ua.artist.avatar ?? null, status: ua.artist.status }
        : null,
    })),
    socialLinks: links,
    // Контакты (телефон, email, Telegram, личные соцсети) гостю не отдаются —
    // только признак, что после входа их можно будет увидеть.
    contactsAvailable: contactsAvailable && visibility !== 'FRIENDS',
    channel: user.channel
      ? {
          id: user.channel.id,
          name: user.channel.name,
          description: maskContacts(user.channel.description ?? null),
          avatar: user.channel.avatar ?? null,
          _count: {
            subscriptions: user.channel._count?.subscriptions ?? 0,
            posts: user.channel._count?.posts ?? 0,
          },
        }
      : null,
    portfolioFiles: (user.portfolioFiles ?? []).map((f: any) => ({
      id: f.id, url: f.url, originalName: f.originalName, title: f.title ?? null,
      size: f.size, mimeType: f.mimeType ?? null, sortOrder: f.sortOrder, createdAt: f.createdAt,
    })),
    portfolioLinks: (user.portfolioLinks ?? []).map((l: any) => ({
      id: l.id, type: l.type, url: l.url, title: l.title, createdAt: l.createdAt,
    })),
    _count: { posts: user._count?.posts ?? 0 },
    dealsCount,
    isPublic: true,
    indexable,
  };

  const lastModified = maxDate(user.updatedAt, ...services.map((s: any) => s.updatedAt));
  return found(data, lastModified, indexable);
}

async function findPublicPersonRow(userId: string) {
  if (!userId) return null;
  const row = await prisma.user.findFirst({
    where: { AND: [{ id: String(userId) }, publicPersonWhere()] },
    select: {
      id: true, updatedAt: true, searchIndexingOptOut: true,
      firstName: true, lastName: true, publicConsentAt: true, isBlocked: true, blockedUntil: true,
    },
  });
  return row && isPublicPerson(row) ? row : null;
}

/** Активные услуги пользователя с согласием; иначе not_found. */
export async function getPublicUserServices(userId: string): Promise<PublicResult<any[]>> {
  const owner = await findPublicPersonRow(userId);
  if (!owner) return notFound();
  const rows = await prisma.userService.findMany({
    where: { userId: owner.id, status: 'active' },
    select: PUBLIC_SERVICE_SELECT,
    orderBy: [{ professionId: 'asc' }],
  });
  const data = rows.filter((r: any) => r.status === 'active').map(serializeService);
  return found(data, maxDate(owner.updatedAt, ...rows.map((r: any) => r.updatedAt)), !owner.searchIndexingOptOut);
}

/** Услуга: только active и только у исполнителя с согласием; иначе not_found. */
export async function getPublicService(serviceId: string): Promise<PublicResult<any>> {
  if (!serviceId) return notFound();
  const us: any = await prisma.userService.findFirst({
    where: { id: String(serviceId), status: 'active', user: publicPersonWhere() },
    select: {
      ...PUBLIC_SERVICE_SELECT,
      user: { select: { ...PERSON_SELECT, city: true, searchIndexingOptOut: true } },
    },
  });
  if (!us || us.status !== 'active' || !isPublicPerson(us.user)) return notFound();
  const indexable = !us.user.searchIndexingOptOut;
  const data = {
    ...serializeService(us),
    user: { ...toPublicPerson(us.user), city: us.user.city ?? null },
    indexable,
  };
  return found(data, us.updatedAt ?? null, indexable);
}

// ─────────────────────────────────────────────────────────────────────────────
// Отзывы
// ─────────────────────────────────────────────────────────────────────────────

export const GUEST_REVIEWS_LIMIT = 100;

/** Отзывы о человеке с согласием; авторы без согласия → «Пользователь Moooza». */
export async function getPublicReviews(userId: string, sort: string = 'date'): Promise<PublicResult<any[]>> {
  const target = await findPublicPersonRow(userId);
  if (!target) return notFound();
  const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
    sort === 'positive' ? [{ rating: 'desc' }, { createdAt: 'desc' }]
    : sort === 'negative' ? [{ rating: 'asc' }, { createdAt: 'desc' }]
    : [{ createdAt: 'desc' }];
  const rows: any[] = await prisma.review.findMany({
    where: { targetId: target.id },
    select: {
      id: true,
      rating: true,
      text: true,
      reply: true,
      type: true,
      createdAt: true,
      updatedAt: true,
      author: { select: PERSON_SELECT },
      service: ID_NAME,
      deal: { select: { id: true, createdAt: true, updatedAt: true, status: true } },
    },
    orderBy,
    take: GUEST_REVIEWS_LIMIT,
  });
  const data = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    text: maskContacts(r.text ?? null),
    reply: maskContacts(r.reply ?? null),
    type: r.type,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    author: toPublicPerson(r.author, ANON_REVIEWER_NAME),
    service: idName(r.service),
    deal: r.deal ? { id: r.deal.id, createdAt: r.deal.createdAt, updatedAt: r.deal.updatedAt, status: r.deal.status } : null,
  }));
  return found(data, maxDate(...rows.map((r) => r.updatedAt)), !target.searchIndexingOptOut);
}

// ─────────────────────────────────────────────────────────────────────────────
// Артист, релизы, клипы
// ─────────────────────────────────────────────────────────────────────────────

const INDEXABLE_ARTIST_STATUSES = new Set(['VERIFIED', 'APPROVED']);

const ROLE_SELECT = { select: { role: { select: { id: true, name: true } } } } as const;

function pickYmData(ym: any): any {
  if (!ym || typeof ym !== 'object') return null;
  const KEYS = ['links', 'similarArtists', 'popularTracks', 'photos', 'concerts', 'bestPlaylist', 'counts', 'likesCount'];
  const out: Record<string, unknown> = {};
  for (const k of KEYS) if (k in ym) out[k] = ym[k];
  return out;
}

/**
 * Артист для гостя. REJECTED / нет → not_found; DRAFT/PENDING → noindex (видно
 * с бейджем). Состав — только ACCEPTED-участники с согласием, остальные —
 * `hiddenMembersCount` («и ещё N участников — после входа»), id не отдаются.
 */
export async function getPublicArtist(artistKey: string): Promise<PublicResult<any>> {
  // Ключ из адреса — UUID или слаг (текущий или прежний из ArtistSlugHistory).
  // Ответ всегда несёт текущий `slug`: вызывающий сам решает про 301 / замену URL.
  const where = artistKeyWhere(artistKey);
  if (!where) return notFound();
  const select = {
    id: true,
    slug: true,
    name: true,
    type: true,
    city: true,
    tourReady: true,
    description: true,
    socialLinks: true,
    bandLink: true,
    avatar: true,
    banner: true,
    listeners: true,
    listenersDelta: true,
    ymData: true,
    activityStatus: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    genres: { select: { genre: ID_NAME } },
    _count: { select: { followers: true } },
    userArtists: {
      where: { inviteStatus: 'ACCEPTED' },
      select: {
        id: true,
        isOwner: true,
        participationStatus: true,
        user: { select: PERSON_SELECT },
        profession: ID_NAME,
        roles: ROLE_SELECT,
      },
      orderBy: { createdAt: 'asc' as const },
    },
  } as const;
  let artist: any = await prisma.artist.findUnique({ where, select });
  if (!artist && !('id' in where)) {
    const movedId = await findArtistIdBySlugHistory(artistKey);
    if (movedId) artist = await prisma.artist.findUnique({ where: { id: movedId }, select });
  }
  if (!artist || artist.status === 'REJECTED') return notFound();

  const accepted = (artist.userArtists ?? []).filter((ua: any) => (ua.inviteStatus ?? 'ACCEPTED') === 'ACCEPTED');
  const publicMembers = accepted.filter((ua: any) => isPublicPerson(ua.user));
  const hiddenUserIds = new Set(
    accepted.filter((ua: any) => !isPublicPerson(ua.user)).map((ua: any) => ua.user?.id),
  );

  const confirmedMembers = publicMembers.map((ua: any) => ({
    isOwner: !!ua.isOwner,
    participationStatus: ua.participationStatus,
    user: toPublicPerson(ua.user),
    profession: idName(ua.profession),
    roles: (ua.roles ?? []).map((r: any) => ({ id: r.role.id, name: r.role.name })),
  }));
  // Плоская форма для старых потребителей (members[].id и т.п.) — тоже только публичные.
  const members = publicMembers.map((ua: any) => {
    const p = toPublicPerson(ua.user);
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      avatar: p.avatar,
      nickname: p.nickname,
      profession: idName(ua.profession),
      isOwner: !!ua.isOwner,
      inviteStatus: 'ACCEPTED',
    };
  });

  const snapshots = await prisma.artistListenersSnapshot.findMany({
    where: { artistId: artist.id },
    orderBy: { createdAt: 'desc' },
    take: 90,
    select: { listeners: true, createdAt: true },
  });
  const listenersHistory = snapshots
    .slice()
    .reverse()
    .map((s: any) => ({ listeners: Number(s.listeners), date: s.createdAt }));

  let ymData = pickYmData(artist.ymData);
  const similar: any[] = Array.isArray(ymData?.similarArtists) ? ymData.similarArtists : [];
  if (similar.length > 0) {
    // Похожие с ЯМ, которые есть на Moooza, — по индексируемой колонке ymId (как в dev-ветке артиста).
    const similarIds = [...new Set(similar.map((x: any) => String(x?.ymId ?? '')).filter((x) => /^\d+$/.test(x)))];
    const ours: Array<{ id: string; slug: string | null; ymId: string | null }> = similarIds.length
      ? await prisma.artist.findMany({
          where: { ymId: { in: similarIds }, status: { in: ['VERIFIED', 'APPROVED'] }, NOT: { id: artist.id } },
          select: { id: true, slug: true, ymId: true },
        })
      : [];
    const ymToMooza = new Map<string, { id: string; slug: string | null }>(
      (ours ?? []).map((a) => [String(a.ymId), { id: a.id, slug: a.slug ?? null }]),
    );
    ymData = {
      ...ymData,
      similarArtists: similar.map((s: any) => {
        const m = ymToMooza.get(String(s?.ymId));
        return { ...s, moozaArtistId: m?.id ?? null, moozaArtistSlug: m?.slug ?? null };
      }),
    };
  }

  const { links, contactsAvailable } = stripLinksForGuest(artist.socialLinks, 'artist');
  const indexable = INDEXABLE_ARTIST_STATUSES.has(artist.status);

  const data = {
    id: artist.id,
    slug: artist.slug ?? null,
    name: artist.name,
    type: artist.type ?? null,
    city: artist.city ?? null,
    tourReady: artist.tourReady ?? null,
    description: maskContacts(artist.description ?? null),
    socialLinks: links,
    contactsAvailable,
    bandLink: artist.bandLink ?? null,
    avatar: artist.avatar ?? null,
    banner: artist.banner ?? null,
    listeners: artist.listeners != null ? Number(artist.listeners) : 0,
    listenersDelta: artist.listenersDelta ?? null,
    ymData,
    listenersHistory,
    activityStatus: artist.activityStatus,
    status: artist.status,
    createdAt: artist.createdAt,
    updatedAt: artist.updatedAt,
    genres: (artist.genres ?? []).map((g: any) => idName(g.genre)).filter(Boolean),
    followersCount: artist._count?.followers ?? 0,
    members,
    confirmedMembers,
    hiddenMembersCount: hiddenUserIds.size,
    pendingMembers: [],
    isFollowed: false,
    viewerIsOwner: false,
    viewerIsAdmin: false,
    viewerPendingMembership: null,
    indexable,
  };
  return found(data, artist.updatedAt ?? null, indexable);
}

async function findVisibleArtist(artistId: string) {
  if (!artistId) return null;
  const a = await prisma.artist.findUnique({ where: { id: String(artistId) }, select: { id: true, status: true, updatedAt: true } });
  if (!a || a.status === 'REJECTED') return null;
  return a;
}

/** Плитки релизов артиста (артист не REJECTED). */
export async function getPublicArtistReleases(artistId: string): Promise<PublicResult<any[]>> {
  const artist = await findVisibleArtist(artistId);
  if (!artist) return notFound();
  const rows: any[] = await prisma.release.findMany({
    where: { artistId: artist.id },
    orderBy: [{ releaseDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    select: { id: true, title: true, coverUrl: true, platform: true, url: true, releaseDate: true, updatedAt: true },
  });
  const data = rows.map((r) => ({
    id: r.id, title: r.title, coverUrl: r.coverUrl ?? null, platform: r.platform, url: r.url, releaseDate: r.releaseDate ?? null,
  }));
  return found(data, maxDate(artist.updatedAt, ...rows.map((r) => r.updatedAt)), INDEXABLE_ARTIST_STATUSES.has(artist.status));
}

/** Плитки клипов артиста (артист не REJECTED). */
export async function getPublicArtistClips(artistId: string): Promise<PublicResult<any[]>> {
  const artist = await findVisibleArtist(artistId);
  if (!artist) return notFound();
  const rows: any[] = await prisma.clip.findMany({
    where: { artistId: artist.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, coverUrl: true, platform: true, url: true, updatedAt: true },
  });
  const data = rows.map((c) => ({ id: c.id, title: c.title, coverUrl: c.coverUrl ?? null, platform: c.platform, url: c.url }));
  return found(data, maxDate(artist.updatedAt, ...rows.map((r) => r.updatedAt)), INDEXABLE_ARTIST_STATUSES.has(artist.status));
}

const CREDIT_PARTICIPANTS_SELECT = {
  where: { confirmStatus: 'ACCEPTED' as const },
  select: { id: true, user: { select: PERSON_SELECT }, roles: ROLE_SELECT },
  orderBy: { createdAt: 'asc' as const },
} as const;

function serializeCredits(all: any[]) {
  const participants = all.filter((p) => (p.confirmStatus ?? 'ACCEPTED') === 'ACCEPTED');
  const visible = participants.filter((p) => isPublicPerson(p.user));
  return {
    participants: visible.map((p) => ({
      id: p.id,
      confirmStatus: 'ACCEPTED',
      user: toPublicPerson(p.user),
      roles: (p.roles ?? []).map((r: any) => ({ id: r.role.id, name: r.role.name })),
    })),
    hiddenParticipantsCount: participants.length - visible.length,
  };
}

/** Релиз: артист не REJECTED; титры — только люди с согласием + «ещё N». */
export async function getPublicRelease(releaseId: string): Promise<PublicResult<any>> {
  if (!releaseId) return notFound();
  const r: any = await prisma.release.findUnique({
    where: { id: String(releaseId) },
    select: {
      id: true, artistId: true, title: true, coverUrl: true, releaseDate: true, platform: true, url: true,
      releaseType: true, label: true, genre: true, trackCount: true, likesCount: true, tracklist: true,
      createdAt: true, updatedAt: true,
      artist: { select: { id: true, slug: true, name: true, avatar: true, status: true } },
      participants: CREDIT_PARTICIPANTS_SELECT,
    },
  });
  if (!r || !r.artist || r.artist.status === 'REJECTED') return notFound();
  const indexable = INDEXABLE_ARTIST_STATUSES.has(r.artist.status);
  const data = {
    id: r.id,
    artistId: r.artistId,
    artist: { id: r.artist.id, slug: r.artist.slug ?? null, name: r.artist.name, avatar: r.artist.avatar ?? null, status: r.artist.status },
    title: r.title,
    coverUrl: r.coverUrl ?? null,
    releaseDate: r.releaseDate ?? null,
    platform: r.platform,
    url: r.url,
    releaseType: r.releaseType ?? null,
    label: r.label ?? null,
    genre: r.genre ?? null,
    trackCount: r.trackCount ?? null,
    likesCount: r.likesCount ?? null,
    tracklist: r.tracklist ?? null,
    createdAt: r.createdAt,
    viewerIsAdmin: false,
    ...serializeCredits(r.participants ?? []),
    indexable,
  };
  return found(data, r.updatedAt ?? null, indexable);
}

/** Клип: артист не REJECTED; титры — только люди с согласием + «ещё N». */
export async function getPublicClip(clipId: string): Promise<PublicResult<any>> {
  if (!clipId) return notFound();
  const c: any = await prisma.clip.findUnique({
    where: { id: String(clipId) },
    select: {
      id: true, artistId: true, title: true, coverUrl: true, platform: true, url: true, createdAt: true, updatedAt: true,
      artist: { select: { id: true, slug: true, name: true, avatar: true, status: true } },
      participants: CREDIT_PARTICIPANTS_SELECT,
    },
  });
  if (!c || !c.artist || c.artist.status === 'REJECTED') return notFound();
  const indexable = INDEXABLE_ARTIST_STATUSES.has(c.artist.status);
  const data = {
    id: c.id,
    artistId: c.artistId,
    artist: { id: c.artist.id, slug: c.artist.slug ?? null, name: c.artist.name, avatar: c.artist.avatar ?? null, status: c.artist.status },
    title: c.title,
    coverUrl: c.coverUrl ?? null,
    platform: c.platform,
    url: c.url,
    createdAt: c.createdAt,
    viewerIsAdmin: false,
    ...serializeCredits(c.participants ?? []),
    indexable,
  };
  return found(data, c.updatedAt ?? null, indexable);
}

// ─────────────────────────────────────────────────────────────────────────────
// Заказы и вакансии
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Заказ: draft / без поста в ленте / автор заблокирован → not_found.
 * active, done → ok; archived → noindex. Материалы скрыты (только количество),
 * контакты в тексте маскируются, автор без согласия — «Заказчик на Moooza».
 */
export async function getPublicOrder(orderId: string): Promise<PublicResult<any>> {
  if (!orderId) return notFound();
  const o: any = await prisma.order.findUnique({
    where: { id: String(orderId) },
    select: {
      id: true, title: true, budgetFrom: true, budgetTo: true, deadline: true, description: true, status: true,
      executorChosenAt: true, createdAt: true, updatedAt: true,
      service: { select: { id: true, name: true, section: ID_NAME } },
      selectedCustomFilterValues: CFV_SELECT,
      author: { select: PERSON_SELECT },
      executor: { select: PERSON_SELECT },
      posts: { where: { type: 'order' }, select: { id: true }, take: 1 },
      _count: { select: { responses: true, referenceFiles: true, referenceLinks: true } },
    },
  });
  if (!o || o.status === 'draft' || !o.posts?.length || isBlockedNow(o.author)) return notFound();
  const indexable = o.status === 'active' || o.status === 'done';
  const data = {
    id: o.id,
    title: maskContacts(o.title),
    description: maskContacts(o.description ?? null),
    budgetFrom: o.budgetFrom ?? null,
    budgetTo: o.budgetTo ?? null,
    deadline: o.deadline ?? null,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    service: o.service ? { id: o.service.id, name: o.service.name, section: idName(o.service.section) } : null,
    selectedCustomFilterValues: (o.selectedCustomFilterValues ?? []).map(serializeCfv),
    author: toPublicPerson(o.author, ANON_CUSTOMER_NAME),
    executor: o.executor ? toPublicPerson(o.executor) : null,
    hasExecutor: !!o.executor,
    executorChosenAt: o.executorChosenAt ?? null,
    materialsCount: (o._count?.referenceFiles ?? 0) + (o._count?.referenceLinks ?? 0),
    responsesCount: o._count?.responses ?? 0,
    postId: o.posts[0].id,
    isOwner: false,
    indexable,
  };
  return found(data, o.updatedAt ?? null, indexable);
}

/**
 * Вакансия: draft / без поста / артист REJECTED → not_found. active → ok;
 * archived (или артист на модерации) → noindex. Материалы скрыты, автор — артист.
 */
export async function getPublicVacancy(vacancyId: string): Promise<PublicResult<any>> {
  if (!vacancyId) return notFound();
  const v: any = await prisma.vacancy.findUnique({
    where: { id: String(vacancyId) },
    select: {
      id: true, title: true, workFormat: true, geography: true, employmentType: true, paymentType: true,
      compensation: true, description: true, requireComment: true, requirePortfolio: true, status: true,
      createdAt: true, updatedAt: true,
      profession: ID_NAME,
      selectedCustomFilterValues: CFV_SELECT,
      artist: { select: { id: true, slug: true, name: true, avatar: true, status: true } },
      posts: { where: { type: 'vacancy' }, select: { id: true }, take: 1 },
      _count: { select: { responses: true, referenceFiles: true, referenceLinks: true } },
    },
  });
  if (!v || v.status === 'draft' || !v.posts?.length || !v.artist || v.artist.status === 'REJECTED') return notFound();
  const indexable = v.status === 'active' && INDEXABLE_ARTIST_STATUSES.has(v.artist.status);
  const data = {
    id: v.id,
    title: maskContacts(v.title),
    description: maskContacts(v.description ?? null),
    workFormat: v.workFormat,
    geography: v.geography,
    employmentType: v.employmentType,
    paymentType: v.paymentType,
    compensation: v.compensation ?? null,
    requireComment: !!v.requireComment,
    requirePortfolio: !!v.requirePortfolio,
    status: v.status,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    profession: idName(v.profession),
    selectedCustomFilterValues: (v.selectedCustomFilterValues ?? []).map(serializeCfv),
    artist: { id: v.artist.id, slug: v.artist.slug ?? null, name: v.artist.name, avatar: v.artist.avatar ?? null, status: v.artist.status },
    materialsCount: (v._count?.referenceFiles ?? 0) + (v._count?.referenceLinks ?? 0),
    responsesCount: v._count?.responses ?? 0,
    postId: v.posts[0].id,
    isOwner: false,
    indexable,
  };
  return found(data, v.updatedAt ?? null, indexable);
}

// ─────────────────────────────────────────────────────────────────────────────
// Лента и пост
// ─────────────────────────────────────────────────────────────────────────────
//
// Форма поста — ТА ЖЕ, что у авторизованной ленты (routes/posts.ts → decoratePosts):
// isLiked/isSaved/myVote/myReaction/reactionSummary, `_count`, `comments`. Для гостя:
// comments: [] (только число в _count.comments), likes/savedBy/pollVotes: [],
// myReaction/myVote: null, автор — публичная персона, контакты в тексте маскируются.
// Ответ: массив (легаси ?offset) или { items, nextCursor } (?cursor), как у dev.

export const GUEST_FEED_MAX_LIMIT = 20;
/** Глубина гостевой ленты: дальше 200 постов — «стена» «войдите». */
export const GUEST_FEED_MAX_DEPTH = 200;
const GUEST_FEED_CACHE_TTL_MS = 60 * 1000;
const GUEST_FEED_CACHE_MAX = 300;
const guestFeedCache = new Map<string, { at: number; data: any }>();
// Ранжированный список (popular/discussed/smart) у всех гостей общий — снапшот
// на набор фильтров; страницы курсора режутся из одного и того же списка.
const GUEST_RANK_TTL_MS = 5 * 60 * 1000;
const guestRankCache = new Map<string, { at: number; ids: string[] }>();

/** Сбросить микрокэш гостевой ленты (тесты / после изменений). */
export function clearGuestFeedCache() {
  guestFeedCache.clear();
  guestRankCache.clear();
}

/**
 * Что из постов видит гость:
 *   - посты от имени артиста (артист не REJECTED) — включая вакансии;
 *   - заказы (не draft) — подпись «Заказчик на Moooza», если у автора нет согласия;
 *   - прочие посты — только авторов с согласием.
 * Посты заблокированных авторов скрыты всегда.
 */
export function guestPostVisibilityWhere(now: Date = new Date()): Prisma.PostWhereInput {
  return {
    AND: [
      { author: notBlockedWhere(now) },
      {
        OR: [
          { artistId: { not: null }, artist: { status: { not: 'REJECTED' } } },
          { type: 'order', order: { status: { not: 'draft' } } },
          { artistId: null, author: publicPersonWhere(now) },
        ],
      },
    ],
  };
}

const REPOST_SELECT = {
  id: true,
  type: true,
  title: true,
  content: true,
  imageUrl: true,
  images: true,
  audioUrl: true,
  audioName: true,
  mentions: true,
  createdAt: true,
  artistId: true,
  author: { select: PERSON_SELECT },
  artist: { select: { id: true, slug: true, name: true, avatar: true, status: true } },
  order: { select: { status: true } },
} as const;

export const GUEST_POST_SELECT = {
  id: true,
  type: true,
  title: true,
  content: true,
  category: true,
  city: true,
  imageUrl: true,
  images: true,
  audioUrl: true,
  audioName: true,
  pollOptions: true,
  pollEndsAt: true,
  tags: true,
  genres: true,
  links: true,
  mentions: true,
  repostComment: true,
  repostDeleted: true,
  repostOfId: true,
  channelId: true,
  artistId: true,
  serviceId: true,
  orderId: true,
  vacancyId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: PERSON_SELECT },
  channel: { select: { id: true, name: true, avatar: true } },
  artist: { select: { id: true, slug: true, name: true, avatar: true, status: true } },
  service: {
    select: {
      id: true,
      name: true,
      priceFrom: true,
      priceTo: true,
      priceItems: true,
      status: true,
      service: { select: { name: true, section: { select: { name: true } } } },
      profession: { select: { name: true } },
      user: { select: { city: true } },
    },
  },
  order: {
    select: {
      id: true,
      title: true,
      budgetFrom: true,
      budgetTo: true,
      deadline: true,
      status: true,
      executorId: true, // только для hasExecutor, не выдаётся
      service: { select: { name: true, section: { select: { name: true } } } },
    },
  },
  vacancy: {
    select: {
      id: true,
      title: true,
      workFormat: true,
      geography: true,
      paymentType: true,
      compensation: true,
      status: true,
      profession: { select: { name: true } },
    },
  },
  repostOf: { select: REPOST_SELECT },
  _count: {
    select: {
      likes: true,
      comments: true,
      savedBy: true,
      reactions: true,
      reposts: { where: { repostDeleted: false } },
    },
  },
} as const;

function isPostVisibleToGuest(p: any): boolean {
  if (!p) return false;
  if (isBlockedNow(p.author)) return false;
  // «Услуга» с неактивным/удалённым предложением в ленте не показывается.
  if (p.type === 'service' && 'service' in p && (!p.service || (p.service.status && p.service.status !== 'active'))) return false;
  if (p.artistId && p.artist && p.artist.status !== 'REJECTED') return true;
  if (p.type === 'order' && p.order && p.order.status !== 'draft') return true;
  if (!p.artistId && isPublicPerson(p.author)) return true;
  return false;
}

function maskLinks(links: unknown): string[] {
  if (!Array.isArray(links)) return [];
  return links
    .filter((l): l is string => typeof l === 'string')
    .map((l) => maskContacts(l))
    .filter((l) => !l.includes(CONTACT_MASK));
}

function sanitizeMentions(mentions: unknown, publicUserIds: Set<string>): any[] {
  if (!Array.isArray(mentions)) return [];
  return mentions
    .filter((m) => m && typeof m === 'object')
    .map((m: any) => {
      const type = typeof m.type === 'string' ? m.type : 'user';
      if (type === 'user') {
        return publicUserIds.has(String(m.id))
          ? { id: String(m.id), type, name: typeof m.name === 'string' ? m.name : '' }
          : { id: null, type, name: ANON_PERSON_NAME };
      }
      return { id: m.id != null ? String(m.id) : null, type, name: typeof m.name === 'string' ? m.name : '' };
    });
}

const GUEST_HTML_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 's', 'strike', 'del', 'u', 'ul', 'ol', 'li', 'blockquote', 'a', 'span'];

function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

/**
 * Контент поста для гостя. HTML (TipTap) — тот же whitelist тегов, что у dev,
 * плюс: упоминания людей без согласия → «@Участник Moooza» без data-id; ссылки
 * на контакты (t.me, wa.me, mailto…) теряют href; контакты в тексте маскируются.
 * Plain-text (легаси) — просто maskContacts.
 */
export function guestPostContent(raw: string | null | undefined, publicUserIds: Set<string>): string {
  const text = raw ?? '';
  if (!text) return '';
  if (!looksLikeHtml(text)) return maskContacts(text);
  return sanitizeHtml(text, {
    allowedTags: GUEST_HTML_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      span: ['class', 'data-type', 'data-id', 'data-label', 'data-mention-suggestion-char'],
    },
    allowedClasses: { span: ['post-mention'] },
    allowedSchemes: ['http', 'https'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_tag, attribs): sanitizeHtml.Tag => {
        const href = attribs.href;
        const attrs: sanitizeHtml.Attributes = {};
        if (href && maskContacts(href) === href) {
          attrs.href = href;
          attrs.target = '_blank';
          attrs.rel = 'noopener noreferrer nofollow';
        }
        return { tagName: 'a', attribs: attrs };
      },
      span: (_tag, attribs): sanitizeHtml.Tag => {
        const isMention = attribs['data-type'] === 'mention' || /(^|\s)post-mention(\s|$)/.test(attribs.class || '');
        if (!isMention) return { tagName: 'span', attribs: {} };
        const id = attribs['data-id'] || '';
        if (id && publicUserIds.has(id)) return { tagName: 'span', attribs };
        return { tagName: 'span', attribs: {}, text: `@${ANON_PERSON_NAME}` };
      },
    },
    textFilter: (t) => maskContacts(t),
  });
}

function collectMentionIds(p: any, into: Set<string>) {
  if (Array.isArray(p?.mentions)) {
    for (const m of p.mentions as any[]) {
      if (m && (m.type ?? 'user') === 'user' && m.id) into.add(String(m.id));
    }
  }
  if (typeof p?.content === 'string') {
    for (const mm of p.content.matchAll(/data-id="([\w-]{1,64})"/g)) into.add(mm[1]);
  }
}

function serializePoll(pollOptions: unknown): any[] | null {
  if (!Array.isArray(pollOptions)) return null;
  return pollOptions.map((o: any) => ({
    text: maskContacts(typeof o?.text === 'string' ? o.text : String(o ?? '')),
    votes: Number(o?.votes) || 0,
  }));
}

function serializeRepost(r: any, publicUserIds: Set<string>) {
  return {
    id: r.id,
    type: r.type,
    title: maskContacts(r.title ?? null),
    content: guestPostContent(r.content, publicUserIds),
    imageUrl: r.imageUrl ?? null,
    images: r.images ?? [],
    audioUrl: r.audioUrl ?? null,
    audioName: r.audioName ?? null,
    mentions: sanitizeMentions(r.mentions, publicUserIds),
    createdAt: r.createdAt,
    artistId: r.artist && r.artist.status !== 'REJECTED' ? r.artistId ?? null : null,
    author: toPublicPerson(r.author, r.type === 'order' ? ANON_CUSTOMER_NAME : ANON_PERSON_NAME),
    artist: r.artist ? { id: r.artist.id, slug: r.artist.slug ?? null, name: r.artist.name, avatar: r.artist.avatar ?? null } : null,
  };
}

function serializeGuestPost(
  p: any,
  reactionSummary: Map<string, Array<{ emoji: string; count: number }>>,
  publicUserIds: Set<string>,
) {
  const author = toPublicPerson(p.author, p.type === 'order' ? ANON_CUSTOMER_NAME : ANON_PERSON_NAME);
  const repostVisible = !!p.repostOf && isPostVisibleToGuest(p.repostOf);
  const counts = p._count ?? {};
  return {
    id: p.id,
    type: p.type,
    title: maskContacts(p.title ?? null),
    content: guestPostContent(p.content, publicUserIds),
    category: p.category ?? null,
    city: p.city ?? null,
    imageUrl: p.imageUrl ?? null,
    images: p.images ?? [],
    audioUrl: p.audioUrl ?? null,
    audioName: p.audioName ?? null,
    pollOptions: serializePoll(p.pollOptions),
    pollEndsAt: p.pollEndsAt ?? null,
    tags: p.tags ?? [],
    genres: p.genres ?? [],
    links: maskLinks(p.links),
    mentions: sanitizeMentions(p.mentions, publicUserIds),
    repostComment: maskContacts(p.repostComment ?? null),
    repostDeleted: !!p.repostDeleted,
    repostOfId: repostVisible ? p.repostOfId : null,
    repostOf: repostVisible ? serializeRepost(p.repostOf, publicUserIds) : null,
    repostHidden: !!p.repostOfId && !repostVisible,
    channelId: p.channelId ?? null,
    artistId: p.artistId ?? null,
    serviceId: p.serviceId ?? null,
    orderId: p.orderId ?? null,
    vacancyId: p.vacancyId ?? null,
    author,
    channel: p.channel ? { id: p.channel.id, name: p.channel.name, avatar: p.channel.avatar ?? null } : null,
    artist: p.artist ? { id: p.artist.id, slug: p.artist.slug ?? null, name: p.artist.name, avatar: p.artist.avatar ?? null } : null,
    service: p.service
      ? {
          id: p.service.id,
          name: maskContacts(p.service.name ?? null),
          priceFrom: p.service.priceFrom ?? null,
          priceTo: p.service.priceTo ?? null,
          priceItems: p.service.priceItems != null ? maskContactsDeep(p.service.priceItems) : null,
          service: p.service.service
            ? { name: p.service.service.name, section: p.service.service.section ? { name: p.service.service.section.name } : null }
            : null,
          profession: p.service.profession ? { name: p.service.profession.name } : null,
          // исполнитель услуги = автор поста (виден, т.к. у автора есть согласие)
          user: { ...author, city: p.service.user?.city ?? null },
        }
      : null,
    order: p.order
      ? {
          id: p.order.id,
          title: maskContacts(p.order.title),
          budgetFrom: p.order.budgetFrom ?? null,
          budgetTo: p.order.budgetTo ?? null,
          deadline: p.order.deadline ?? null,
          status: p.order.status,
          // вместо executorId (id человека) — только признак
          hasExecutor: !!p.order.executorId,
          service: p.order.service
            ? { name: p.order.service.name, section: p.order.service.section ? { name: p.order.service.section.name } : null }
            : null,
        }
      : null,
    vacancy: p.vacancy
      ? {
          id: p.vacancy.id,
          title: maskContacts(p.vacancy.title),
          workFormat: p.vacancy.workFormat,
          geography: p.vacancy.geography,
          paymentType: p.vacancy.paymentType,
          compensation: p.vacancy.compensation ?? null,
          status: p.vacancy.status,
          profession: p.vacancy.profession ? { name: p.vacancy.profession.name } : null,
        }
      : null,
    // Комментарии гостю не показываются — только их число (_count.comments).
    comments: [],
    likes: [],
    savedBy: [],
    pollVotes: [],
    _count: {
      likes: counts.likes ?? 0,
      comments: counts.comments ?? 0,
      savedBy: counts.savedBy ?? 0,
      reactions: counts.reactions ?? 0,
      reposts: counts.reposts ?? 0,
    },
    isLiked: false,
    isSaved: false,
    myVote: null,
    myReaction: null,
    // Реакции — только агрегатом по эмодзи (без userId), как в dev.
    reactionSummary: reactionSummary.get(p.id) ?? [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const REACTION_ORDER = ['👍', '👎', '👌', '😢', '😂', '🔥', '❤️'];

async function serializeGuestPosts(rawPosts: any[]): Promise<any[]> {
  // Видимость задана в where; повторяем проверку в памяти (defense in depth).
  const posts = rawPosts.filter(isPostVisibleToGuest);
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);
  // groupBy типизируется через сложный generic — приводим к any (форма запроса проверена тестами)
  const grouped: any[] = await (prisma.postReaction.groupBy as any)({
    by: ['postId', 'emoji'],
    where: { postId: { in: ids } },
    _count: { _all: true },
  });
  const summary = new Map<string, Array<{ emoji: string; count: number }>>();
  for (const g of grouped ?? []) {
    const list = summary.get(g.postId) ?? [];
    list.push({ emoji: g.emoji, count: g._count?._all ?? 0 });
    summary.set(g.postId, list);
  }
  for (const list of summary.values()) {
    list.sort((a, b) => b.count - a.count || REACTION_ORDER.indexOf(a.emoji) - REACTION_ORDER.indexOf(b.emoji));
  }

  const mentionIds = new Set<string>();
  for (const p of posts) {
    collectMentionIds(p, mentionIds);
    if (p.repostOf) collectMentionIds(p.repostOf, mentionIds);
  }
  let publicUserIds = new Set<string>();
  if (mentionIds.size > 0) {
    const rows = await prisma.user.findMany({
      where: { AND: [{ id: { in: [...mentionIds].slice(0, 500) } }, publicPersonWhere()] },
      select: { id: true },
    });
    publicUserIds = new Set((rows ?? []).map((r: any) => r.id));
  }
  return posts.map((p) => serializeGuestPost(p, summary, publicUserIds));
}

/** Пост по id для гостя (те же правила видимости и та же форма, что в ленте). */
export async function getPublicPost(postId: string): Promise<PublicResult<any>> {
  if (!postId) return notFound();
  const post = await prisma.post.findFirst({
    where: {
      AND: [
        { id: String(postId) },
        guestPostVisibilityWhere(),
        { NOT: [{ type: 'service', service: { status: { not: 'active' } } }, { type: 'service', serviceId: null }] },
      ],
    },
    select: GUEST_POST_SELECT,
  });
  if (!post) return notFound();
  const [data] = await serializeGuestPosts([post]);
  if (!data) return notFound();
  return found(data, (post as any).updatedAt ?? null, true);
}

export interface PublicFeedParams extends FeedFilterQuery {
  sort?: unknown;
  limit?: unknown;
  offset?: unknown;
  /** undefined — легаси-ответ массивом; строка ('' — первая страница) — { items, nextCursor }. */
  cursor?: unknown;
}

const GUEST_FEED_SORTS = ['new', 'popular', 'discussed', 'smart'];
const ISO_ID_CURSOR_RE = /^g(\d{1,4}):(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\|([\w-]{1,64})$/;
const DEPTH_CURSOR_RE = /^g(\d{1,4})$/;

async function guestRankedIds(sort: string, where: Prisma.PostWhereInput, key: string): Promise<string[]> {
  const now = Date.now();
  const hit = guestRankCache.get(key);
  if (hit && now - hit.at < GUEST_RANK_TTL_MS) return hit.ids;
  let ids: string[];
  if (sort === 'discussed') {
    const rows: any[] = await prisma.post.findMany({
      where,
      select: { id: true },
      orderBy: [{ comments: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }],
      take: GUEST_FEED_MAX_DEPTH,
    });
    ids = rows.map((r) => r.id);
  } else {
    const cands: any[] = await prisma.post.findMany({
      where,
      select: {
        id: true, createdAt: true, authorId: true,
        _count: { select: { likes: true, reactions: true, comments: true, savedBy: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 600,
    });
    if (sort === 'popular') {
      ids = cands
        .map((p) => ({
          id: p.id,
          t: new Date(p.createdAt).getTime(),
          s: p._count.likes + p._count.reactions + 1.5 * p._count.savedBy + 0.5 * p._count.comments,
        }))
        .sort((a, b) => b.s - a.s || b.t - a.t)
        .map((x) => x.id);
    } else {
      // smart для гостя — глобальный тренд без персонализации (как dev для гостя).
      const HALF_LIFE_H = 20;
      const scored = cands.map((p) => {
        const ageH = Math.max(0, (now - new Date(p.createdAt).getTime()) / 3_600_000);
        const freshness = Math.pow(0.5, ageH / HALF_LIFE_H);
        const c = p._count;
        const eng = Math.log1p(c.reactions + 2 * c.comments + 0.5 * c.likes + 1.5 * c.savedBy);
        return { id: p.id, authorId: p.authorId, score: freshness * (1 + 0.6 * eng) };
      });
      scored.sort((a, b) => b.score - a.score);
      ids = diversifyByAuthor(scored).map((x) => x.id);
    }
  }
  ids = ids.slice(0, GUEST_FEED_MAX_DEPTH);
  if (guestRankCache.size >= GUEST_FEED_CACHE_MAX) guestRankCache.clear();
  guestRankCache.set(key, { at: now, ids });
  return ids;
}

/**
 * Страница гостевой ленты: limit ≤ 20, глубина ≤ 200 (дальше — пусто, nextCursor
 * null), фильтры — как у авторизованной ленты (lib/feedQuery), видимость —
 * guestPostVisibilityWhere, без комментариев, реакции агрегатом.
 * sort: new (по умолчанию) | popular | discussed | smart (глобальный тренд).
 * Пагинация: ?offset (ответ — массив) или ?cursor (ответ — { items, nextCursor },
 * курсор непрозрачный: `g<глубина>[:<ISO>|<id>]`). Микрокэш 60 с.
 */
export async function getPublicFeedPage(params: PublicFeedParams = {}): Promise<PublicResult<any>> {
  const useCursor = params.cursor !== undefined && params.cursor !== null;
  const cursorStr = useCursor ? String(params.cursor) : '';
  const limitRaw = clampInt(params.limit, GUEST_FEED_MAX_LIMIT, 1, GUEST_FEED_MAX_LIMIT);
  const sortRaw = params.sort ? String(params.sort) : 'new';
  const sort = GUEST_FEED_SORTS.includes(sortRaw) ? sortRaw : 'new';

  // Глубина (сколько постов уже пролистано) и позиция keyset-курсора.
  let depth = 0;
  let keyset: { at: Date; id: string } | null = null;
  if (useCursor) {
    const m1 = ISO_ID_CURSOR_RE.exec(cursorStr);
    const m2 = DEPTH_CURSOR_RE.exec(cursorStr);
    if (m1) {
      depth = Number(m1[1]);
      const at = new Date(m1[2]);
      if (!Number.isNaN(at.getTime())) keyset = { at, id: m1[3] };
    } else if (m2) {
      depth = Number(m2[1]);
    }
  } else {
    depth = clampInt(params.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  }
  const empty = useCursor ? { items: [], nextCursor: null } : [];
  if (depth >= GUEST_FEED_MAX_DEPTH) return found(empty, null, true);
  const limit = Math.min(limitRaw, GUEST_FEED_MAX_DEPTH - depth);

  const filterKey = JSON.stringify([
    String(params.type ?? ''), String(params.authorKind ?? ''), String(params.period ?? ''), String(params.city ?? ''),
    String(params.employment ?? ''), String(params.artistType ?? ''), String(params.genre ?? ''),
  ]);
  const cacheKey = JSON.stringify([sort, useCursor ? `c:${cursorStr}` : `o:${depth}`, limit, filterKey]);
  const nowMs = Date.now();
  const cached = guestFeedCache.get(cacheKey);
  if (cached && nowMs - cached.at < GUEST_FEED_CACHE_TTL_MS) return found(cached.data, null, true);

  const team = await prisma.user.findUnique({ where: { email: TEAM_EMAIL }, select: { id: true } });
  const { where: filterWhere } = buildFeedWhere(params, { viewerId: null, teamUserId: team?.id ?? null });
  const where: Prisma.PostWhereInput = { AND: [filterWhere, guestPostVisibilityWhere()] };

  let posts: any[];
  let nextCursor: string | null = null;
  if (sort !== 'new') {
    const ids = await guestRankedIds(sort, where, `${sort}|${filterKey}`);
    const pageIds = ids.slice(depth, depth + limit);
    posts = pageIds.length
      ? await prisma.post.findMany({ where: { AND: [{ id: { in: pageIds } }, guestPostVisibilityWhere()] }, select: GUEST_POST_SELECT })
      : [];
    const orderMap = new Map(pageIds.map((id, i) => [id, i]));
    posts.sort((a, b) => (orderMap.get(a.id)! - orderMap.get(b.id)!));
    if (depth + limit < ids.length) nextCursor = `g${depth + limit}`;
  } else if (useCursor) {
    const keysetWhere: Prisma.PostWhereInput | null = keyset
      ? { OR: [{ createdAt: { lt: keyset.at } }, { createdAt: keyset.at, id: { lt: keyset.id } }] }
      : null;
    const rows: any[] = await prisma.post.findMany({
      where: keysetWhere ? { AND: [where, keysetWhere] } : where,
      select: GUEST_POST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    posts = rows.slice(0, limit);
    const last = posts[posts.length - 1];
    if (rows.length > limit && last && depth + limit < GUEST_FEED_MAX_DEPTH) {
      nextCursor = `g${depth + limit}:${new Date(last.createdAt).toISOString()}|${last.id}`;
    }
  } else {
    posts = await prisma.post.findMany({
      where,
      select: GUEST_POST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: depth,
    });
  }

  const items = await serializeGuestPosts(posts);
  const data = useCursor ? { items, nextCursor } : items;
  if (guestFeedCache.size >= GUEST_FEED_CACHE_MAX) guestFeedCache.clear();
  guestFeedCache.set(cacheKey, { at: nowMs, data });
  return found(data, null, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Каталоги для SEO-снимка /search (Ф4) — те же правила видимости, что у JSON
// ─────────────────────────────────────────────────────────────────────────────

export const SEO_CATALOG_LIMIT = 50;

/** Артисты каталога (/search?tab=artists): только VERIFIED — как references/artists. */
export async function getPublicArtistCatalog(take: number = SEO_CATALOG_LIMIT): Promise<PublicResult<any[]>> {
  const rows: any[] = await prisma.artist.findMany({
    where: { status: 'VERIFIED' },
    orderBy: [{ listeners: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(Math.max(1, take), 100),
    select: {
      id: true, slug: true, name: true, type: true, city: true, avatar: true, status: true, updatedAt: true,
      genres: { select: { genre: ID_NAME } },
    },
  });
  const data = (rows ?? [])
    .filter((a) => a && a.status === 'VERIFIED')
    .map((a) => ({
      id: a.id,
      slug: a.slug ?? null,
      name: a.name,
      type: a.type ?? null,
      city: a.city ?? null,
      avatar: a.avatar ?? null,
      genres: (a.genres ?? []).map((g: any) => idName(g.genre)).filter(Boolean),
    }));
  return found(data, maxDate(...(rows ?? []).map((a) => a.updatedAt)), true);
}

/** Люди каталога (/search?tab=people): согласие, без запрета индексации, с аватаром. */
export async function getPublicPeopleCatalog(take: number = SEO_CATALOG_LIMIT): Promise<PublicResult<any[]>> {
  const rows: any[] = await prisma.user.findMany({
    where: { AND: [publicPersonWhere(), { searchIndexingOptOut: false }, { avatar: { not: null } }] },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(1, take), 100),
    select: {
      ...PERSON_SELECT,
      city: true,
      searchIndexingOptOut: true,
      userProfessions: { select: { profession: { select: { name: true } } }, take: 3 },
    },
  });
  const visible = (rows ?? []).filter((u) => isPublicPerson(u) && !u.searchIndexingOptOut);
  const data = visible.map((u) => ({
    ...toPublicPerson(u),
    city: u.city ?? null,
    professions: (u.userProfessions ?? []).map((up: any) => up?.profession?.name).filter(Boolean),
  }));
  return found(data, null, true);
}

/** Услуги каталога (/search): active, исполнитель с согласием и без запрета индексации. */
export async function getPublicServiceCatalog(take: number = SEO_CATALOG_LIMIT): Promise<PublicResult<any[]>> {
  const rows: any[] = await prisma.userService.findMany({
    where: { status: 'active', user: { AND: [publicPersonWhere(), { searchIndexingOptOut: false }] } },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(1, take), 100),
    select: {
      id: true, name: true, priceFrom: true, priceTo: true, status: true, updatedAt: true,
      profession: { select: { name: true } },
      service: { select: { name: true, section: { select: { name: true } } } },
      user: { select: { ...PERSON_SELECT, city: true, searchIndexingOptOut: true } },
    },
  });
  const visible = (rows ?? []).filter((r) => r && r.status === 'active' && isPublicPerson(r.user) && !r.user.searchIndexingOptOut);
  const data = visible.map((r) => ({
    id: r.id,
    name: maskContacts(r.name ?? null),
    priceFrom: r.priceFrom ?? null,
    priceTo: r.priceTo ?? null,
    profession: r.profession?.name ?? null,
    service: r.service?.name ?? null,
    section: r.service?.section?.name ?? null,
    user: { ...toPublicPerson(r.user), city: r.user.city ?? null },
  }));
  return found(data, maxDate(...visible.map((r) => r.updatedAt)), true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sitemap (Ф4, план раздел E) — только адреса и даты, только индексируемое
// ─────────────────────────────────────────────────────────────────────────────

export interface SitemapEntry {
  /** Путь от корня сайта: /artist/<slug>, /releases/<id>… */
  path: string;
  /** null — без <lastmod> (профили, статика). */
  lastmod: Date | null;
}

/** Потолок строк на тип (защита памяти); нарезка по 45 000 — в seo/sitemap.ts. */
export const SITEMAP_MAX_ROWS = 450_000;
/** Профиль попадает в sitemap не раньше, чем через 14 дней после согласия (план, раздел F). */
export const PROFILE_SITEMAP_DELAY_DAYS = 14;

const SITEMAP_ARTIST_STATUSES = ['VERIFIED', 'APPROVED'] as const;

async function pagedFindMany<T extends { id: string }>(
  fetchPage: (cursor: string | null, take: number) => Promise<T[]>,
  pageSize = 5_000,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  while (out.length < SITEMAP_MAX_ROWS) {
    const page: T[] = (await fetchPage(cursor, pageSize)) ?? [];
    out.push(...page);
    if (page.length < pageSize) break;
    cursor = page[page.length - 1].id;
  }
  return out.slice(0, SITEMAP_MAX_ROWS);
}

function cursorArgs(cursor: string | null): { cursor?: { id: string }; skip?: number } {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {};
}

/** Артисты VERIFIED/APPROVED «с контентом» (релиз, клип или описание); адрес — по слагу. */
export async function listSitemapArtists(): Promise<SitemapEntry[]> {
  const rows = await pagedFindMany<any>((cursor, take) => prisma.artist.findMany({
    where: {
      status: { in: [...SITEMAP_ARTIST_STATUSES] },
      OR: [
        { releases: { some: {} } },
        { clips: { some: {} } },
        { AND: [{ description: { not: null } }, { NOT: { description: '' } }] },
      ],
    },
    select: {
      id: true, slug: true, status: true, updatedAt: true,
      releases: { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
      clips: { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
    },
    orderBy: { id: 'asc' },
    take,
    ...cursorArgs(cursor),
  }));
  return rows
    .filter((a) => (SITEMAP_ARTIST_STATUSES as readonly string[]).includes(a.status))
    .map((a) => ({
      path: `/artist/${encodeURIComponent(a.slug || a.id)}`,
      lastmod: maxDate(a.updatedAt, a.releases?.[0]?.updatedAt, a.clips?.[0]?.updatedAt),
    }));
}

/** Релизы индексируемых артистов (VERIFIED/APPROVED). */
export async function listSitemapReleases(): Promise<SitemapEntry[]> {
  const rows = await pagedFindMany<any>((cursor, take) => prisma.release.findMany({
    where: { artist: { status: { in: [...SITEMAP_ARTIST_STATUSES] } } },
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' },
    take,
    ...cursorArgs(cursor),
  }));
  return rows.map((r) => ({ path: `/releases/${encodeURIComponent(r.id)}`, lastmod: r.updatedAt ?? null }));
}

/** Клипы индексируемых артистов (VERIFIED/APPROVED). */
export async function listSitemapClips(): Promise<SitemapEntry[]> {
  const rows = await pagedFindMany<any>((cursor, take) => prisma.clip.findMany({
    where: { artist: { status: { in: [...SITEMAP_ARTIST_STATUSES] } } },
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' },
    take,
    ...cursorArgs(cursor),
  }));
  return rows.map((c) => ({ path: `/clips/${encodeURIComponent(c.id)}`, lastmod: c.updatedAt ?? null }));
}

/**
 * Профили: согласие (не раньше 14 дней назад), не заблокирован, без запрета
 * индексации, порог качества (meetsProfileQuality). Без lastmod: updatedAt
 * пользователя меняется от служебных полей (lastSeenAt) и ничего не говорит о странице.
 */
export async function listSitemapProfiles(now: Date = new Date()): Promise<SitemapEntry[]> {
  const consentBefore = new Date(now.getTime() - PROFILE_SITEMAP_DELAY_DAYS * 86_400_000);
  const rows = await pagedFindMany<any>((cursor, take) => prisma.user.findMany({
    where: {
      AND: [
        publicPersonWhere(now),
        { publicConsentAt: { lte: consentBefore } },
        { searchIndexingOptOut: false },
        { avatar: { not: null } },
      ],
    },
    select: {
      id: true, avatar: true, bio: true, publicConsentAt: true, isBlocked: true, blockedUntil: true,
      searchIndexingOptOut: true,
      _count: {
        select: {
          userServices: { where: { status: 'active' } },
          userArtists: { where: { inviteStatus: 'ACCEPTED', artist: { status: { not: 'REJECTED' } } } },
        },
      },
    },
    orderBy: { id: 'asc' },
    take,
    ...cursorArgs(cursor),
  }));
  return rows
    .filter((u) => isPublicPerson(u, now) && !u.searchIndexingOptOut)
    .filter((u) => !u.publicConsentAt || new Date(u.publicConsentAt) <= consentBefore)
    .filter((u) => meetsProfileQuality({
      avatar: u.avatar,
      bio: u.bio,
      servicesCount: u._count?.userServices ?? 0,
      artistsCount: u._count?.userArtists ?? 0,
    }))
    .map((u) => ({ path: `/profile/${encodeURIComponent(u.id)}`, lastmod: null }));
}

/** Активные услуги исполнителей с согласием и без запрета индексации. */
export async function listSitemapServices(): Promise<SitemapEntry[]> {
  const rows = await pagedFindMany<any>((cursor, take) => prisma.userService.findMany({
    where: { status: 'active', user: { AND: [publicPersonWhere(), { searchIndexingOptOut: false }] } },
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' },
    take,
    ...cursorArgs(cursor),
  }));
  return rows.map((s) => ({ path: `/services/${encodeURIComponent(s.id)}`, lastmod: s.updatedAt ?? null }));
}

/** Активные вакансии с постом в ленте у индексируемых артистов. */
export async function listSitemapVacancies(): Promise<SitemapEntry[]> {
  const rows = await pagedFindMany<any>((cursor, take) => prisma.vacancy.findMany({
    where: {
      status: 'active',
      posts: { some: { type: 'vacancy' } },
      artist: { status: { in: [...SITEMAP_ARTIST_STATUSES] } },
    },
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' },
    take,
    ...cursorArgs(cursor),
  }));
  return rows.map((v) => ({ path: `/vacancies/${encodeURIComponent(v.id)}`, lastmod: v.updatedAt ?? null }));
}

/** Активные заказы с постом в ленте, автор не заблокирован. */
export async function listSitemapOrders(): Promise<SitemapEntry[]> {
  const rows = await pagedFindMany<any>((cursor, take) => prisma.order.findMany({
    where: {
      status: 'active',
      posts: { some: { type: 'order' } },
      author: notBlockedWhere(),
    },
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' },
    take,
    ...cursorArgs(cursor),
  }));
  return rows.map((o) => ({ path: `/orders/${encodeURIComponent(o.id)}`, lastmod: o.updatedAt ?? null }));
}
