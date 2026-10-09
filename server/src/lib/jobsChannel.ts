/**
 * Автопостинг новых заказов и вакансий в ОДИН общий Telegram-канал с хэштегами
 * (решение владельца: один канал + хэштеги #город #профессия #жанр #удалённо).
 *
 * Включение:
 *   - env TELEGRAM_JOBS_CHANNEL_ID (@moooza_jobs или -100…) + TELEGRAM_BOT_TOKEN
 *     (основной бот, НЕ лог-бот; он должен быть админом канала). Нет env — всё
 *     молча выключено (DEV): hook даже не делает лишних запросов в БД;
 *   - SiteSetting jobsChannelEnabled = 'true' (по умолчанию 'false', включает админ);
 *   - SiteSetting jobsChannelEnabledAt — момент включения: публикуются только
 *     заказы/вакансии, созданные или опубликованные ПОСЛЕ него (без «задним числом»).
 *
 * Что публикуется — только то, что видит гость (зеркало getPublicOrder /
 * getPublicVacancy в lib/publicData): заказ active, с постом в ленте, автор не
 * заблокирован, исполнитель ещё не выбран; вакансия active, с постом, артист не
 * REJECTED. Без ПДн заказчика (имя не публикуется), контакты в тексте маскируются.
 *
 * Жизненный цикл (Order/Vacancy.telegram*):
 *   - публикация ОДИН раз: условный updateMany по telegramMessageId IS NULL AND
 *     telegramPostedAt IS NULL «застолбляет» отправку (гонки, повторные события),
 *     после ответа Telegram сохраняется telegramMessageId;
 *   - закрытие (done/archived/черновик/выбран исполнитель/удаление/скрыто) —
 *     editMessageText: «⛔ Закрыто», кнопка убирается (telegramClosedAt);
 *   - повторная публикация закрытого (archived → active) — тот же пост снова
 *     открывается (кнопка возвращается), новое сообщение не создаётся.
 * Всё best-effort: ошибка Telegram/релея логируется и не роняет запрос.
 *
 * Триггеры — Prisma-middleware lib/jobsChannelHook (create/update/delete Order,
 * Vacancy, Post заказа/вакансии…) → scheduleJobSync: отложенно (после коммита),
 * со слиянием повторных событий, с повторной загрузкой сущности из БД.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../index';
import logger from '../utils/logger';
import { escTg } from '../utils/telegram';
import { callBotApi, BotApiResult } from '../utils/telegramNotify';
import { maskContacts } from './maskContacts';
import { parseCalendarDay } from './mskDate';
import { formatRub } from '../seo/html';
import { PAYMENT_LABELS, EMPLOYMENT_LABELS, GEOGRAPHY_LABELS, WORK_FORMAT_LABELS } from '../seo/render/labels';

export type JobKind = 'order' | 'vacancy';

// ─────────────────────────────────────────────────────────────────────────────
// Настройки
// ─────────────────────────────────────────────────────────────────────────────

export const JOBS_CHANNEL_FLAG_KEY = 'jobsChannelEnabled';
export const JOBS_CHANNEL_ENABLED_AT_KEY = 'jobsChannelEnabledAt';

export const JOBS_CHANNEL_BUTTON_TEXT = 'Откликнуться на Moooza';
export const JOBS_CHANNEL_UTM = 'utm_source=telegram&utm_medium=channel';
/** Сколько символов описания попадает в пост (1–2 строки). */
export const JOBS_DESCRIPTION_MAX = 300;

/** Канал из env (читается при вызове). */
export function jobsChannelId(): string {
  return (process.env.TELEGRAM_JOBS_CHANNEL_ID || '').trim();
}

/** Есть ли канал и токен основного бота. Нет — фича молча выключена. */
export function isJobsChannelConfigured(): boolean {
  return !!(jobsChannelId() && (process.env.TELEGRAM_BOT_TOKEN || '').trim());
}

function appUrl(): string {
  return (process.env.APP_URL || 'https://moooza.ru').replace(/\/+$/, '');
}

export interface JobsChannelSettings {
  enabled: boolean;
  enabledAt: Date | null;
}

/**
 * Флаг и момент включения из SiteSetting. Флаг включён, а момента нет (флаг
 * выставили в БД вручную) — момент фиксируется сейчас: «с этого момента».
 */
