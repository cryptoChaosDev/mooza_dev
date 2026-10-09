/**
 * «Ищу музыканта» — /api/requests.
 *
 *   POST /parse  — разбор фразы (гостю тоже, rate limit) + чипы + примерное
 *                  число подходящих исполнителей;
 *   POST /       — только вошедшим, ≤ 5 в сутки: создаёт заказ (active, с
 *                  постом в Потоке, как POST /api/orders), рассылает личные
 *                  уведомления топ-10 подходящих, возвращает { orderId, notifiedCount }.
 *   GET  /quota  — сколько запросов осталось сегодня.
 *   POST /transcribe — голосовой ввод: запись ≤ 30 с (multipart, поле audio) →
 *                  { text } через наш STT (Vosk); гостю тоже, rate limit.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { voiceTranscribeLimiter } from '../middleware/rateLimiter';
import { transcribeAudio, SttBadAudioError, SttBusyError, SttTooLongError } from '../lib/sttClient';
import { withAdvisoryLock } from '../lib/dealHelpers';
import {
  applyOverrides, buildChips, emptyParsed, formatBudgetLabel, getRequestDictionaries, isoToMskDay,
  parseRequestText, servicesForProfessions, MAX_REQUEST_TEXT,
  type AppliedRequest, type RequestDictionaries, type ServiceRef,
} from '../lib/requestParser';
import {
  countMatchCandidates, notifyOrderMatches, toPreviewUsers, type MatchCriteria, type RankedCandidate,
} from '../lib/requestMatching';
import { createOrderWithFeedPost } from '../lib/orderCreate';

const router = Router();

export const DAILY_REQUEST_LIMIT = 5;
const MIN_TEXT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function serverError(res: Response, where: string, e: unknown) {
  console.error(`[requests] ${where}`, e);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

// Живой разбор с дебаунсом: щедро для вошедших, скромнее для гостей.
const parseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req: any) => (req.userId ? 60 : 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.userId || ipKeyGenerator(req.ip),
  handler: (_req, res) => {
    res.status(429).json({ error: 'Слишком много запросов на разбор. Подождите минуту.' });
  },
});

// Страховка от перебора (основной лимит — 5 в сутки по журналу в БД).
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.userId || ipKeyGenerator(req.ip),
  handler: (_req, res) => {
    res.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' });
  },
});

// Текст запроса = описание заказа: переносы строк сохраняем, лишние пробелы схлопываем.
function readText(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_REQUEST_TEXT);
}

function criteriaFrom(r: AppliedRequest, dict: RequestDictionaries, excludeUserId: string | null): MatchCriteria {
  return {
    professionIds: r.professionIds,
    genreIds: r.genreIds,
    genreNames: r.genreIds.map((id) => dict.genres.find((g) => g.id === id)?.name).filter((n): n is string => !!n),
    cityName: r.isRemote ? null : r.cityName,
    isRemote: r.isRemote,
    budgetTo: r.budgetTo,
    excludeUserId,
  };
}

/**
 * Раздел каталога для заказа. У части профессий нет связи в ServiceProfession
 * (фотограф, хореограф…) — тогда берём услугу, которую чаще всего выбирают
 * исполнители этой профессии.
 */
async function resolveService(r: AppliedRequest, dict: RequestDictionaries): Promise<ServiceRef | null> {
  if (r.serviceId) return dict.services.find((s) => s.id === r.serviceId) ?? null;
  if (r.professionIds.length === 0) return null;
  const top = await prisma.userService.groupBy({
    by: ['serviceId'],
    where: { professionId: { in: r.professionIds }, status: 'active' },
    _count: { serviceId: true },
    orderBy: { _count: { serviceId: 'desc' } },
    take: 1,
  });
  const id = (top as any[])[0]?.serviceId as string | undefined;
  return id ? dict.services.find((s) => s.id === id) ?? null : null;
}

async function analyze(text: string, overrides: unknown, now: Date) {
  const dict = await getRequestDictionaries();
  const parsed = text.length >= MIN_TEXT ? parseRequestText(text, dict, now) : emptyParsed(text);
  const { result, errors } = applyOverrides(parsed, overrides as any, dict, text, now);
  const service = await resolveService(result, dict);
  if (service) result.serviceId = service.id;
  return { dict, result, errors, service };
}

/** Сводка для уведомления: «Самара · 20.11.2026 · до 10 000 ₽». */
function summaryOf(r: AppliedRequest): string {
  return [
    r.isRemote ? 'онлайн' : r.cityName,
    r.date ? isoToMskDay(r.date) : r.dateHint,
    formatBudgetLabel(r.budgetFrom, r.budgetTo, r.isFree),
  ].filter(Boolean).join(' · ');
}

