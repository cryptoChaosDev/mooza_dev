/**
 * /api/requests — «Ищу музыканта»: разбор (гость можно), создание заказа
 * (только вошедший, ≤ 5 в сутки), рассылка подходящим.
 *
 * Prisma, notify и auth замоканы — реальная БД не нужна. Справочники — из
 * реальных сидов каталога (helpers/requestDictFixture).
 */

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { buildRequestDict, pid, sid } from './helpers/requestDictFixture';

const ME = 'user-me';

jest.mock('../middleware/auth', () => ({
  authenticate: (req: Request & { userId?: string }, res: Response, next: NextFunction) => {
    const id = req.headers['x-test-user-id'];
    if (!id) return res.status(401).json({ error: 'Требуется аутентификация', code: 'TOKEN_MISSING' });
    req.userId = id as string;
    next();
  },
  optionalAuthenticate: (req: Request & { userId?: string }, _res: Response, next: NextFunction) => {
    const id = req.headers['x-test-user-id'];
    if (id) req.userId = id as string;
    next();
  },
}));

const mockNotify = jest.fn();
jest.mock('../utils/notify', () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
  isNotificationEnabled: jest.fn().mockResolvedValue(true),
}));

const mockPrisma: any = {
  profession: { findMany: jest.fn() },
  genre: { findMany: jest.fn() },
  city: { findMany: jest.fn() },
  service: { findMany: jest.fn() },
  user: { findMany: jest.fn(), count: jest.fn() },
  userService: { groupBy: jest.fn() },
  review: { groupBy: jest.fn() },
  order: { create: jest.fn() },
  post: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  musicianRequest: { count: jest.fn(), create: jest.fn(), update: jest.fn() },
  orderMatchNotification: { groupBy: jest.fn(), findMany: jest.fn(), createMany: jest.fn() },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  $transaction: jest.fn(),
};
jest.mock('../index', () => ({ prisma: mockPrisma }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { findGuestForbiddenKeys } = require('../lib/publicData');

function buildApp() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const router = require('../routes/requests').default;
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/requests', router);
  return app;
}

const asUser = (id: string) => ({ 'x-test-user-id': id });
const TEXT = 'нужен барабанщик на концерт 20 ноября в Самаре, метал, бюджет 10 000';

function candidate(id: string, consent = true) {
  return {
    id, firstName: `Имя-${id}`, lastName: 'Ф', nickname: null, avatar: null, city: 'Самара', genres: [],
    occupancyStatus: 'open', lastSeenAt: new Date(), notificationPrefs: null,
    publicConsentAt: consent ? new Date('2026-01-01') : null, isBlocked: false, blockedUntil: null,
    isVerified: false, isPremium: false,
    userServices: [{
      professionId: pid('Барабанщик'), priceFrom: 5000, priceTo: 20000, profession: { name: 'Барабанщик' },
      genres: [], geographies: [], workFormats: [], selectedCustomFilterValues: [],
    }],
    userProfessions: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  const dict = buildRequestDict();
  mockPrisma.profession.findMany.mockResolvedValue(dict.professions);
  mockPrisma.genre.findMany.mockResolvedValue(dict.genres);
  mockPrisma.city.findMany.mockResolvedValue(dict.cities);
  mockPrisma.service.findMany.mockResolvedValue(dict.services.map((s, i) => ({
    id: s.id, name: s.name, sortOrder: i,
    section: { name: s.sectionName, sortOrder: Math.floor(s.order / 10_000) },
    serviceProfessions: s.professionIds.map((professionId) => ({ professionId })),
  })));
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.user.count.mockResolvedValue(12);
  mockPrisma.userService.groupBy.mockResolvedValue([]);
  mockPrisma.review.groupBy.mockResolvedValue([]);
  mockPrisma.order.create.mockImplementation(async ({ data }: any) => ({ id: 'order-1', ...data }));
  mockPrisma.post.findFirst.mockResolvedValue(null);
  mockPrisma.post.create.mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }));
  mockPrisma.musicianRequest.count.mockResolvedValue(0);
  mockPrisma.musicianRequest.create.mockResolvedValue({ id: 'mr-1' });
  mockPrisma.musicianRequest.update.mockResolvedValue({});
  mockPrisma.orderMatchNotification.groupBy.mockResolvedValue([]);
  mockPrisma.orderMatchNotification.findMany.mockResolvedValue([]);
  mockPrisma.orderMatchNotification.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.$executeRaw.mockResolvedValue(1);
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
});