export async function getJobsChannelSettings(): Promise<JobsChannelSettings> {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [JOBS_CHANNEL_FLAG_KEY, JOBS_CHANNEL_ENABLED_AT_KEY] } },
  });
  const map = new Map<string, string>((rows ?? []).map((r: any) => [r.key, r.value]));
  const enabled = map.get(JOBS_CHANNEL_FLAG_KEY) === 'true';
  let enabledAt: Date | null = null;
  const raw = map.get(JOBS_CHANNEL_ENABLED_AT_KEY);
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) enabledAt = d;
  }
  if (enabled && !enabledAt) {
    enabledAt = new Date();
    await prisma.siteSetting.upsert({
      where: { key: JOBS_CHANNEL_ENABLED_AT_KEY },
      update: {},
      create: { key: JOBS_CHANNEL_ENABLED_AT_KEY, value: enabledAt.toISOString() },
    }).catch(() => { /* best-effort */ });
  }
  return { enabled, enabledAt };
}

// ─────────────────────────────────────────────────────────────────────────────
// Загрузка сущностей (всё, что нужно и для проверки публичности, и для текста)
// ─────────────────────────────────────────────────────────────────────────────

const CFV_JOB_SELECT = { select: { value: true, filter: { select: { name: true } } } } as const;

/**
 * Скаляры заказа берутся целиком (include, а не select): если у заказа появятся
 * поля города/формата (city, workFormat), они подхватятся без правки запроса.
 */
export const ORDER_JOB_INCLUDE = {
  service: {
    select: {
      name: true,
      section: { select: { name: true } },
      serviceProfessions: {
        select: { profession: { select: { name: true } } },
        orderBy: { profession: { name: 'asc' } },
      },
    },
  },
  selectedCustomFilterValues: CFV_JOB_SELECT,
  author: { select: { isBlocked: true, blockedUntil: true } },
  posts: {
    where: { type: 'order' },
    select: { id: true, createdAt: true, city: true, genres: true },
    orderBy: { createdAt: 'asc' },
    take: 1,
  },
} satisfies Prisma.OrderInclude;

export const VACANCY_JOB_INCLUDE = {
  profession: { select: { name: true } },
  selectedCustomFilterValues: CFV_JOB_SELECT,
  artist: {
    select: {
      name: true,
      status: true,
      city: true,
      genres: { select: { genre: { select: { name: true, sortOrder: true } } } },
    },
  },
  posts: {
    where: { type: 'vacancy' },
    select: { id: true, createdAt: true, city: true, genres: true },
    orderBy: { createdAt: 'asc' },
    take: 1,
  },
} satisfies Prisma.VacancyInclude;

function delegate(kind: JobKind): any {
  return kind === 'order' ? prisma.order : prisma.vacancy;
}

function includeFor(kind: JobKind): any {
  return kind === 'order' ? ORDER_JOB_INCLUDE : VACANCY_JOB_INCLUDE;
}

/** Строка заказа/вакансии со всем нужным для поста. */
export async function loadJob(kind: JobKind, id: string): Promise<any | null> {
  if (!id) return null;
  return delegate(kind).findUnique({ where: { id: String(id) }, include: includeFor(kind) });
}