function publicParsed(r: AppliedRequest) {
  return {
    professionIds: r.professionIds,
    genreIds: r.genreIds,
    cityName: r.cityName,
    isRemote: r.isRemote,
    date: r.date,
    dateHint: r.dateHint,
    budgetFrom: r.budgetFrom,
    budgetTo: r.budgetTo,
    isFree: r.isFree,
    serviceId: r.serviceId,
    title: r.title,
    unknownTokens: r.unknownTokens,
  };
}

// ── POST /api/requests/parse — разбор фразы (гость или вошедший) ─────────────
router.post('/parse', optionalAuthenticate, parseLimiter, async (req: AuthRequest, res) => {
  try {
    const text = readText(req.body?.text);
    const now = new Date();
    const { dict, result, errors, service } = await analyze(text, req.body?.overrides, now);
    const estimatedMatches = result.professionIds.length > 0
      ? await countMatchCandidates(criteriaFrom(result, dict, req.userId ?? null), now)
      : 0;
    res.json({
      parsed: publicParsed(result),
      chips: buildChips(result, dict, service ? { id: service.id, name: service.name } : null),
      professions: result.professionIds
        .map((id) => dict.professions.find((p) => p.id === id))
        .filter(Boolean),
      service: service ? { id: service.id, name: service.name, sectionName: service.sectionName } : null,
      serviceOptions: servicesForProfessions(dict, result.professionIds)
        .slice(0, 20)
        .map((s) => ({ id: s.id, name: s.name, sectionName: s.sectionName })),
      estimatedMatches,
      needsProfession: result.professionIds.length === 0,
      errors,
    });
  } catch (e) {
    return serverError(res, 'POST /parse', e);
  }
});

// ── POST /api/requests/transcribe — голосовой ввод (гость или вошедший) ──────
// Аудио принимается только в память (multer.memoryStorage) и передаётся в STT
// из буфера: на диск не пишется, после ответа ссылка на буфер сбрасывается.
// Текст распознавания не логируется.
export const VOICE_MAX_SECONDS = 30;
export const VOICE_MAX_BYTES = 2 * 1024 * 1024;
const VOICE_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-m4a']);
// Запас к 30 с: таймер браузера останавливает запись с опозданием на доли секунды.
const VOICE_LIMIT_WITH_SLACK = VOICE_MAX_SECONDS + 1;
// Очередь STT (до 60 с) + распознавание записи ≤ 30 с.
const VOICE_STT_TIMEOUT_MS = 90_000;

const VOICE_TOO_LONG = 'Запись слишком длинная — говорите не дольше 30 секунд';
const VOICE_NOT_HEARD = 'Не расслышали — попробуйте ещё раз ближе к микрофону';
const VOICE_BUSY = 'Распознавание речи сейчас занято — попробуйте через минуту или введите текст';

const baseMime = (t: string | undefined) => String(t ?? '').split(';')[0].trim().toLowerCase();

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VOICE_MAX_BYTES, files: 1, fields: 5, parts: 6 },
  fileFilter: (_req, file, cb) => {
    if (VOICE_TYPES.has(baseMime(file.mimetype))) return cb(null, true);
    cb(Object.assign(new Error('Неподдерживаемый формат записи'), { status: 415 }));
  },
}).single('audio');

// Ошибки приёма — здесь, с понятным текстом (а не общим «Файл слишком большой»).
function receiveVoice(req: Request, res: Response, next: NextFunction) {
  voiceUpload(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: VOICE_TOO_LONG, code: 'TOO_LONG' });
      return res.status(400).json({ error: 'Не удалось загрузить запись' });
    }
    if (err?.status === 415) {
      return res.status(415).json({ error: 'Неподдерживаемый формат записи', code: 'UNSUPPORTED_AUDIO' });
    }
    return res.status(400).json({ error: 'Не удалось загрузить запись' });
  });
}