describe('POST /api/requests/parse', () => {
  it('гость получает разбор, чипы и примерное число подходящих', async () => {
    const res = await request(buildApp()).post('/api/requests/parse').send({ text: TEXT });
    expect(res.status).toBe(200);
    expect(res.body.parsed.professionIds).toEqual([pid('Барабанщик')]);
    expect(res.body.parsed.cityName).toBe('Самара');
    expect(res.body.parsed.budgetTo).toBe(10000);
    expect(res.body.chips.map((c: any) => c.label)).toEqual(expect.arrayContaining([
      'Профессия: Барабанщик', 'Город: Самара', 'Дата: 20.11.2026', 'Бюджет: до 10 000 ₽', 'Жанр: Метал',
    ]));
    expect(res.body.service).toEqual(expect.objectContaining({ id: sid('Запись барабанных партий') }));
    expect(res.body.estimatedMatches).toBe(12);
    expect(res.body.needsProfession).toBe(false);
    expect(findGuestForbiddenKeys(res.body)).toEqual([]);
    // Гость не исключается как «автор»
    expect(JSON.stringify(mockPrisma.user.count.mock.calls[0][0].where)).not.toContain('"not"');
  });

  it('нераспознанная профессия → needsProfession, правки применяются', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/requests/parse').send({ text: 'Нужен музыкант на праздник в Казани' });
    expect(res.body.needsProfession).toBe(true);
    expect(res.body.estimatedMatches).toBe(0);

    const res2 = await request(app).post('/api/requests/parse').set(asUser(ME)).send({
      text: 'Нужен музыкант на праздник в Казани',
      overrides: { professionIds: [pid('Саксофонист')], city: null },
    });
    expect(res2.body.needsProfession).toBe(false);
    expect(res2.body.parsed.professionIds).toEqual([pid('Саксофонист')]);
    expect(res2.body.parsed.cityName).toBeNull();
    expect(res2.body.serviceOptions.map((s: any) => s.id)).toContain(sid('Запись партий саксофона'));
    // Вошедший исключается из подсчёта
    expect(JSON.stringify(mockPrisma.user.count.mock.calls[0][0].where)).toContain(`"not":"${ME}"`);
  });

  it('пустой текст — пустой разбор без ошибки', async () => {
    const res = await request(buildApp()).post('/api/requests/parse').send({ text: '' });
    expect(res.status).toBe(200);
    expect(res.body.needsProfession).toBe(true);
    expect(res.body.chips).toEqual([]);
  });
});