/** То же для набора условий (снимок перед deleteMany). Только уже опубликованные. */
export async function loadPostedJobs(kind: JobKind, where: unknown, take = 100): Promise<any[]> {
  const rows = await delegate(kind).findMany({
    where: { AND: [where ?? {}, { telegramMessageId: { not: null } }, { telegramClosedAt: null }] },
    include: includeFor(kind),
    take,
  });
  return rows ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Публичность (зеркало lib/publicData)
// ─────────────────────────────────────────────────────────────────────────────

function isBlockedNow(u: { isBlocked?: boolean | null; blockedUntil?: Date | null } | null | undefined, now: Date): boolean {
  if (!u) return true;
  if (u.isBlocked) return true;
  return !!(u.blockedUntil && new Date(u.blockedUntil) >= now);
}

/**
 * «Открыт» = виден гостю и принимает отклики: только такие публикуются, а
 * опубликованные, переставшие быть открытыми, помечаются «Закрыто».
 *  - заказ: active, есть пост в ленте, автор не заблокирован, исполнитель не выбран
 *    (getPublicOrder: draft / без поста / автор заблокирован → 404);
 *  - вакансия: active, есть пост, артист есть и не REJECTED (getPublicVacancy).
 */
export function isJobOpen(kind: JobKind, row: any, now: Date = new Date()): boolean {
  if (!row || row.status !== 'active' || !row.posts?.length) return false;
  if (kind === 'order') return !row.executorId && !isBlockedNow(row.author, now);
  return !!row.artist && row.artist.status !== 'REJECTED';
}

// ─────────────────────────────────────────────────────────────────────────────
// Текст поста (чистые функции — покрыты тестами)
// ─────────────────────────────────────────────────────────────────────────────

function countLetters(s: string): number {
  return (s.match(/\p{L}/gu) ?? []).length;
}

/**
 * Хэштег из названия: кириллица как есть, без пробелов/дефисов/знаков, нижний
 * регистр. «Нижний Новгород» → #нижнийновгород, «Хип-Хоп» → #хипхоп,
 * «Вокалист / Вокалистка» → #вокалист (первый вариант), «Диджей (DJ)» → #диджей,
 * «R&B» → #rnb. Пусто / без букв → null.
 */
export function toHashtag(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).replace(/\([^)]*\)/g, ' ');
  const parts = s.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && countLetters(parts[0]) >= 3) s = parts[0];
  s = s.toLowerCase().replace(/&/g, 'n').replace(/[^\p{L}\p{N}_]+/gu, '');
  if (!s || !/\p{L}/u.test(s)) return null;
  return `#${Array.from(s).slice(0, 40).join('')}`;
}

/** Значения-«заглушки», которые не делаем жанровым тегом. */
const GENRE_SKIP_TAGS = new Set(['#любойжанр', '#openformat', '#любой', '#другое', '#другой']);
const GENRE_FILTER_RE = /жанр/i;
const WORK_FORMAT_FILTER_RE = /формат/i;
const REMOTE_VALUE_RE = /удал[её]нн|онлайн/i;
const MAX_GENRE_TAGS = 2;

type CfvLike = { value?: string | null; filter?: { name?: string | null } | null };

function cfvValues(row: any, filterRe: RegExp): string[] {
  return ((row?.selectedCustomFilterValues ?? []) as CfvLike[])
    .filter((v) => v?.value && filterRe.test(v.filter?.name ?? ''))
    .map((v) => String(v.value));
}

/** До двух жанров: жанры поста → значения фильтров «Жанр…» → жанры артиста (вакансия). */
export function pickGenres(kind: JobKind, row: any): string[] {
  const candidates: string[] = [
    ...((row?.posts?.[0]?.genres ?? []) as string[]),
    ...cfvValues(row, GENRE_FILTER_RE),
  ];
  if (kind === 'vacancy') {
    const artistGenres = ((row?.artist?.genres ?? []) as any[])
      .map((g) => g?.genre)
      .filter(Boolean)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'ru'))
      .map((g) => String(g.name));
    candidates.push(...artistGenres);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of candidates) {
    const tag = toHashtag(name);
    if (!tag || GENRE_SKIP_TAGS.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(name);
    if (out.length >= MAX_GENRE_TAGS) break;
  }
  return out;
}

/** Профессии для тега: вакансия — её профессия; заказ — профессии услуги каталога (до 2). */
export function pickProfessions(kind: JobKind, row: any): string[] {
  if (kind === 'vacancy') return row?.profession?.name ? [String(row.profession.name)] : [];
  const names = ((row?.service?.serviceProfessions ?? []) as any[])
    .map((sp) => sp?.profession?.name)
    .filter(Boolean)
    .map(String);
  return names.length ? names.slice(0, 2) : (row?.service?.name ? [String(row.service.name)] : []);
}

