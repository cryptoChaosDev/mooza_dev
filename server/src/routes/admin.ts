import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { notify, notifyMany } from '../utils/notify';
import { yoNorm } from '../utils/search';
import { grantProMonth, isProActive } from '../utils/pro';
import logger from '../utils/logger';
import { artistAdminIds } from '../lib/artistAccess';
import { notifyVerificationDecision } from '../lib/artistModerationNotify';
import { syncArtistNow } from '../utils/yandexMusicSync';
import { disconnectUserSockets } from '../socket';
import {
  WAITLIST_BULK_MAX, INVITES_DISABLED_ERROR, waitlistInvitesWork, inviteWaitlistEntry, inviteWaitlistBulk,
  withWaitlistDetails, waitlistStats, syncWaitlistRegisteredByEmail, deleteWaitlistEntry,
} from '../lib/waitlist';

const router = Router();

// Admin middleware
const requireAdmin = async (req: AuthRequest, res: Response, next: any) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
};

router.use(authenticate, requireAdmin);

/**
 * Ошибки админки: детали (Prisma и т.п.) — только в лог, клиенту — понятный
 * общий текст по коду ошибки, без e.message.
 */
function adminError(res: Response, where: string, e: any, status = 400) {
  logger.error(`[admin] ${where}: ${e?.code ?? ''} ${e?.message}`);
  if (e?.code === 'P2002') return res.status(409).json({ error: 'Значение уже занято' });
  if (e?.code === 'P2025') return res.status(404).json({ error: 'Запись не найдена' });
  if (e?.code === 'P2003') return res.status(409).json({ error: 'Запись используется в других данных — удаление или изменение невозможно' });
  return res.status(status).json({ error: status >= 500 ? 'Внутренняя ошибка сервера' : 'Не удалось выполнить операцию' });
}