describe('POST /api/requests', () => {
  it('гость не может создать запрос', async () => {
    const res = await request(buildApp()).post('/api/requests').send({ text: TEXT });
    expect(res.status).toBe(401);
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });

  it('создаёт активный заказ с постом в Потоке и уведомляет подходящих', async () => {
    mockPrisma.user.findMany.mockResolvedValue([candidate('u1'), candidate('u2', false)]);
    const res = await request(buildApp()).post('/api/requests').set(asUser(ME)).send({ text: TEXT });
    expect(res.status).toBe(201);
    expect(res.body.orderId).toBe('order-1');
    expect(res.body.notifiedCount).toBe(2);
    expect(res.body.remainingToday).toBe(4);
    // В превью — только публичный профиль
    expect(res.body.previewUsers.map((u: any) => u.id)).toEqual(['u1']);

    const data = mockPrisma.order.create.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({
      authorId: ME,
      serviceId: sid('Запись барабанных партий'),
      title: 'Барабанщик на концерт, Самара, 20.11',
      status: 'active',
      budgetFrom: null,
      budgetTo: 10000,
      description: TEXT,
    }));
    expect(data.deadline.toISOString()).toBe('2026-11-20T20:59:59.999Z');
    expect(mockPrisma.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'order', authorId: ME, orderId: 'order-1', city: 'Самара', genres: ['Метал'] }),
    });
    expect(mockPrisma.musicianRequest.create).toHaveBeenCalledWith({
      data: { userId: ME, orderId: 'order-1', professionIds: [pid('Барабанщик')] },
    });
    expect(mockPrisma.musicianRequest.update).toHaveBeenCalledWith({ where: { id: 'mr-1' }, data: { notifiedCount: 2 } });
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ type: 'order_match', link: '/orders/order-1', actorId: ME }));
    // Лимит проверяется под advisory-lock на пользователя
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('лимит 5 запросов в сутки → 429, заказ не создаётся', async () => {
    mockPrisma.musicianRequest.count.mockResolvedValue(5);
    const res = await request(buildApp()).post('/api/requests').set(asUser(ME)).send({ text: TEXT });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('DAILY_LIMIT');
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
    const where = mockPrisma.musicianRequest.count.mock.calls[0][0].where;
    expect(where.userId).toBe(ME);
    expect(Date.now() - where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(24 * 3600_000 - 5000);
  });

  it('без профессии → 400 PROFESSION_REQUIRED', async () => {
    const res = await request(buildApp()).post('/api/requests').set(asUser(ME)).send({ text: 'Нужен музыкант на праздник' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROFESSION_REQUIRED');
  });

  it('некорректные правки (дата в прошлом) → 400', async () => {
    const res = await request(buildApp()).post('/api/requests').set(asUser(ME))
      .send({ text: TEXT, overrides: { date: '01.01.2020' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Дата не может быть в прошлом');
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });

  it('профессия без услуги в каталоге: берём частую услугу исполнителей, иначе 422', async () => {
    const res = await request(buildApp()).post('/api/requests').set(asUser(ME)).send({ text: 'Нужен фотограф на концерт' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_SERVICE');

    mockPrisma.userService.groupBy.mockResolvedValue([{ serviceId: sid('Дизайн обложки'), _count: { serviceId: 3 } }]);
    const ok = await request(buildApp()).post('/api/requests').set(asUser(ME)).send({ text: 'Нужен фотограф на концерт' });
    expect(ok.status).toBe(201);
    expect(mockPrisma.order.create.mock.calls[0][0].data.serviceId).toBe(sid('Дизайн обложки'));
  });

  it('сбой подбора не отменяет созданный заказ', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPrisma.user.findMany.mockRejectedValue(new Error('db down'));
    const res = await request(buildApp()).post('/api/requests').set(asUser(ME)).send({ text: TEXT });
    expect(res.status).toBe(201);
    expect(res.body.notifiedCount).toBe(0);
    expect(spy).toHaveBeenCalledWith('[requests] matching failed', expect.any(Error));
    spy.mockRestore();
  });
});

describe('GET /api/requests/quota', () => {
  it('показывает остаток на сегодня', async () => {
    mockPrisma.musicianRequest.count.mockResolvedValue(2);
    const res = await request(buildApp()).get('/api/requests/quota').set(asUser(ME));
    expect(res.body).toEqual({ limit: 5, used: 2, remaining: 3 });
  });
});

describe('rate limit разбора для гостя', () => {
  it('после 30 запросов в минуту с одного IP — 429', async () => {
    const app = buildApp();
    let firstLimited = -1;
    for (let i = 0; i < 40; i++) {
      const res = await request(app).post('/api/requests/parse').set('X-Forwarded-For', '203.0.113.7').send({ text: 'барабанщик' });
      if (res.status === 429) { firstLimited = i; break; }
    }
    expect(firstLimited).toBe(30);
  });
});