router.post('/transcribe', optionalAuthenticate, voiceTranscribeLimiter, receiveVoice, async (req: AuthRequest, res) => {
  const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
  try {
    if (!file?.buffer?.length) return res.status(400).json({ error: 'Нет записи — попробуйте ещё раз' });
    const { text, duration } = await transcribeAudio(file.buffer, {
      mimeType: baseMime(file.mimetype),
      maxSeconds: VOICE_LIMIT_WITH_SLACK,
      timeoutMs: VOICE_STT_TIMEOUT_MS,
    });
    if (duration != null && duration > VOICE_LIMIT_WITH_SLACK + 0.5) {
      return res.status(413).json({ error: VOICE_TOO_LONG, code: 'TOO_LONG' });
    }
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_REQUEST_TEXT);
    if (!clean) return res.status(422).json({ error: VOICE_NOT_HEARD, code: 'NOT_HEARD' });
    res.json({ text: clean });
  } catch (e: any) {
    if (e instanceof SttBusyError || e?.name === 'AbortError') {
      return res.status(503).json({ error: VOICE_BUSY, code: 'STT_BUSY' });
    }
    if (e instanceof SttTooLongError) return res.status(413).json({ error: VOICE_TOO_LONG, code: 'TOO_LONG' });
    if (e instanceof SttBadAudioError) return res.status(422).json({ error: VOICE_NOT_HEARD, code: 'NOT_HEARD' });
    // STT недоступен (контейнер не запущен, сеть) — тоже «временно», а не 500.
    if (e instanceof TypeError && /fetch failed/i.test(e.message)) {
      console.error('[requests] STT unavailable', e.message);
      return res.status(503).json({ error: 'Голосовой ввод временно недоступен — введите текст', code: 'STT_UNAVAILABLE' });
    }
    return serverError(res, 'POST /transcribe', e);
  } finally {
    // Аудио не храним: отпускаем буфер сразу, не дожидаясь конца запроса.
    if (file) (file as { buffer?: Buffer }).buffer = undefined;
  }
});

// ── GET /api/requests/quota — лимит запросов на сегодня ─────────────────────
router.get('/quota', authenticate, async (req: AuthRequest, res) => {
  try {
    const used = await prisma.musicianRequest.count({
      where: { userId: req.userId!, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    res.json({ limit: DAILY_REQUEST_LIMIT, used, remaining: Math.max(0, DAILY_REQUEST_LIMIT - used) });
  } catch (e) {
    return serverError(res, 'GET /quota', e);
  }
});

// ── POST /api/requests — создать заказ и уведомить подходящих ────────────────
router.post('/', authenticate, createLimiter, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const text = readText(req.body?.text);
    if (text.length < MIN_TEXT) return res.status(400).json({ error: 'Опишите, кого вы ищете' });
    const now = new Date();
    const { dict, result: r, errors, service } = await analyze(text, req.body?.overrides, now);
    if (errors.length > 0) return res.status(400).json({ error: errors[0], errors });
    if (r.professionIds.length === 0) {
      return res.status(400).json({ error: 'Уточните профессию — выберите, кого вы ищете', code: 'PROFESSION_REQUIRED' });
    }
    if (!service) {
      return res.status(422).json({
        error: 'Для этой профессии пока нет раздела в каталоге — создайте заказ через обычную форму',
        code: 'NO_SERVICE',
      });
    }
    const deadline = r.date ? new Date(r.date) : null;
    if (deadline && deadline.getTime() < now.getTime()) {
      return res.status(400).json({ error: 'Срок выполнения не может быть в прошлом' });
    }

    const genreNames = criteriaFrom(r, dict, meId).genreNames;
    const created = await withAdvisoryLock(`musician-request:${meId}`, async (tx) => {
      const used = await tx.musicianRequest.count({
        where: { userId: meId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
      });
      if (used >= DAILY_REQUEST_LIMIT) return { limited: true as const };
      const { order } = await createOrderWithFeedPost({
        authorId: meId,
        serviceId: service.id,
        title: r.title,
        description: text,
        budgetFrom: r.budgetFrom,
        budgetTo: r.budgetTo,
        deadline,
        status: 'active',
        post: { city: r.cityName, genres: genreNames },
      }, tx);
      const log = await tx.musicianRequest.create({
        data: { userId: meId, orderId: order.id, professionIds: r.professionIds },
      });
      return { limited: false as const, order, logId: log.id, used: used + 1 };
    });
    if (created.limited) {
      return res.status(429).json({
        error: `Можно отправить не больше ${DAILY_REQUEST_LIMIT} запросов в сутки. Попробуйте завтра или создайте заказ через форму.`,
        code: 'DAILY_LIMIT',
      });
    }

    // Заказ уже создан и опубликован: сбой подбора не должен превращаться в ошибку.
    let notified: RankedCandidate[] = [];
    try {
      ({ notified } = await notifyOrderMatches({
        orderId: created.order.id,
        orderTitle: created.order.title,
        authorId: meId,
        criteria: criteriaFrom(r, dict, meId),
        summary: summaryOf(r),
        now,
      }));
      if (notified.length > 0) {
        await prisma.musicianRequest.update({ where: { id: created.logId }, data: { notifiedCount: notified.length } });
      }
    } catch (e) {
      console.error('[requests] matching failed', e);
    }

    res.status(201).json({
      orderId: created.order.id,
      title: created.order.title,
      notifiedCount: notified.length,
      previewUsers: toPreviewUsers(notified, 5),
      remainingToday: Math.max(0, DAILY_REQUEST_LIMIT - created.used),
    });
  } catch (e) {
    return serverError(res, 'POST /', e);
  }
});

export default router;