// Пагинация списков админки: ?page=1&limit=50 (limit ≤ 200).
function pageParams(req: { query: any }) {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

// Разорвать живые сокеты пользователя (блокировка, смена пароля админом,
// удаление): JWT/сессия уже недействительны, а открытый сокет жил бы до реконнекта.
function kickUserSockets(userId: string, reason = 'revoked') {
  try {
    disconnectUserSockets(userId, reason);
  } catch (e: any) {
    logger.warn(`[admin] disconnectUserSockets failed for ${userId}: ${e?.message}`);
  }
}

// Ручной прогон синка Яндекс.Музыки (тот же код, что ночной джоб) — для проверки.
// { includeUnverified: true } — следом разово и непроверенные карточки со ссылкой.
router.post('/ym-sync', async (req, res) => {
  try {
    const { runYandexMusicSync, syncUnverifiedArtistsNow } = await import('../utils/yandexMusicSync');
    const includeUnverified = req.body?.includeUnverified === true;
    // Фоном — обход с паузами может занять минуты; ответ сразу.
    runYandexMusicSync()
      .then(() => (includeUnverified ? syncUnverifiedArtistsNow() : 0))
      .catch(() => {});
    res.json({ started: true, includeUnverified });
  } catch (e: any) {
    return adminError(res, 'POST /ym-sync', e, 500);
  }
});

// «Сцена»: ручной импорт афиши Qtickets. { cities?: string[] } — только эти города
// (проверка на DEV); без него — все города каталога, как ночной прогон.
router.post('/scene/import', async (req, res) => {
  try {
    const { runQticketsImport } = await import('../lib/sceneConcerts');
    const cities = Array.isArray(req.body?.cities) ? (req.body.cities as unknown[]).filter((c): c is string => typeof c === 'string') : undefined;
    runQticketsImport({ cities }).catch(() => {});
    res.json({ started: true, cities: cities ?? 'all' });
  } catch (e: any) {
    return adminError(res, 'POST /scene/import', e, 500);
  }
});

// ─── Waitlist (landing sign-ups) ─────────────────────────────────────────────
// Приглашения, статусы и письма — lib/waitlist.ts.
router.get('/waitlist', async (req, res) => {
  try {
    const { type, status } = req.query as { type?: string; status?: string };
    const { page, limit, skip } = pageParams(req);
    const where: { type?: string; status?: string } = {};
    if (typeof type === 'string' && type) where.type = type;
    if (typeof status === 'string' && status) where.status = status;
    await syncWaitlistRegisteredByEmail();
    const [items, total] = await Promise.all([
      prisma.waitlistEntry.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.waitlistEntry.count({ where }),
    ]);
    res.json({ items: await withWaitlistDetails(items), total, page, limit });
  } catch (e: any) {
    return adminError(res, 'GET /waitlist', e, 500);
  }
});

// Счётчики: всего, по статусам/типам, конверсия; invitesEnabled — сработает ли ссылка.
router.get('/waitlist/stats', async (_req, res) => {
  try {
    await syncWaitlistRegisteredByEmail();
    res.json(await waitlistStats());
  } catch (e: any) {
    return adminError(res, 'GET /waitlist/stats', e, 500);
  }
});

// Массовое приглашение: до WAITLIST_BULK_MAX заявок, по очереди с паузой.
router.post('/waitlist/invite-bulk', async (req: AuthRequest, res) => {
  try {
    const raw = (req.body as { ids?: unknown })?.ids;
    const ids = Array.isArray(raw) ? [...new Set(raw.filter((v): v is string => typeof v === 'string' && !!v))] : [];
    if (ids.length === 0 || ids.length > WAITLIST_BULK_MAX) {
      return res.status(400).json({ error: `Выберите от 1 до ${WAITLIST_BULK_MAX} заявок` });
    }
    if (!(await waitlistInvitesWork())) return res.status(409).json({ error: INVITES_DISABLED_ERROR, code: 'INVITES_DISABLED' });
    res.json(await inviteWaitlistBulk(ids, req.userId!));
  } catch (e: any) {
    return adminError(res, 'POST /waitlist/invite-bulk', e, 500);
  }
});

// Пригласить одну заявку (повтор — не чаще раза в 24 ч → 429).
router.post('/waitlist/:id/invite', async (req: AuthRequest, res) => {
  try {
    if (!(await waitlistInvitesWork())) return res.status(409).json({ error: INVITES_DISABLED_ERROR, code: 'INVITES_DISABLED' });
    const r = await inviteWaitlistEntry(req.params.id, req.userId!);
    if (!r.ok) return res.status(r.status).json({ error: r.error, code: r.reason });
    const [entry] = await withWaitlistDetails([r.entry]);
    res.json({ ok: true, entry, inviteUrl: r.inviteUrl });
  } catch (e: any) {
    return adminError(res, 'POST /waitlist/:id/invite', e, 500);
  }
});

// Удалить заявку по просьбе человека (152-ФЗ).
router.delete('/waitlist/:id', async (req, res) => {
  try {
    const deleted = await deleteWaitlistEntry(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Заявка не найдена' });
    res.json({ ok: true });
  } catch (e: any) {
    return adminError(res, 'DELETE /waitlist/:id', e, 500);
  }
});

// ─── Запросы на добавление профессии (Модерация) ─────────────────────────────
router.get('/profession-requests', async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const items = await (prisma as any).professionRequest.findMany({
      where: status ? { status } : {},
      include: { user: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(items);
  } catch (e: any) { return adminError(res, 'GET /profession-requests', e, 500); }
});

// PATCH { status: 'done' | 'rejected', addToCatalog?: boolean }
// addToCatalog=true — сразу создать профессию в справочнике (если её ещё нет)
router.patch('/profession-requests/:id', async (req, res) => {
  try {
    const { status, addToCatalog } = req.body as { status?: string; addToCatalog?: boolean };
    if (!status || !['done', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'status: done | rejected | pending' });
    }
    const reqRow = await (prisma as any).professionRequest.findUnique({ where: { id: req.params.id } });
    if (!reqRow) return res.status(404).json({ error: 'Not found' });

    let createdProfession: any = null;
    if (status === 'done' && addToCatalog) {
      const name = reqRow.profession.trim();
      const exists = await prisma.profession.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (!exists) createdProfession = await prisma.profession.create({ data: { name } });
    }

    const updated = await (prisma as any).professionRequest.update({
      where: { id: req.params.id },
      data: { status, resolvedAt: status === 'pending' ? null : new Date() },
    });

    // Сообщим автору запроса о результате — через notify(): колокольчик,
    // сокет и push, а не только тихая запись в БД.
    if (status !== 'pending') {
      await notify({
        userId: reqRow.userId,
        type: 'support',
        title: status === 'done' ? '✅ Профессия добавлена' : 'Запрос по профессии рассмотрен',
        body: status === 'done'
          ? `«${reqRow.profession}» появилась в каталоге — выберите её в своём профиле.`
          : `«${reqRow.profession}» пока не добавили. Спасибо за предложение!`,
        link: status === 'done' ? '/professions/new' : '/profile',
      });
    }

    res.json({ ...updated, createdProfession });
  } catch (e: any) { return adminError(res, 'PATCH /profession-requests/:id', e, 500); }
});

// ─── FieldOfActivity ───────────────────────────────────────────────────────
router.get('/fields-of-activity', async (_req, res) => {
  const items = await prisma.fieldOfActivity.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(items);
});
router.post('/fields-of-activity', async (req, res) => {
  try {
    const item = await prisma.fieldOfActivity.create({ data: { name: req.body.name } });
    res.status(201).json(item);
  } catch (e: any) {
    return adminError(res, 'POST /fields-of-activity', e);
  }
});
router.put('/fields-of-activity/:id', async (req, res) => {
  try {
    const item = await prisma.fieldOfActivity.update({ where: { id: req.params.id }, data: { name: req.body.name } });
    res.json(item);
  } catch (e: any) {
    return adminError(res, 'PUT /fields-of-activity/:id', e);
  }
});
// ─── Каскадное удаление справочников: dry-run + подтверждение ───────────────
// Удаление сферы/направления/профессии/услуги удаляет пользовательские данные
// (UserService/UserProfession всех пользователей). Поэтому:
//  - GET …/:id/impact — сколько пользователей/записей будет затронуто;
//  - DELETE без ?confirm=<точное название> при затронутых пользователях → 409;
//  - ссылки с запретом удаления (заказы → услуга, вакансии → профессия) → 409.
// Поля «архив» в схеме нет, поэтому вместо архивации — явное подтверждение.
interface CatalogImpact {
  users: number;
  userServices: number;
  userProfessions: number;
  profileUsers: number;
  directions: number;
  professions: number;
  orders: number;
  vacancies: number;
}

async function professionsImpact(professionIds: string[]) {
  const [usRows, upRows, vacancies] = await Promise.all([
    prisma.userService.findMany({ where: { professionId: { in: professionIds } }, select: { userId: true } }),
    prisma.userProfession.findMany({ where: { professionId: { in: professionIds } }, select: { userId: true } }),
    prisma.vacancy.count({ where: { professionId: { in: professionIds } } }),
  ]);
  return { usRows, upRows, vacancies };
}

async function sphereImpact(id: string): Promise<{ name: string; impact: CatalogImpact; directionIds: string[]; professionIds: string[] } | null> {
  const field = await prisma.fieldOfActivity.findUnique({ where: { id }, select: { name: true } });
  if (!field) return null;
  const directionIds = (await prisma.direction.findMany({ where: { fieldOfActivityId: id }, select: { id: true } })).map(d => d.id);
  const professionIds = (await prisma.profession.findMany({ where: { directionId: { in: directionIds } }, select: { id: true } })).map(p => p.id);
  const { usRows, upRows, vacancies } = await professionsImpact(professionIds);
  const profileUsers = await prisma.user.count({ where: { fieldOfActivityId: id } });
  return {
    name: field.name, directionIds, professionIds,
    impact: {
      users: new Set([...usRows, ...upRows].map(r => r.userId)).size,
      userServices: usRows.length, userProfessions: upRows.length, profileUsers,
      directions: directionIds.length, professions: professionIds.length, orders: 0, vacancies,
    },
  };
}

async function directionImpact(id: string): Promise<{ name: string; impact: CatalogImpact; professionIds: string[] } | null> {
  const dir = await prisma.direction.findUnique({ where: { id }, select: { name: true } });
  if (!dir) return null;
  const professionIds = (await prisma.profession.findMany({ where: { directionId: id }, select: { id: true } })).map(p => p.id);
  const { usRows, upRows, vacancies } = await professionsImpact(professionIds);
  return {
    name: dir.name, professionIds,
    impact: {
      users: new Set([...usRows, ...upRows].map(r => r.userId)).size,
      userServices: usRows.length, userProfessions: upRows.length, profileUsers: 0,
      directions: 1, professions: professionIds.length, orders: 0, vacancies,
    },
  };
}

async function professionImpact(id: string): Promise<{ name: string; impact: CatalogImpact } | null> {
  const prof = await prisma.profession.findUnique({ where: { id }, select: { name: true } });
  if (!prof) return null;
  const { usRows, upRows, vacancies } = await professionsImpact([id]);
  return {
    name: prof.name,
    impact: {
      users: new Set([...usRows, ...upRows].map(r => r.userId)).size,
      userServices: usRows.length, userProfessions: upRows.length, profileUsers: 0,
      directions: 0, professions: 1, orders: 0, vacancies,
    },
  };
}

async function serviceImpact(id: string): Promise<{ name: string; impact: CatalogImpact } | null> {
  const svc = await prisma.service.findUnique({ where: { id }, select: { name: true } });
  if (!svc) return null;
  const [usRows, orders] = await Promise.all([
    prisma.userService.findMany({ where: { serviceId: id }, select: { userId: true } }),
    prisma.order.count({ where: { serviceId: id } }),
  ]);
  return {
    name: svc.name,
    impact: {
      users: new Set(usRows.map(r => r.userId)).size,
      userServices: usRows.length, userProfessions: 0, profileUsers: 0,
      directions: 0, professions: 0, orders, vacancies: 0,
    },
  };
}

/** Проверки перед каскадным удалением. Возвращает true, если ответ уже отправлен (409). */
function rejectCatalogDelete(req: any, res: Response, name: string, impact: CatalogImpact): boolean {
  if (impact.orders > 0 || impact.vacancies > 0) {
    const parts = [
      impact.orders > 0 ? `заказы (${impact.orders})` : '',
      impact.vacancies > 0 ? `вакансии (${impact.vacancies})` : '',
    ].filter(Boolean).join(' и ');
    res.status(409).json({ error: `Нельзя удалить «${name}»: на запись ссылаются ${parts}. Перенесите их в другой раздел каталога.`, impact, blocked: true });
    return true;
  }
  const confirm = String(req.query?.confirm ?? '').trim();
  if ((impact.users > 0 || impact.profileUsers > 0) && confirm !== name.trim()) {
    res.status(409).json({
      error: `Удаление затронет данные пользователей (${impact.users + impact.profileUsers}). Подтвердите вводом названия.`,
      impact, requiresConfirm: true,
    });
    return true;
  }
  return false;
}

router.get('/fields-of-activity/:id/impact', async (req, res) => {
  try {
    const r = await sphereImpact(req.params.id);
    if (!r) return res.status(404).json({ error: 'Запись не найдена' });
    res.json({ name: r.name, impact: r.impact });
  } catch (e: any) { return adminError(res, 'GET /fields-of-activity/:id/impact', e, 500); }
});
router.get('/directions/:id/impact', async (req, res) => {
  try {
    const r = await directionImpact(req.params.id);
    if (!r) return res.status(404).json({ error: 'Запись не найдена' });
    res.json({ name: r.name, impact: r.impact });
  } catch (e: any) { return adminError(res, 'GET /directions/:id/impact', e, 500); }
});
router.get('/professions/:id/impact', async (req, res) => {
  try {
    const r = await professionImpact(req.params.id);
    if (!r) return res.status(404).json({ error: 'Запись не найдена' });
    res.json({ name: r.name, impact: r.impact });
  } catch (e: any) { return adminError(res, 'GET /professions/:id/impact', e, 500); }
});
router.get('/services/:id/impact', async (req, res) => {
  try {
    const r = await serviceImpact(req.params.id);
    if (!r) return res.status(404).json({ error: 'Запись не найдена' });
    res.json({ name: r.name, impact: r.impact });
  } catch (e: any) { return adminError(res, 'GET /services/:id/impact', e, 500); }
});

router.delete('/fields-of-activity/:id', async (req: AuthRequest, res) => {
  try {
    const r = await sphereImpact(req.params.id);
    if (!r) return res.status(404).json({ error: 'Запись не найдена' });
    if (rejectCatalogDelete(req, res, r.name, r.impact)) return;
    const { directionIds, professionIds } = r;
    await prisma.$transaction([
      prisma.userService.deleteMany({ where: { professionId: { in: professionIds } } }),
      prisma.userProfession.deleteMany({ where: { professionId: { in: professionIds } } }),
      prisma.profession.deleteMany({ where: { directionId: { in: directionIds } } }),
      prisma.direction.deleteMany({ where: { fieldOfActivityId: req.params.id } }),
      prisma.fieldOfActivity.delete({ where: { id: req.params.id } }),
    ]);
    logger.info(`[admin] ${req.userId} deleted sphere ${req.params.id} «${r.name}» impact=${JSON.stringify(r.impact)}`);
    res.json({ ok: true, impact: r.impact });
  } catch (e: any) {
    return adminError(res, 'DELETE /fields-of-activity/:id', e);
  }
});

// ─── Profession ────────────────────────────────────────────────────────────
router.get('/professions', async (_req, res) => {
  const items = await prisma.profession.findMany({
    include: { direction: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(items);
});
router.post('/professions', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name required' });
    const item = await prisma.profession.create({ data: { name: req.body.name } });

    // Если профессию добавили напрямую (мимо очереди запросов) — закрыть
    // зависшие pending-запросы с этим названием и уведомить их авторов
    // (кейс «Бузукист»: профессия появилась, а запрос остался висеть).
    const pending = await (prisma as any).professionRequest.findMany({
      where: { status: 'pending', profession: { equals: item.name.trim(), mode: 'insensitive' } },
    });
    for (const pr of pending) {
      await (prisma as any).professionRequest.update({
        where: { id: pr.id },
        data: { status: 'done', resolvedAt: new Date() },
      });
      await notify({
        userId: pr.userId,
        type: 'support',
        title: '✅ Профессия добавлена',
        body: `«${pr.profession}» появилась в каталоге — выберите её в своём профиле.`,
        link: '/professions/new',
      });
    }

    res.status(201).json(item);
  } catch (e: any) { return adminError(res, 'POST /professions', e); }
});
router.put('/professions/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if ('directionId' in req.body) data.directionId = req.body.directionId ?? null;
    const item = await prisma.profession.update({
      where: { id: req.params.id },
      data,
      include: { direction: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (e: any) { return adminError(res, 'PUT /professions/:id', e); }
});
router.delete('/professions/:id', async (req: AuthRequest, res) => {
  try {
    const r = await professionImpact(req.params.id);
    if (!r) return res.status(404).json({ error: 'Запись не найдена' });
    if (rejectCatalogDelete(req, res, r.name, r.impact)) return;
    await prisma.$transaction([
      prisma.userService.deleteMany({ where: { professionId: req.params.id } }),
      prisma.userProfession.deleteMany({ where: { professionId: req.params.id } }),
      prisma.profession.delete({ where: { id: req.params.id } }),
    ]);
    logger.info(`[admin] ${req.userId} deleted profession ${req.params.id} «${r.name}» impact=${JSON.stringify(r.impact)}`);
    res.json({ ok: true, impact: r.impact });
  } catch (e: any) {
    return adminError(res, 'DELETE /professions/:id', e);
  }
});

// ─── Service (flat reference list) ─────────────────────────────────────────
router.get('/services', async (_req, res) => {
  const items = await prisma.service.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      section: { select: { id: true, name: true } },
    },
  });
  res.json(items);
});
router.post('/services', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name required' });
    const item = await prisma.service.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } });
    res.status(201).json(item);
  } catch (e: any) { return adminError(res, 'POST /services', e); }
});
router.put('/services/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    const item = await prisma.service.update({ where: { id: req.params.id }, data });
    res.json(item);
  } catch (e: any) { return adminError(res, 'PUT /services/:id', e); }
});
router.delete('/services/:id', async (req: AuthRequest, res) => {
  try {
    const r = await serviceImpact(req.params.id);
    if (!r) return res.status(404).json({ error: 'Запись не найдена' });
    if (rejectCatalogDelete(req, res, r.name, r.impact)) return;
    await prisma.$transaction([
      prisma.userService.deleteMany({ where: { serviceId: req.params.id } }),
      prisma.service.delete({ where: { id: req.params.id } }),
    ]);
    logger.info(`[admin] ${req.userId} deleted service ${req.params.id} «${r.name}» impact=${JSON.stringify(r.impact)}`);
    res.json({ ok: true, impact: r.impact });
  } catch (e: any) { return adminError(res, 'DELETE /services/:id', e); }
});