/** Город и «удалённо». Город заказа — из поля заказа (если появится) или поста. */
export function jobLocation(kind: JobKind, row: any): { city: string | null; remote: boolean } {
  const postCity: string | null = row?.posts?.[0]?.city ?? null;
  if (kind === 'vacancy') {
    const remote = row?.workFormat === 'online';
    const city = remote ? null : (postCity || row?.artist?.city || null);
    return { city: city ? String(city).trim() || null : null, remote };
  }
  const city = (typeof row?.city === 'string' && row.city.trim()) || postCity || null;
  const remote = row?.workFormat === 'online'
    || row?.isRemote === true
    || cfvValues(row, WORK_FORMAT_FILTER_RE).some((v) => REMOTE_VALUE_RE.test(v));
  return { city: city ? String(city).trim() || null : null, remote };
}

/** Хэштеги поста: #город #профессия #жанр (до 2) #удалённо — без дублей. */
export function buildHashtags(kind: JobKind, row: any): string[] {
  const { city, remote } = jobLocation(kind, row);
  const tags: string[] = [];
  const push = (t: string | null) => { if (t && !tags.includes(t)) tags.push(t); };
  // Город артиста — свободный текст: «Москва, Россия» → #москва.
  push(toHashtag(city ? city.split(/[,;(]/)[0] : null));
  for (const p of pickProfessions(kind, row)) push(toHashtag(p));
  for (const g of pickGenres(kind, row)) push(toHashtag(g));
  if (remote) push('#удалённо');
  return tags;
}

/**
 * 1–2 строки описания без контактов: maskContacts → схлопнуть пробелы → первые
 * две непустые строки → обрезка по слову до ~300 символов с «…». Без экранирования.
 */
export function descriptionSnippet(text: string | null | undefined, max = JOBS_DESCRIPTION_MAX): string {
  const masked = maskContacts(text ?? '') ?? '';
  const lines = masked.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!lines.length) return '';
  let s = lines.slice(0, 2).join('\n');
  let cut = lines.length > 2;
  const chars = Array.from(s);
  if (chars.length > max) {
    s = chars.slice(0, max).join('');
    const lastSpace = s.search(/\s\S*$/);
    if (lastSpace > max * 0.6) s = s.slice(0, lastSpace);
    cut = true;
  }
  return cut ? `${s.replace(/[\s,.;:–—-]+$/u, '')}…` : s;
}