// ─── Genre ─────────────────────────────────────────────────────────────────
router.get('/genres', async (_req, res) => {
  res.json(await prisma.genre.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/genres', async (req, res) => {
  try { res.status(201).json(await prisma.genre.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { return adminError(res, 'POST /genres', e); }
});
router.put('/genres/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.genre.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { return adminError(res, 'PUT /genres/:id', e); }
});
router.delete('/genres/:id', async (req, res) => {
  try { await prisma.genre.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /genres/:id', e); }
});

// ─── WorkFormat ────────────────────────────────────────────────────────────
router.get('/work-formats', async (_req, res) => {
  res.json(await prisma.workFormat.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/work-formats', async (req, res) => {
  try { res.status(201).json(await prisma.workFormat.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { return adminError(res, 'POST /work-formats', e); }
});
router.put('/work-formats/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.workFormat.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { return adminError(res, 'PUT /work-formats/:id', e); }
});
router.delete('/work-formats/:id', async (req, res) => {
  try { await prisma.workFormat.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /work-formats/:id', e); }
});

// ─── ProfessionFeature ────────────────────────────────────────────────────
router.get('/profession-features', async (_req, res) => {
  res.json(await prisma.professionFeature.findMany({ orderBy: { name: 'asc' } }));
});
router.post('/profession-features', async (req, res) => {
  try { res.status(201).json(await prisma.professionFeature.create({ data: { name: req.body.name } })); }
  catch (e: any) { return adminError(res, 'POST /profession-features', e); }
});
router.put('/profession-features/:id', async (req, res) => {
  try { res.json(await prisma.professionFeature.update({ where: { id: req.params.id }, data: { name: req.body.name } })); }
  catch (e: any) { return adminError(res, 'PUT /profession-features/:id', e); }
});
router.delete('/profession-features/:id', async (req, res) => {
  try { await prisma.professionFeature.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /profession-features/:id', e); }
});

// ─── EmploymentType ────────────────────────────────────────────────────────
router.get('/employment-types', async (_req, res) => {
  res.json(await prisma.employmentType.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/employment-types', async (req, res) => {
  try { res.status(201).json(await prisma.employmentType.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { return adminError(res, 'POST /employment-types', e); }
});
router.put('/employment-types/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.employmentType.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { return adminError(res, 'PUT /employment-types/:id', e); }
});
router.delete('/employment-types/:id', async (req, res) => {
  try { await prisma.employmentType.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /employment-types/:id', e); }
});

// ─── SkillLevel ────────────────────────────────────────────────────────────
router.get('/skill-levels', async (_req, res) => {
  res.json(await prisma.skillLevel.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/skill-levels', async (req, res) => {
  try { res.status(201).json(await prisma.skillLevel.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { return adminError(res, 'POST /skill-levels', e); }
});
router.put('/skill-levels/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.skillLevel.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { return adminError(res, 'PUT /skill-levels/:id', e); }
});
router.delete('/skill-levels/:id', async (req, res) => {
  try { await prisma.skillLevel.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /skill-levels/:id', e); }
});

// ─── Availability ──────────────────────────────────────────────────────────
router.get('/availabilities', async (_req, res) => {
  res.json(await prisma.availability.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/availabilities', async (req, res) => {
  try { res.status(201).json(await prisma.availability.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { return adminError(res, 'POST /availabilities', e); }
});
router.put('/availabilities/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.availability.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { return adminError(res, 'PUT /availabilities/:id', e); }
});
router.delete('/availabilities/:id', async (req, res) => {
  try { await prisma.availability.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /availabilities/:id', e); }
});

// ─── Geography ─────────────────────────────────────────────────────────────
router.get('/geographies', async (_req, res) => {
  res.json(await prisma.geography.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/geographies', async (req, res) => {
  try { res.status(201).json(await prisma.geography.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { return adminError(res, 'POST /geographies', e); }
});
router.put('/geographies/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.geography.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { return adminError(res, 'PUT /geographies/:id', e); }
});
router.delete('/geographies/:id', async (req, res) => {
  try { await prisma.geography.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /geographies/:id', e); }
});

// ─── PriceRange ────────────────────────────────────────────────────────────
router.get('/price-ranges', async (_req, res) => {
  res.json(await prisma.priceRange.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/price-ranges', async (req, res) => {
  try {
    res.status(201).json(await prisma.priceRange.create({
      data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0, minValue: req.body.minValue, maxValue: req.body.maxValue },
    }));
  } catch (e: any) { return adminError(res, 'POST /price-ranges', e); }
});
router.put('/price-ranges/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    if (req.body.minValue !== undefined) data.minValue = req.body.minValue;
    if (req.body.maxValue !== undefined) data.maxValue = req.body.maxValue;
    res.json(await prisma.priceRange.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { return adminError(res, 'PUT /price-ranges/:id', e); }
});
router.delete('/price-ranges/:id', async (req, res) => {
  try { await prisma.priceRange.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /price-ranges/:id', e); }
});

// ─── Direction ─────────────────────────────────────────────────────────────
router.get('/directions', async (_req, res) => {
  const items = await prisma.direction.findMany({
    include: {
      fieldOfActivity: { select: { id: true, name: true } },
      customFilters: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(items);
});
router.post('/directions', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name required' });
    const item = await prisma.direction.create({ data: { name: req.body.name, allowedFilterTypes: [] } });
    res.status(201).json(item);
  } catch (e: any) { return adminError(res, 'POST /directions', e); }
});
router.put('/directions/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if ('fieldOfActivityId' in req.body) data.fieldOfActivityId = req.body.fieldOfActivityId ?? null;
    const item = await prisma.direction.update({
      where: { id: req.params.id },
      data,
      include: { fieldOfActivity: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (e: any) {
    return adminError(res, 'PUT /directions/:id', e);
  }
});
// Attach services to a direction (M2M removed — endpoint is now a no-op stub)
router.put('/directions/:id/services', async (req, res) => {
  try {
    const item = await prisma.direction.findUnique({
      where: { id: req.params.id },
      include: { fieldOfActivity: { select: { id: true, name: true } } },
    });
    res.json(item ?? {});
  } catch (e: any) {
    return adminError(res, 'PUT /directions/:id/services', e);
  }
});

// Set filters for a direction (system filter types + custom filter ids)
router.put('/directions/:id/filters', async (req, res) => {
  try {
    const { filterIds = [], filterTypes = [] } = req.body;
    const item = await prisma.direction.update({
      where: { id: req.params.id },
      data: {
        allowedFilterTypes: filterTypes as string[],
        customFilters: {
          set: (filterIds as string[]).map((id) => ({ id })),
        },
      },
      include: { customFilters: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (e: any) {
    return adminError(res, 'PUT /directions/:id/filters', e);
  }
});

router.delete('/directions/:id', async (req: AuthRequest, res) => {
  try {
    const r = await directionImpact(req.params.id);
    if (!r) return res.status(404).json({ error: 'Запись не найдена' });
    if (rejectCatalogDelete(req, res, r.name, r.impact)) return;
    const { professionIds } = r;
    await prisma.$transaction([
      prisma.userService.deleteMany({ where: { professionId: { in: professionIds } } }),
      prisma.userProfession.deleteMany({ where: { professionId: { in: professionIds } } }),
      prisma.profession.deleteMany({ where: { directionId: req.params.id } }),
      prisma.direction.delete({ where: { id: req.params.id } }),
    ]);
    logger.info(`[admin] ${req.userId} deleted direction ${req.params.id} «${r.name}» impact=${JSON.stringify(r.impact)}`);
    res.json({ ok: true, impact: r.impact });
  } catch (e: any) {
    return adminError(res, 'DELETE /directions/:id', e);
  }
});

// ─── Groups (admin) ──────────────────────────────────────────────────────────
// Список артистов: серверная пагинация + фильтры (?search=&type=ALL|NONE|<ArtistType>&status=ALL|<ArtistStatus>).
router.get('/groups', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = pageParams(req);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type : 'ALL';
    const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
    const where: any = {};
    if (search) where.nameNorm = { contains: yoNorm(search) };
    if (type === 'NONE') where.type = null;
    else if (type && type !== 'ALL') where.type = type;
    if (status && status !== 'ALL') where.status = status;
    const [groups, total] = await Promise.all([
      prisma.artist.findMany({
        where,
        include: {
          _count: { select: { userArtists: true } },
          submittedByUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      prisma.artist.count({ where }),
    ]);
    res.json({ items: groups.map(g => ({ ...g, listeners: Number(g.listeners) })), total, page, limit });
  } catch (e: any) { return adminError(res, 'GET /groups', e, 500); }
});
router.post('/groups', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, type = 'GROUP', city, description } = req.body;
    const group = await prisma.artist.create({
      data: { name, type, city: city || null, description: description || null },
    });
    res.status(201).json({ ...group, listeners: Number(group.listeners) });
  } catch (e: any) { return adminError(res, 'POST /groups', e); }
});
router.put('/groups/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, type, city, description, status } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (city !== undefined) data.city = city;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    const group = await prisma.artist.update({ where: { id: req.params.id }, data });
    res.json({ ...group, listeners: Number(group.listeners) });
  } catch (e: any) { return adminError(res, 'PUT /groups/:id', e); }
});
router.delete('/groups/:id', authenticate, requireAdmin, async (req, res) => {
  try { await prisma.artist.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /groups/:id', e); }
});

// ─── Artist ────────────────────────────────────────────────────────────────
router.get('/artists', async (req, res) => {
  try {
    const { page, limit, skip } = pageParams(req);
    const [items, total] = await Promise.all([
      prisma.artist.findMany({ orderBy: { name: 'asc' }, skip, take: limit }),
      prisma.artist.count(),
    ]);
    res.json({ items: items.map(a => ({ ...a, listeners: Number(a.listeners) })), total, page, limit });
  } catch (e: any) { return adminError(res, 'GET /artists', e, 500); }
});
router.post('/artists', async (req, res) => {
  try { res.status(201).json(await prisma.artist.create({ data: { name: req.body.name } })); }
  catch (e: any) { return adminError(res, 'POST /artists', e); }
});
router.put('/artists/:id', async (req, res) => {
  try { res.json(await prisma.artist.update({ where: { id: req.params.id }, data: { name: req.body.name } })); }
  catch (e: any) { return adminError(res, 'PUT /artists/:id', e); }
});
router.delete('/artists/:id', async (req, res) => {
  try { await prisma.artist.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /artists/:id', e); }
});

// ─── Artist Moderation ────────────────────────────────────────────────────
// For a set of artists, find OTHER artists sharing the same normalized name —
// the duplicate-name signal the moderator needs when approving a verification.
// Returns a map artistId → [{ id, name, verified }].
async function duplicatesByArtist(
  artists: { id: string; nameNorm: string | null }[],
): Promise<Map<string, { id: string; name: string; verified: boolean }[]>> {
  const map = new Map<string, { id: string; name: string; verified: boolean }[]>();
  const norms = [...new Set(artists.map(a => a.nameNorm).filter((n): n is string => !!n))];
  if (!norms.length) return map;
  const same = await prisma.artist.findMany({
    where: { nameNorm: { in: norms } },
    select: { id: true, name: true, nameNorm: true, status: true },
  });
  for (const a of artists) {
    if (!a.nameNorm) continue;
    const dups = same
      .filter(s => s.nameNorm === a.nameNorm && s.id !== a.id)
      .map(s => ({ id: s.id, name: s.name, verified: s.status === 'VERIFIED' }));
    if (dups.length) map.set(a.id, dups);
  }
  return map;
}

// Who is shown in the moderation queue: verificationRequestedBy (who asked for
// THIS verification) with a fallback to submittedByUser (legacy rows / creator).
const MODERATION_USER_SELECT = { id: true, firstName: true, lastName: true, avatar: true } as const;

// GET /admin/artists/pending — list artists awaiting moderation
router.get('/artists/pending', authenticate, requireAdmin, async (_req, res) => {
  try {
    const artists = await prisma.artist.findMany({
      where: { status: 'PENDING' },
      include: {
        submittedByUser: { select: MODERATION_USER_SELECT },
        verificationRequestedBy: { select: MODERATION_USER_SELECT },
        genres: { include: { genre: true } },
        _count: { select: { followers: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });
    const dupMap = await duplicatesByArtist(artists);
    res.json(artists.map(a => ({
      ...a, listeners: Number(a.listeners), genres: a.genres.map(ag => ag.genre), followersCount: a._count.followers, duplicates: dupMap.get(a.id) || [],
      verificationRequestedBy: a.verificationRequestedBy ?? a.submittedByUser,
    })));
  } catch (e: any) { return adminError(res, 'GET /artists/pending', e, 500); }
});

// GET /admin/artists/verification — list PENDING artists with proof URL awaiting verification
router.get('/artists/verification', authenticate, requireAdmin, async (_req, res) => {
  try {
    const artists = await prisma.artist.findMany({
      where: { status: 'PENDING', verificationProofUrl: { not: null } },
      include: {
        submittedByUser: { select: MODERATION_USER_SELECT },
        verificationRequestedBy: { select: MODERATION_USER_SELECT },
        genres: { include: { genre: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });
    const dupMap = await duplicatesByArtist(artists);
    res.json(artists.map(a => ({
      ...a, listeners: Number(a.listeners), genres: a.genres.map(ag => ag.genre), duplicates: dupMap.get(a.id) || [],
      verificationRequestedBy: a.verificationRequestedBy ?? a.submittedByUser,
    })));
  } catch (e: any) { return adminError(res, 'GET /artists/verification', e, 500); }
});

// Recipients of an artist moderation result: the artist's current ACCEPTED owners
// and admins (rights live only in UserArtist — lib/artistAccess) plus whoever
// requested this verification. submittedById (the original creator, who may have
// left the artist long ago) is only a fallback when there is nobody else.
async function artistNotifyRecipients(artist: {
  id: string; submittedById: string | null; verificationRequestedById: string | null;
}): Promise<string[]> {
  const ids = new Set(await artistAdminIds(artist.id));
  if (artist.verificationRequestedById) ids.add(artist.verificationRequestedById);
  if (!ids.size && artist.submittedById) ids.add(artist.submittedById);
  return [...ids];
}

// PATCH /admin/artists/:id/reject — reject with reason
router.patch('/artists/:id/reject', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body as { reason?: string };
    const artist = await prisma.artist.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason || null,
        moderatedAt: new Date(),
      },
    });

    const recipients = await artistNotifyRecipients(artist);
    const reasonText = reason ? ` Причина: ${reason}.` : '';
    await notifyMany(recipients, {
      actorId: req.userId, type: 'artist_rejected',
      title: 'Заявка отклонена',
      body: `Заявка на верификацию «${artist.name}» отклонена.${reasonText} Исправьте данные и отправьте повторно.`,
      link: `/artist/${artist.id}`,
    });
    void notifyVerificationDecision(artist, 'rejected', reason);

    res.json({ ...artist, listeners: Number(artist.listeners) });
  } catch (e: any) { return adminError(res, 'PATCH /artists/:id/reject', e); }
});

// PATCH /admin/artists/:id/verify — mark artist as VERIFIED after checking proof
router.patch('/artists/:id/verify', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const artist = await prisma.artist.update({
      where: { id: req.params.id },
      data: { status: 'VERIFIED', moderatedAt: new Date() },
    });

    const recipients = await artistNotifyRecipients(artist);
    await notifyMany(recipients, {
      actorId: req.userId, type: 'artist_verified',
      title: 'Артист верифицирован',
      body: `Артист «${artist.name}» успешно верифицирован и добавлен в каталог`,
      link: `/artist/${artist.id}`,
    });
    void notifyVerificationDecision(artist, 'verified');
    // Свежие данные Яндекс Музыки сразу после верификации, не следующей ночью.
    if (artist.ymId) void syncArtistNow(artist.id, 'verified');

    res.json({ ...artist, listeners: Number(artist.listeners) });
  } catch (e: any) { return adminError(res, 'PATCH /artists/:id/verify', e); }
});


// ─── Custom Filters ────────────────────────────────────────────────────────
router.get('/custom-filters', async (_req, res) => {
  const filters = await prisma.customFilter.findMany({
    include: {
      values: { orderBy: { sortOrder: 'asc' } },
      directions: {
        select: {
          id: true,
          name: true,
          fieldOfActivity: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(filters);
});
router.post('/custom-filters', async (req, res) => {
  try {
    const { name, values = [] } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const filter = await prisma.customFilter.create({
      data: {
        name,
        values: { create: (values as string[]).map((v, i) => ({ value: v, sortOrder: i })) },
      },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
    });
    res.status(201).json(filter);
  } catch (e: any) { return adminError(res, 'POST /custom-filters', e); }
});
router.put('/custom-filters/:id', async (req, res) => {
  try {
    const { name, values } = req.body;
    if (values !== undefined && !Array.isArray(values)) return res.status(400).json({ error: 'values должен быть массивом' });
    const filterId = req.params.id;
    const exists = await prisma.customFilter.findUnique({ where: { id: filterId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: 'Запись не найдена' });

    // Значения обновляем ДИФФОМ, сохраняя id: раньше deleteMany+create при любой
    // правке пересоздавал все значения с новыми id — и у всех пользователей,
    // заказов и вакансий молча пропадали выбранные значения этого фильтра.
    const ops: any[] = [];
    if (values !== undefined) {
      const incoming = (values as unknown[]).map(v => String(v ?? '').trim()).filter(Boolean);
      const existing = await prisma.customFilterValue.findMany({ where: { filterId }, orderBy: { sortOrder: 'asc' } });
      const used = new Set<string>();
      const plan: Array<{ id?: string; value: string; sortOrder: number }> = incoming.map((value, sortOrder) => ({ value, sortOrder }));
      // 1) точное совпадение текста — то же значение;
      for (const item of plan) {
        const ex = existing.find(e => !used.has(e.id) && e.value === item.value);
        if (ex) { item.id = ex.id; used.add(ex.id); }
      }
      // 2) на той же позиции свободное старое значение — это переименование.
      for (const item of plan) {
        if (item.id) continue;
        const ex = existing[item.sortOrder];
        if (ex && !used.has(ex.id)) { item.id = ex.id; used.add(ex.id); }
      }
      const toDelete = existing.filter(e => !used.has(e.id)).map(e => e.id);
      if (toDelete.length) ops.push(prisma.customFilterValue.deleteMany({ where: { id: { in: toDelete } } }));
      for (const item of plan) {
        ops.push(item.id
          ? prisma.customFilterValue.update({ where: { id: item.id }, data: { value: item.value, sortOrder: item.sortOrder } })
          : prisma.customFilterValue.create({ data: { filterId, value: item.value, sortOrder: item.sortOrder } }));
      }
    }
    if (name !== undefined) ops.push(prisma.customFilter.update({ where: { id: filterId }, data: { name } }));
    if (ops.length) await prisma.$transaction(ops);

    const filter = await prisma.customFilter.findUnique({
      where: { id: filterId },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json(filter);
  } catch (e: any) { return adminError(res, 'PUT /custom-filters/:id', e); }
});
router.delete('/custom-filters/:id', async (req, res) => {
  try { await prisma.customFilter.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { return adminError(res, 'DELETE /custom-filters/:id', e); }
});

// ─── User Management ──────────────────────────────────────────────────────────
// ── POST /admin/users — create user ──────────────────────────────────────────
router.post('/users', async (req, res) => {
  try {
    const { email, password, firstName, lastName, nickname, phone, city, country, bio, isAdmin } = req.body;
    if (!firstName?.trim() || !lastName?.trim()) return res.status(400).json({ error: 'Имя и фамилия обязательны' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    if (!email?.trim()) return res.status(400).json({ error: 'Email обязателен' });

    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'Email уже занят' });

    if (nickname?.trim()) {
      const nclash = await prisma.user.findFirst({ where: { nicknameNorm: yoNorm(nickname.trim()) }, select: { id: true } });
      if (nclash) return res.status(409).json({ error: 'Этот никнейм уже занят' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        password: hashed,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname?.trim() || null,
        phone: phone?.trim() || null,
        city: city?.trim() || null,
        country: country?.trim() || null,
        bio: bio?.trim() || null,
        isAdmin: !!isAdmin,
      },
      select: {
        id: true, firstName: true, lastName: true, nickname: true,
        email: true, avatar: true, isAdmin: true, isBlocked: true,
        isPremium: true, isVerified: true, isPro: true, proUntil: true, createdAt: true,
        city: true, country: true, bio: true, phone: true,
      },
    });
    res.status(201).json(user);
  } catch (e: any) { return adminError(res, 'POST /users', e); }
});

// ── PATCH /admin/users/:id — edit user card ───────────────────────────────────
router.patch('/users/:id', async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, nickname, email, phone, city, country, bio, password, isAdmin } = req.body;
    // Админ не может снять права администратора с самого себя (иначе можно
    // остаться без единого админа).
    if (req.params.id === req.userId && isAdmin !== undefined && !isAdmin) {
      return res.status(400).json({ error: 'Нельзя снять права администратора с самого себя' });
    }
    if (password !== undefined && password !== null && password !== '' && (typeof password !== 'string' || password.length < 6)) {
      return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    }
    const data: Record<string, any> = {};
    if (firstName !== undefined) data.firstName = firstName.trim();
    if (lastName !== undefined) data.lastName = lastName.trim();
    if (nickname !== undefined) {
      const nk = (nickname ?? '').trim();
      if (nk) {
        const nclash = await prisma.user.findFirst({ where: { nicknameNorm: yoNorm(nk), NOT: { id: req.params.id } }, select: { id: true } });
        if (nclash) return res.status(409).json({ error: 'Этот никнейм уже занят' });
      }
      data.nickname = nk || null;
    }
    if (email !== undefined) data.email = email.trim().toLowerCase() || null;
    if (phone !== undefined) data.phone = phone.trim() || null;
    if (city !== undefined) data.city = city.trim() || null;
    if (country !== undefined) data.country = country.trim() || null;
    if (bio !== undefined) data.bio = bio.trim() || null;
    if (isAdmin !== undefined) data.isAdmin = !!isAdmin;
    const passwordChanged = typeof password === 'string' && password.length >= 6;
    if (passwordChanged) {
      data.password = await bcrypt.hash(password, 10);
      // Инвалидация всех выданных токенов (middleware/auth сравнивает iat).
      data.passwordChangedAt = new Date();
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true, firstName: true, lastName: true, nickname: true,
        email: true, avatar: true, isAdmin: true, isBlocked: true,
        isPremium: true, isVerified: true, isPro: true, proUntil: true, createdAt: true,
        city: true, country: true, bio: true, phone: true,
      },
    });
    if (passwordChanged) kickUserSockets(user.id, 'password_changed');
    res.json(user);
  } catch (e: any) {
    // TOCTOU on nickname: a concurrent change can pass the pre-check and trip the
    // DB unique index — return a clean 409 rather than leaking the raw DB error.
    if (e?.code === 'P2002') {
      const target = String(e?.meta?.target ?? '');
      if (target.toLowerCase().includes('nickname')) return res.status(409).json({ error: 'Этот никнейм уже занят' });
      if (target.toLowerCase().includes('email')) return res.status(409).json({ error: 'Email уже занят' });
      return res.status(409).json({ error: 'Значение уже занято' });
    }
    return adminError(res, 'PATCH /users/:id', e);
  }
});

function usersWhere(search: string) {
  const sq = yoNorm(search);
  return search ? {
    OR: [
      { firstNameNorm: { contains: sq } },
      { lastNameNorm: { contains: sq } },
      { nicknameNorm: { contains: sq } },
      { emailNorm: { contains: sq } },
    ],
  } : {};
}

router.get('/users', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const where = usersWhere(search);
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, firstName: true, lastName: true, nickname: true,
          email: true, avatar: true, isAdmin: true, isBlocked: true, blockedUntil: true,
          isPremium: true, isVerified: true, isPro: true, proUntil: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ users, total, page, limit });
  } catch (e: any) { return adminError(res, 'GET /users', e, 500); }
});

// Полная выгрузка пользователей для Excel. GET /users режет limit до 50, и
// выгрузка с limit=9999 молча обрезалась до первой страницы. Здесь — все
// пользователи (пачками по 1000), с полями для таблицы.
const USERS_EXPORT_MAX = 100_000;
router.get('/users/export', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const where = usersWhere(search);
    const select = {
      id: true, firstName: true, lastName: true, nickname: true, email: true, phone: true,
      city: true, country: true, isAdmin: true, isBlocked: true, blockedUntil: true,
      isPremium: true, isPro: true, proUntil: true, createdAt: true,
    } as const;
    const out: any[] = [];
    let cursor: string | undefined;
    while (out.length < USERS_EXPORT_MAX) {
      const batch = await prisma.user.findMany({
        where, select, orderBy: { id: 'asc' }, take: 1000,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      out.push(...batch);
      if (batch.length < 1000) break;
      cursor = batch[batch.length - 1].id;
    }
    out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json({ users: out, total: out.length });
  } catch (e: any) { return adminError(res, 'GET /users/export', e, 500); }
});

router.patch('/users/:id/verify-email', async (req, res) => {
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { emailVerified: true, emailVerificationCode: null, emailVerificationExpires: null },
      select: { id: true, email: true, emailVerified: true },
    });
    res.json(updated);
  } catch (e: any) { return adminError(res, 'PATCH /users/:id/verify-email', e); }
});

// Тумблеры — только с ЯВНЫМ целевым значением { value: true|false }: повторный
// клик/устаревшая карточка больше не инвертирует состояние «вслепую»
// (раньше «Снять Pro» по устаревшим данным мог выдать вечный isPro).
function explicitValue(req: { body: any }): boolean | null {
  const v = req.body?.value;
  return typeof v === 'boolean' ? v : null;
}

// Блокировка: value=true — бессрочная ручная блокировка (isBlocked);
// value=false — полная разблокировка: чистим и isBlocked, и временный blockedUntil.
router.patch('/users/:id/block', async (req: AuthRequest, res) => {
  try {
    const value = explicitValue(req);
    if (value === null) return res.status(400).json({ error: 'Укажите value: true | false' });
    if (value && req.params.id === req.userId) return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: value ? { isBlocked: true } : { isBlocked: false, blockedUntil: null },
      select: { id: true, isBlocked: true, blockedUntil: true },
    });
    if (value) kickUserSockets(updated.id, 'blocked');
    res.json(updated);
  } catch (e: any) { return adminError(res, 'PATCH /users/:id/block', e); }
});

router.patch('/users/:id/premium', async (req, res) => {
  try {
    const value = explicitValue(req);
    if (value === null) return res.status(400).json({ error: 'Укажите value: true | false' });
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isPremium: value },
      select: { id: true, isPremium: true },
    });
    res.json(updated);
  } catch (e: any) { return adminError(res, 'PATCH /users/:id/premium', e); }
});

// Pro: value=true → вечный ручной Pro (isPro); value=false → полностью снять
// (isPro=false и proUntil=null — аннулирует и ошибочно принятый донат).
router.patch('/users/:id/pro', async (req, res) => {
  try {
    const value = explicitValue(req);
    if (value === null) return res.status(400).json({ error: 'Укажите value: true | false' });
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: value ? { isPro: true } : { isPro: false, proUntil: null },
      select: { id: true, isPro: true, proUntil: true },
    });
    res.json(updated);
  } catch (e: any) { return adminError(res, 'PATCH /users/:id/pro', e); }
});

router.delete('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    if (req.params.id === req.userId) return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Нельзя оставить артиста без владельца: UserArtist удалится каскадом, и у
    // артиста не останется никого с правами. Сначала передайте владение.
    const owned = await prisma.artist.findMany({
      where: {
        OR: [
          { userArtists: { some: { userId: user.id, isOwner: true, inviteStatus: 'ACCEPTED' } } },
          // legacy: создатель артиста без строки владельца
          { submittedById: user.id, userArtists: { none: { isOwner: true, inviteStatus: 'ACCEPTED' } } },
        ],
      },
      select: { id: true, name: true },
      take: 10,
    });
    if (owned.length > 0) {
      return res.status(409).json({
        error: `Пользователь — владелец артистов: ${owned.map(a => `«${a.name}»`).join(', ')}. Передайте владение другому участнику (или удалите артиста) перед удалением пользователя.`,
        artists: owned,
      });
    }
    // Cascade deletes are handled by Prisma FK onDelete: Cascade rules.
    await prisma.user.delete({ where: { id: req.params.id } });
    kickUserSockets(user.id);
    res.json({ ok: true });
  } catch (e: any) { return adminError(res, 'DELETE /users/:id', e); }
});

// ── User Service Moderation ───────────────────────────────────────────────────

router.get('/user-services/pending', async (req, res) => {
  try {
    const { page, limit, skip } = pageParams(req);
    const where = { status: 'pending_review' };
    const [services, total] = await Promise.all([
      prisma.userService.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          service: { select: { name: true } },
          profession: { select: { name: true } },
        },
        orderBy: { updatedAt: 'asc' },
        skip, take: limit,
      }),
      prisma.userService.count({ where }),
    ]);
    res.json({ items: services, total, page, limit });
  } catch (e: any) { return adminError(res, 'GET /user-services/pending', e, 500); }
});

router.patch('/user-services/:id/approve', async (req, res) => {
  try {
    const us = await prisma.userService.update({
      where: { id: req.params.id },
      data: { status: 'active' },
      select: { id: true, userId: true, service: { select: { name: true } } },
    });
    await notify({
      userId: us.userId,
      type: 'service_approved_ready_to_post',
      title: 'Услуга опубликована',
      body: `Ваша услуга «${us.service.name}» прошла модерацию и теперь видна в каталоге`,
      link: `/services/${us.id}?showPostDialog=1`,
    });
    res.json({ ok: true });
  } catch (e: any) { return adminError(res, 'PATCH /user-services/:id/approve', e, 500); }
});

router.patch('/user-services/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body as { reason?: string };
    const us = await prisma.userService.update({
      where: { id: req.params.id },
      data: { status: 'draft' },
      select: { id: true, userId: true, service: { select: { name: true } } },
    });
    await notify({
      userId: us.userId,
      type: 'service_rejected',
      title: 'Услуга не прошла модерацию',
      body: reason ? `«${us.service.name}»: ${reason}` : `Услуга «${us.service.name}» возвращена в черновики`,
      link: `/services/${us.id}`,
    });
    res.json({ ok: true });
  } catch (e: any) { return adminError(res, 'PATCH /user-services/:id/reject', e, 500); }
});

// ─── Pro Donations ───────────────────────────────────────────────────────────
const donationUserSelect = {
  id: true, firstName: true, lastName: true, nickname: true,
  email: true, proUntil: true, isPro: true,
} as const;

const withIsPro = <T extends { user: { isPro: boolean; proUntil: Date | null } }>(row: T) => ({
  ...row,
  user: { ...row.user, isPro: isProActive(row.user) },
});

// GET /admin/donations — list donation codes (newest first), optional ?status= filter.
// Pending (non-ACTIVATED) rows are surfaced first so the team sees them at a glance.
const DONATION_STATUSES = ['CREATED', 'PAID', 'ACTIVATED'];

router.get('/donations', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status && !DONATION_STATUSES.includes(status)) return res.status(400).json({ error: 'Некорректный статус' });
    const { page, limit, skip } = pageParams(req);
    const where = status ? { status: status as any } : {};
    // Pending (non-ACTIVATED) rows first: enum order CREATED < PAID < ACTIVATED,
    // newest first within each group — сортировка в БД, чтобы работала пагинация.
    const [donations, total] = await Promise.all([
      prisma.donationCode.findMany({
        where,
        include: { user: { select: donationUserSelect } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip, take: limit,
      }),
      prisma.donationCode.count({ where }),
    ]);
    res.json({ items: donations.map(withIsPro), total, page, limit });
  } catch (e: any) { return adminError(res, 'GET /donations', e, 500); }
});

// POST /admin/donations/:id/activate — grant a Pro month and mark the code ACTIVATED.
// Атомарно: сначала условный перевод в ACTIVATED (двойной клик/две вкладки →
// второй получает 409), и только потом выдача месяца Pro.
router.post('/donations/:id/activate', async (req, res) => {
  try {
    const donation = await prisma.donationCode.findUnique({ where: { id: req.params.id } });
    if (!donation) return res.status(404).json({ error: 'Донат не найден' });
    if (donation.status === 'ACTIVATED') return res.status(409).json({ error: 'Донат уже активирован' });

    const { amount, note } = (req.body ?? {}) as { amount?: number | null; note?: string };
    const data: any = { status: 'ACTIVATED', activatedAt: new Date() };
    if (amount !== undefined) {
      if (amount === null) data.amount = null;
      else {
        const n = Number(amount);
        if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'Некорректная сумма' });
        data.amount = n;
      }
    }
    if (note !== undefined) data.note = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;

    const tr = await prisma.donationCode.updateMany({
      where: { id: donation.id, status: { not: 'ACTIVATED' } },
      data,
    });
    if (tr.count === 0) return res.status(409).json({ error: 'Донат уже активирован' });

    try {
      await grantProMonth(donation.userId, 'donation');
    } catch (err: any) {
      // Не удалось выдать Pro — откатываем статус, чтобы можно было повторить.
      await prisma.donationCode.updateMany({
        where: { id: donation.id, status: 'ACTIVATED' },
        data: { status: donation.status, activatedAt: donation.activatedAt, amount: donation.amount, note: donation.note },
      });
      throw err;
    }

    const updated = await prisma.donationCode.findUnique({
      where: { id: donation.id },
      include: { user: { select: donationUserSelect } },
    });
    res.json(updated ? withIsPro(updated) : { ok: true });
  } catch (e: any) { return adminError(res, 'POST /donations/:id/activate', e); }
});

// POST /admin/users/:id/grant-pro-month — manual fallback for the "forgot the code" case.
router.post('/users/:id/grant-pro-month', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const proUntil = await grantProMonth(user.id, 'admin');
    res.json({ proUntil });
  } catch (e: any) { return adminError(res, 'POST /users/:id/grant-pro-month', e); }
});

// ── Site Settings ──────────────────────────────────────────────────────────────
import { updateSiteSettings } from './site-settings';

// Разрешённые настройки и их значения. Произвольные ключи/значения больше не
// пишутся в SiteSetting (раньше PUT принимал что угодно).
// guestBrowsingEnabled — аварийный выключатель гостевого режима (по умолчанию 'false').
const SITE_SETTING_FLAGS = new Set(['loginEnabled', 'registrationEnabled', 'referralRegistrationEnabled', 'guestBrowsingEnabled', 'jobsChannelEnabled', 'waitlistAutoInvite', 'androidApkEnabled']);

router.put('/site-settings', async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Ожидается объект настроек' });
    }
    const entries = Object.entries(body as Record<string, unknown>);
    if (entries.length === 0) return res.status(400).json({ error: 'Нет изменений' });
    const updates: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (!SITE_SETTING_FLAGS.has(key)) return res.status(400).json({ error: `Неизвестная настройка: ${key}` });
      const v = typeof value === 'boolean' ? String(value) : value;
      if (v !== 'true' && v !== 'false') return res.status(400).json({ error: `Значение «${key}» — 'true' или 'false'` });
      updates[key] = v;
    }
    await updateSiteSettings(updates);
    res.json({ ok: true });
  } catch (e: any) {
    return adminError(res, 'PUT /site-settings', e);
  }
});

export default router;