/** «ДД.ММ.ГГГГ» по МСК (дедлайн хранится как конец дня МСК). */
export function formatDateMsk(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const day = parseCalendarDay(d instanceof Date ? d : new Date(d));
  if (!day) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(day.d)}.${p(day.m)}.${day.y}`;
}

function vacancyPayment(row: any): string | null {
  const label = PAYMENT_LABELS[String(row?.paymentType ?? '')] ?? null;
  if (!label) return null;
  const n = Number(row?.compensation);
  if (row?.compensation != null && Number.isFinite(n) && n > 0) {
    if (row.paymentType === 'percent') return `${label} · ${n}%`;
    if (row.paymentType === 'rate') return `${label} · ${formatRub(n, n) ?? n}`;
  }
  return label;
}

/** Ссылка на публичную страницу с UTM канала. */
export function jobUrl(kind: JobKind, id: string): string {
  const path = kind === 'order' ? 'orders' : 'vacancies';
  return `${appUrl()}/${path}/${encodeURIComponent(id)}?${JOBS_CHANNEL_UTM}`;
}

export interface JobPost {
  text: string;
  url: string;
  replyMarkup: { inline_keyboard: Array<Array<{ text: string; url: string }>> };
}

/**
 * Текст поста (parse_mode HTML, всё пользовательское — через escTg) и кнопка.
 * closed — пометка «⛔ Закрыто» сверху и пустая клавиатура (кнопка убирается).
 * Имя заказчика не выводится никогда; у вакансии — имя артиста (публичная сущность).
 */
export function buildJobPost(kind: JobKind, row: any, opts: { closed?: boolean } = {}): JobPost {
  const e = escTg;
  const lines: string[] = [];
  if (opts.closed) lines.push('⛔ <b>Закрыто</b>', '');
  lines.push(kind === 'order' ? '🎯 <b>Заказ</b>' : '🎸 <b>Вакансия</b>');
  lines.push(`<b>${e(maskContacts(String(row?.title ?? '')).trim())}</b>`);
  lines.push('');

  const { city, remote } = jobLocation(kind, row);
  if (kind === 'order') {
    if (row?.service?.name) lines.push(`🛠 Услуга: ${e(row.service.name)}`);
    if (city) lines.push(`📍 ${e(city)}${remote ? ' · можно удалённо' : ''}`);
    else if (remote) lines.push('🌐 Удалённо');
    const budget = formatRub(row?.budgetFrom, row?.budgetTo);
    lines.push(`💰 Бюджет: ${e(budget ?? 'по договорённости')}`);
    const deadline = formatDateMsk(row?.deadline);
    lines.push(deadline ? `⏳ Срок: до ${e(deadline)} (МСК)` : '⏳ Срок не ограничен');
  } else {
    if (row?.artist?.name) lines.push(`🎤 Артист: ${e(row.artist.name)}`);
    if (row?.profession?.name) lines.push(`👤 Профессия: ${e(row.profession.name)}`);
    const geo = GEOGRAPHY_LABELS[String(row?.geography ?? '')];
    const format = remote ? 'Удалённо' : WORK_FORMAT_LABELS[String(row?.workFormat ?? '')];
    const where = [city, format, geo ? geo.toLowerCase() : null].filter(Boolean).join(' · ');
    if (where) lines.push(`${remote ? '🌐' : '📍'} ${e(where)}`);
    const employment = EMPLOYMENT_LABELS[String(row?.employmentType ?? '')];
    if (employment) lines.push(`💼 Занятость: ${e(employment)}`);
    const payment = vacancyPayment(row);
    if (payment) lines.push(`💰 Оплата: ${e(payment)}`);
  }

  const snippet = descriptionSnippet(row?.description);
  if (snippet) lines.push('', e(snippet));

  const tags = buildHashtags(kind, row);
  if (tags.length) lines.push('', tags.map(e).join(' '));

  const url = jobUrl(kind, String(row?.id ?? ''));
  return {
    text: lines.join('\n'),
    url,
    replyMarkup: opts.closed
      ? { inline_keyboard: [] }
      : { inline_keyboard: [[{ text: JOBS_CHANNEL_BUTTON_TEXT, url }]] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Отправка
// ─────────────────────────────────────────────────────────────────────────────

export type JobSyncResult =
  | 'not_configured' | 'disabled' | 'not_found' | 'not_public' | 'too_old'
  | 'already' | 'posted' | 'closed' | 'reopened' | 'noop' | 'error';

export interface SyncHints {
  /** Момент перехода в active, замеченный hook'ом (архив → active). */
  activatedAt?: Date;
  /** Событие пришло из транзакции — коммит мог ещё не случиться. */
  inTx?: boolean;
  /** Номер повторной попытки (внутреннее). */
  attempt?: number;
}

function logTgError(where: string, kind: JobKind, id: string, r: BotApiResult) {
  if (r.ok) return;
  logger.warn(`[jobsChannel] ${where} ${kind} ${id}: ${r.errorCode ?? 'net'} ${r.description}`);
}

/** Ошибки правки, при которых повторять бессмысленно (пост удалён/уже такой). */
function isFinalEditError(r: BotApiResult): boolean {
  if (r.ok) return true;
  return /not modified|message to edit not found|message can't be edited|MESSAGE_ID_INVALID/i.test(r.description);
}

function isFresh(row: any, enabledAt: Date | null, hints: SyncHints): boolean {
  if (!enabledAt) return false;
  const t = enabledAt.getTime();
  const marks = [row?.createdAt, row?.posts?.[0]?.createdAt, hints.activatedAt];
  return marks.some((d) => d && new Date(d).getTime() >= t);
}

async function editJobMessage(messageId: number, post: JobPost): Promise<BotApiResult> {
  return callBotApi('editMessageText', {
    chat_id: jobsChannelId(),
    message_id: messageId,
    text: post.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: post.replyMarkup,
  });
}

/**
 * «Застолблённая», но не завершённая отправка (процесс упал между claim и ответом
 * Telegram) через столько считается брошенной — следующее событие пробует снова.
 */
const STALE_CLAIM_MS = 10 * 60 * 1000;

function isStaleClaim(row: any, now = Date.now()): boolean {
  return !!row?.telegramPostedAt && now - new Date(row.telegramPostedAt).getTime() > STALE_CLAIM_MS;
}

/** Публикация открытой свежей сущности (row уже загружен и проверен). */
async function publishRow(kind: JobKind, row: any, hints: SyncHints): Promise<JobSyncResult> {
  const d = delegate(kind);
  const claim = await d.updateMany({
    where: {
      id: row.id,
      telegramMessageId: null,
      OR: [{ telegramPostedAt: null }, { telegramPostedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } }],
    },
    data: { telegramPostedAt: new Date() },
  });
  if (!claim || claim.count !== 1) return 'already';

  const post = buildJobPost(kind, row);
  const r = await callBotApi<{ message_id: number }>('sendMessage', {
    chat_id: jobsChannelId(),
    text: post.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: post.replyMarkup,
  });
  if (!r.ok || !Number.isInteger(r.result?.message_id)) {
    // Снять «застолбление», чтобы следующее событие попробовало снова.
    await d.updateMany({ where: { id: row.id, telegramMessageId: null }, data: { telegramPostedAt: null } }).catch(() => {});
    if (!r.ok) {
      logTgError('send', kind, row.id, r);
      // 429 — повторить, когда разрешит Telegram; сбой сети/релея — через минуту
      // (ограниченное число раз), чтобы пост не терялся при «мигании» релея.
      const attempt = hints.attempt ?? 0;
      if (attempt < MAX_ATTEMPTS - 1 && (r.retryAfter || r.network)) {
        scheduleJobSync(kind, row.id, { ...hints, attempt: attempt + 1 }, r.retryAfter ? (r.retryAfter + 1) * 1000 : NETWORK_RETRY_DELAY_MS);
      }
    }
    return 'error';
  }

  const messageId = r.result.message_id;
  const saved = await d.updateMany({ where: { id: row.id }, data: { telegramMessageId: messageId } });
  if (!saved || saved.count !== 1) {
    // Сущность удалили, пока шла отправка, — сразу закрыть пост.
    await editJobMessage(messageId, buildJobPost(kind, row, { closed: true })).catch(() => {});
    return 'closed';
  }
  logger.info(`[jobsChannel] posted ${kind} ${row.id} → message ${messageId}`);
  // Пока шла отправка, сущность могла закрыться — перепроверить.
  scheduleJobSync(kind, row.id);
  return 'posted';
}

async function closeRow(kind: JobKind, row: any): Promise<JobSyncResult> {
  const d = delegate(kind);
  const claim = await d.updateMany({
    where: { id: row.id, telegramMessageId: { not: null }, telegramClosedAt: null },
    data: { telegramClosedAt: new Date() },
  });
  if (!claim || claim.count !== 1) return 'already';
  const r = await editJobMessage(row.telegramMessageId, buildJobPost(kind, row, { closed: true }));
  if (!r.ok && !isFinalEditError(r)) {
    logTgError('close', kind, row.id, r);
    await d.updateMany({ where: { id: row.id }, data: { telegramClosedAt: null } }).catch(() => {});
    return 'error';
  }
  return 'closed';
}

async function reopenRow(kind: JobKind, row: any): Promise<JobSyncResult> {
  const d = delegate(kind);
  const claim = await d.updateMany({
    where: { id: row.id, telegramMessageId: { not: null }, telegramClosedAt: { not: null } },
    data: { telegramClosedAt: null },
  });
  if (!claim || claim.count !== 1) return 'already';
  const r = await editJobMessage(row.telegramMessageId, buildJobPost(kind, row));
  if (!r.ok && !isFinalEditError(r)) {
    logTgError('reopen', kind, row.id, r);
    await d.updateMany({ where: { id: row.id }, data: { telegramClosedAt: new Date() } }).catch(() => {});
    return 'error';
  }
  return 'reopened';
}

/**
 * Привести пост в канале к состоянию сущности: опубликовать (один раз),
 * закрыть или снова открыть. Повторно загружает сущность из БД.
 */
export async function syncJobPost(kind: JobKind, id: string, hints: SyncHints = {}): Promise<JobSyncResult> {
  try {
    if (!isJobsChannelConfigured()) return 'not_configured';
    const settings = await getJobsChannelSettings();
    if (!settings.enabled) return 'disabled';
    const row = await loadJob(kind, id);
    if (!row) return 'not_found';
    const open = isJobOpen(kind, row);
    if (row.telegramMessageId == null) {
      if (!open) return 'not_public';
      if (row.telegramPostedAt && !isStaleClaim(row)) return 'already'; // отправка уже идёт (застолблена)
      if (!isFresh(row, settings.enabledAt, hints)) return 'too_old';
      return await publishRow(kind, row, hints);
    }
    if (!open && !row.telegramClosedAt) return await closeRow(kind, row);
    if (open && row.telegramClosedAt) return await reopenRow(kind, row);
    return 'noop';
  } catch (err: any) {
    logger.error(`[jobsChannel] sync ${kind} ${id} failed: ${err?.message}`);
    return 'error';
  }
}

/** Опубликовать заказ (если он публичный, свежий и ещё не опубликован). */
export async function publishOrder(orderId: string, hints: SyncHints = {}): Promise<JobSyncResult> {
  return publishJob('order', orderId, hints);
}

/** Опубликовать вакансию (если она публичная, свежая и ещё не опубликована). */
export async function publishVacancy(vacancyId: string, hints: SyncHints = {}): Promise<JobSyncResult> {
  return publishJob('vacancy', vacancyId, hints);
}

async function publishJob(kind: JobKind, id: string, hints: SyncHints): Promise<JobSyncResult> {
  try {
    if (!isJobsChannelConfigured()) return 'not_configured';
    const settings = await getJobsChannelSettings();
    if (!settings.enabled) return 'disabled';
    const row = await loadJob(kind, id);
    if (!row) return 'not_found';
    if (row.telegramMessageId != null || (row.telegramPostedAt && !isStaleClaim(row))) return 'already';
    if (!isJobOpen(kind, row)) return 'not_public';
    if (!isFresh(row, settings.enabledAt, hints)) return 'too_old';
    return await publishRow(kind, row, hints);
  } catch (err: any) {
    logger.error(`[jobsChannel] publish ${kind} ${id} failed: ${err?.message}`);
    return 'error';
  }
}

/**
 * Пометить пост «⛔ Закрыто» и убрать кнопку (best-effort).
 * snapshot — строка, загруженная ДО удаления (loadJob): сущности в БД уже нет.
 */
export async function closePost(kind: JobKind, id: string, snapshot?: any): Promise<JobSyncResult> {
  try {
    if (!isJobsChannelConfigured()) return 'not_configured';
    const settings = await getJobsChannelSettings();
    if (!settings.enabled) return 'disabled';
    const row = await loadJob(kind, id);
    if (row) {
      if (row.telegramMessageId == null) return 'not_public';
      if (row.telegramClosedAt) return 'already';
      return await closeRow(kind, row);
    }
    if (!snapshot || snapshot.telegramMessageId == null || snapshot.telegramClosedAt) return 'not_found';
    const r = await editJobMessage(snapshot.telegramMessageId, buildJobPost(kind, snapshot, { closed: true }));
    if (!r.ok && !isFinalEditError(r)) {
      logTgError('close-deleted', kind, id, r);
      return 'error';
    }
    return 'closed';
  } catch (err: any) {
    logger.error(`[jobsChannel] close ${kind} ${id} failed: ${err?.message}`);
    return 'error';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Планировщик: отложенно, со слиянием событий, последовательно по сущности
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Задержка после события. Не setImmediate: заказ создаётся раньше своего поста
 * (syncOrderPost — следующим запросом к БД), а событие из транзакции может
 * прийти до коммита. Повторные события по той же сущности сливаются.
 */
let syncDelayMs = 1500;
/** Повторная проверка для событий из транзакции (коммит мог задержаться). */
const TX_RETRY_DELAY_MS = 10_000;
/** Повтор отправки после сбоя сети/релея. */
const NETWORK_RETRY_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 3;

/** Для тестов: задать задержку планировщика. */
export function setJobsSyncDelay(ms: number): void {
  syncDelayMs = Math.max(0, ms);
}

type Pending = { timer: NodeJS.Timeout; hints: SyncHints };
const pending = new Map<string, Pending>();
const running = new Map<string, Promise<unknown>>();

function mergeHints(a: SyncHints | undefined, b: SyncHints): SyncHints {
  const activatedAt = [a?.activatedAt, b.activatedAt].filter(Boolean)
    .sort((x, y) => new Date(y as Date).getTime() - new Date(x as Date).getTime())[0];
  return {
    ...(activatedAt ? { activatedAt } : {}),
    ...(a?.inTx || b.inTx ? { inTx: true } : {}),
    attempt: Math.max(a?.attempt ?? 0, b.attempt ?? 0),
  };
}

/**
 * Поставить синхронизацию сущности в очередь (вызывает hook). Не бросает, не ждёт.
 * Выполнение — после задержки, строго по одному на сущность.
 */
export function scheduleJobSync(kind: JobKind, id: string, hints: SyncHints = {}, delayMs?: number): void {
  if (!id || !isJobsChannelConfigured()) return;
  const key = `${kind}:${id}`;
  const prev = pending.get(key);
  if (prev) clearTimeout(prev.timer);
  const merged = mergeHints(prev?.hints, hints);
  const timer = setTimeout(() => {
    pending.delete(key);
    const before = running.get(key) ?? Promise.resolve();
    const p = before.catch(() => {}).then(async () => {
      const res = await syncJobPost(kind, id, merged);
      const attempt = merged.attempt ?? 0;
      if (merged.inTx && (res === 'not_found' || res === 'not_public') && attempt < MAX_ATTEMPTS - 1) {
        scheduleJobSync(kind, id, { ...merged, attempt: attempt + 1 }, TX_RETRY_DELAY_MS);
      }
    });
    running.set(key, p);
    p.finally(() => { if (running.get(key) === p) running.delete(key); }).catch(() => {});
  }, delayMs ?? syncDelayMs);
  timer.unref?.();
  pending.set(key, { timer, hints: merged });
}

/** Закрыть пост удалённой сущности (снимок снят hook'ом до удаления). Не ждёт. */
export function scheduleClosePost(kind: JobKind, snapshot: any): void {
  if (!snapshot?.id || !isJobsChannelConfigured()) return;
  const key = `${kind}:${snapshot.id}`;
  const before = running.get(key) ?? Promise.resolve();
  const p = before.catch(() => {}).then(() => closePost(kind, snapshot.id, snapshot));
  running.set(key, p);
  p.finally(() => { if (running.get(key) === p) running.delete(key); }).catch(() => {});
}

/** Для тестов: дождаться всех запланированных/идущих синхронизаций. */
export async function flushJobSyncs(): Promise<void> {
  for (let i = 0; i < 10 && (pending.size || running.size); i++) {
    for (const [key, p] of [...pending.entries()]) {
      clearTimeout(p.timer);
      pending.delete(key);
      const [kind, id] = key.split(':') as [JobKind, string];
      const before = running.get(key) ?? Promise.resolve();
      const run = before.catch(() => {}).then(() => syncJobPost(kind, id, p.hints));
      running.set(key, run);
      run.finally(() => { if (running.get(key) === run) running.delete(key); }).catch(() => {});
    }
    await Promise.allSettled([...running.values()]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Админка: тестовый пост
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Пробное сообщение в канал (POST /api/admin/jobs-channel/test). Работает и при
 * выключенном флаге — чтобы проверить права бота до включения. Возвращает
 * текст ошибки Telegram (например, «bot is not a member of the channel chat»).
 */
export async function sendJobsChannelTest(): Promise<
  | { ok: true; messageId: number; channelId: string }
  | { ok: false; reason: 'not_configured' | 'telegram'; error: string }
> {
  const channelId = jobsChannelId();
  if (!channelId) {
    return { ok: false, reason: 'not_configured', error: 'Канал не задан: пропишите TELEGRAM_JOBS_CHANNEL_ID в env сервера' };
  }
  if (!(process.env.TELEGRAM_BOT_TOKEN || '').trim()) {
    return { ok: false, reason: 'not_configured', error: 'TELEGRAM_BOT_TOKEN не задан' };
  }
  const text = [
    '🧪 <b>Тестовый пост Moooza</b>',
    '',
    'Бот может публиковать в этот канал: сюда будут приходить новые заказы и вакансии.',
    'Это сообщение можно удалить.',
  ].join('\n');
  const r = await callBotApi<{ message_id: number }>('sendMessage', {
    chat_id: channelId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
  if (!r.ok) return { ok: false, reason: 'telegram', error: `Telegram: ${r.description}` };
  return { ok: true, messageId: r.result.message_id, channelId };
}
