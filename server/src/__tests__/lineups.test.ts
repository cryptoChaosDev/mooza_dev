/**
 * «Биржа лайнапов» (/api/lineups):
 *   - права: откликается только ACCEPTED owner/admin артиста; автор не может
 *     откликнуться на свой запрос (в т.ч. от имени своего артиста); REJECTED-артист;
 *   - уникальность отклика (P2002 → 409, отозванный — можно подать снова);
 *   - гонки accept/decline/withdraw (условные updateMany, откат переполнения мест);
 *   - гость: белый список, без откликов и запрещённых ключей; черновик / заблокированный
 *     автор → 404;
 *   - валидация создания (дата в будущем, слоты, гонорар, город из каталога);
 *   - матчинг: город / «готовы к гастролям» / пересечение жанров, лимиты 20 на запрос
 *     и 5 в сутки на артиста, артисты автора не уведомляются, один админ — одно уведомление.
 *
 * Prisma замокан и ИГНОРИРУЕТ select/where — моки возвращают «грязные» строки,
 * так что проверки доказывают, что ответы собираются по белому списку, а фильтры
 * матчинга перепроверяются в JS.
 */

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { NOW, person } from './helpers/guestTestKit';

// ── Prisma: авто-мок (любая model.method — jest.fn) ─────────────────────────

const mockFns: jest.Mock[] = [];
const mockModels: Record<string, Record<string, jest.Mock>> = {};
function mockDefault(method: string) {
  if (method === 'findMany' || method === 'groupBy') return [];
  if (method === 'count') return 0;
  if (method === 'updateMany' || method === 'deleteMany' || method === 'createMany') return { count: 0 };
  return null;
}
const mockPrisma: any = new Proxy({}, {
  get(_t, model: string) {
    if (model === 'then') return undefined;
    if (model === '$transaction') {
      return async (arg: any) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg));
    }
    if (!mockModels[model]) {
      const fns: Record<string, jest.Mock> = {};
      mockModels[model] = new Proxy(fns, {
        get(target, method: string) {
          if (!target[method]) {
            const fn = jest.fn(async () => mockDefault(method));
            target[method] = fn;
            mockFns.push(fn);
          }
          return target[method];
        },
      });
    }
    return mockModels[model];
  },
});

jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const id = req.headers['x-test-user-id'];
    if (!id) return res.status(401).json({ error: 'Требуется аутентификация' });
    req.userId = id;
    next();
  },
  optionalAuthenticate: (req: any, _res: any, next: any) => {
    const id = req.headers['x-test-user-id'];
    if (id) req.userId = id;
    next();
  },
  invalidateAuthCache: () => {},
}));
jest.mock('../socket', () => ({ emitToUser: jest.fn(), emitToUserWithVisibleAck: jest.fn(), isUserOnline: jest.fn(() => false) }));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  logSecurity: jest.fn(),
  morganStream: { write: jest.fn() },
}));
jest.mock('../utils/notify', () => ({
  notify: jest.fn(async () => {}),
  notifyMany: jest.fn(async () => {}),
  isNotificationEnabled: jest.fn(async () => true),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const notifyMod = require('../utils/notify');
const { findGuestForbiddenKeys } = require('../lib/publicData');
const matching = require('../lib/lineupMatching');
const lineupQuery = require('../lib/lineupQuery');
/* eslint-enable @typescript-eslint/no-require-imports */

function buildApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  app.use('/api/lineups', require('../routes/lineups').default);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => res.status(500).json({ error: String(err?.message ?? err) }));
  return app;
}

const app = buildApp();
const m = (model: string) => mockPrisma[model];

const DAY = 86_400_000;
const FUTURE = new Date(Date.now() + 10 * DAY);
const AUTHOR = 'u-author';
const ADMIN = 'u-adm';
const STRANGER = 'u-stranger';

/** Права артистов: artistId → ACCEPTED owner/admin. */
let ADMINS: Record<string, string[]> = {};

function lineupRow(over: Record<string, unknown> = {}) {
  return {
    id: 'l-1',
    authorId: AUTHOR,
    title: 'Осенний фест',
    eventDate: FUTURE,
    cityId: 'c-msk',
    cityName: 'Москва',
    venue: 'Клуб «Точка»',
    slots: 2,
    slotType: 'opener',
    feeType: 'fixed',
    feeAmount: 30000,
    description: 'Ищем разогрев. Звоните +7 916 123-45-67 или пишите t.me/promo_boss',
    requirements: 'Сет 30 минут, бэклайн есть',
    status: 'active',
    closedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    genres: [{ genre: { id: 'g-rock', name: 'Рок', nameNorm: 'рок' } }],
    author: person(AUTHOR),
    _count: { responses: 3 },
    // «грязь», которой не должно быть в гостевом ответе
    responses: [{ id: 'r-x', message: 'секрет', submittedById: ADMIN }],
    matches: [{ id: 'm-1', artistId: 'a-1' }],
    ...over,
  };
}

function uniqueError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.20.0' });
}

function setupArtistRights() {
  m('userArtist').findFirst.mockImplementation(async ({ where }: any) =>
    (ADMINS[where?.artistId] ?? []).includes(where?.userId) ? { id: `ua-${where.artistId}`, isOwner: true } : null);
  m('userArtist').findMany.mockImplementation(async ({ where }: any) => {
    if (where?.artistId) return (ADMINS[where.artistId] ?? []).map((userId) => ({ userId }));
    if (where?.userId) {
      return Object.entries(ADMINS).filter(([, us]) => us.includes(where.userId)).map(([artistId]) => ({ artistId }));
    }
    return [];
  });
}

beforeEach(() => {
  for (const fn of mockFns) {
    fn.mockReset();
    const method = Object.entries(mockModels).flatMap(([, fns]) => Object.entries(fns)).find(([, f]) => f === fn)?.[0] ?? '';
    fn.mockImplementation(async () => mockDefault(method));
  }
  notifyMod.notify.mockClear();
  notifyMod.notifyMany.mockClear();
  ADMINS = { 'a-1': [ADMIN], 'a-own': [AUTHOR], 'a-rej': [ADMIN] };
  setupArtistRights();
});

// ─────────────────────────────────────────────────────────────────────────────
// Отклик: права и уникальность
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/lineups/:id/respond', () => {
  const respond = (userId: string | null, body: any) => {
    const r = request(app).post('/api/lineups/l-1/respond').send(body);
    return userId ? r.set('x-test-user-id', userId) : r;
  };

  beforeEach(() => {
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow());
    m('artist').findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id, name: `Артист ${where.id}`, status: where.id === 'a-rej' ? 'REJECTED' : 'VERIFIED',
    }));
    m('lineupResponse').create.mockImplementation(async ({ data }: any) => ({ id: 'r-new', status: 'pending', message: data.message, artistId: data.artistId, createdAt: NOW }));
  });

  it('гость → 401', async () => {
    const res = await respond(null, { artistId: 'a-1', message: 'Привет' });
    expect(res.status).toBe(401);
  });

  it('не админ артиста → 403, отклик не создаётся', async () => {
    const res = await respond(STRANGER, { artistId: 'a-1', message: 'Мы готовы' });
    expect(res.status).toBe(403);
    expect(m('lineupResponse').create).not.toHaveBeenCalled();
    // права проверяются через artistAccess: ACCEPTED owner/admin
    const where = m('userArtist').findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ artistId: 'a-1', userId: STRANGER, inviteStatus: 'ACCEPTED' });
  });

  it('автор не может откликнуться на свой запрос', async () => {
    ADMINS['a-1'] = [ADMIN, AUTHOR];
    const res = await respond(AUTHOR, { artistId: 'a-1', message: 'Сам себе' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/свой запрос/);
    expect(m('lineupResponse').create).not.toHaveBeenCalled();
  });

  it('админ артиста, которым управляет и автор, — тоже «свой запрос»', async () => {
    ADMINS['a-1'] = [ADMIN, AUTHOR];
    const res = await respond(ADMIN, { artistId: 'a-1', message: 'Мы тут' });
    expect(res.status).toBe(400);
    expect(m('lineupResponse').create).not.toHaveBeenCalled();
  });

  it('REJECTED-артист → 409', async () => {
    const res = await respond(ADMIN, { artistId: 'a-rej', message: 'Возьмите нас' });
    expect(res.status).toBe(409);
    expect(m('lineupResponse').create).not.toHaveBeenCalled();
  });

  it('закрытый запрос / прошедшее событие / черновик', async () => {
    m('lineupRequest').findUnique.mockResolvedValueOnce(lineupRow({ status: 'closed' }));
    expect((await respond(ADMIN, { artistId: 'a-1', message: 'x' })).status).toBe(409);
    m('lineupRequest').findUnique.mockResolvedValueOnce(lineupRow({ eventDate: new Date(Date.now() - DAY) }));
    expect((await respond(ADMIN, { artistId: 'a-1', message: 'x' })).status).toBe(409);
    m('lineupRequest').findUnique.mockResolvedValueOnce(lineupRow({ status: 'draft' }));
    expect((await respond(ADMIN, { artistId: 'a-1', message: 'x' })).status).toBe(404);
  });

  it('пустое сообщение → 400', async () => {
    const res = await respond(ADMIN, { artistId: 'a-1', message: '   ' });
    expect(res.status).toBe(400);
  });

  it('админ артиста → 201, автор получает уведомление со ссылкой', async () => {
    const res = await respond(ADMIN, { artistId: 'a-1', message: 'Играем панк-рок' });
    expect(res.status).toBe(201);
    expect(m('lineupResponse').create.mock.calls[0][0].data).toMatchObject({
      requestId: 'l-1', artistId: 'a-1', submittedById: ADMIN, status: 'pending',
    });
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: AUTHOR, type: 'lineup_response', link: '/lineups/l-1',
    }));
  });

  it('повторный отклик того же артиста → 409 (уникальность requestId+artistId)', async () => {
    m('lineupResponse').create.mockRejectedValueOnce(uniqueError());
    m('lineupResponse').updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await respond(ADMIN, { artistId: 'a-1', message: 'Ещё раз' });
    expect(res.status).toBe(409);
    // возрождается только отозванный — условно по статусу
    expect(m('lineupResponse').updateMany.mock.calls[0][0].where).toMatchObject({ requestId: 'l-1', artistId: 'a-1', status: 'withdrawn' });
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it('отозванный отклик можно подать снова', async () => {
    m('lineupResponse').create.mockRejectedValueOnce(uniqueError());
    m('lineupResponse').updateMany.mockResolvedValueOnce({ count: 1 });
    m('lineupResponse').findUnique.mockResolvedValueOnce({ id: 'r-old', status: 'pending', message: 'Снова', artistId: 'a-1', createdAt: NOW });
    const res = await respond(ADMIN, { artistId: 'a-1', message: 'Снова' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('r-old');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Принять / отклонить / отозвать — гонки
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/lineups/responses/:id/*', () => {
  const responseRow = (over: Record<string, unknown> = {}) => ({
    id: 'r-1', status: 'pending', artistId: 'a-1', requestId: 'l-1',
    artist: { id: 'a-1', name: 'Группа' },
    request: { id: 'l-1', authorId: AUTHOR, title: 'Осенний фест', slots: 2, status: 'active' },
    ...over,
  });

  beforeEach(() => {
    m('lineupResponse').findUnique.mockResolvedValue(responseRow());
  });

  it('accept: только автор запроса', async () => {
    const res = await request(app).patch('/api/lineups/responses/r-1/accept').set('x-test-user-id', ADMIN);
    expect(res.status).toBe(403);
    expect(m('lineupResponse').updateMany).not.toHaveBeenCalled();
  });

  it('accept: условный переход pending→accepted; второй клик → 409', async () => {
    m('lineupResponse').updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await request(app).patch('/api/lineups/responses/r-1/accept').set('x-test-user-id', AUTHOR);
    expect(res.status).toBe(409);
    expect(m('lineupResponse').updateMany.mock.calls[0][0].where).toMatchObject({ id: 'r-1', status: 'pending', request: { status: 'active' } });
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
  });

  it('accept: гонка за последнее место — переполнение откатывается', async () => {
    m('lineupResponse').updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    m('lineupResponse').count.mockResolvedValueOnce(3); // slots = 2
    const res = await request(app).patch('/api/lineups/responses/r-1/accept').set('x-test-user-id', AUTHOR);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/места/);
    const revert = m('lineupResponse').updateMany.mock.calls[1][0];
    expect(revert).toEqual({ where: { id: 'r-1', status: 'accepted' }, data: { status: 'pending' } });
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
  });

  it('accept: успех — уведомление админам артиста, места заполнены → предложить закрыть', async () => {
    m('lineupResponse').updateMany.mockResolvedValueOnce({ count: 1 });
    m('lineupResponse').count.mockResolvedValueOnce(2);
    const res = await request(app).patch('/api/lineups/responses/r-1/accept').set('x-test-user-id', AUTHOR);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'accepted', acceptedCount: 2, slots: 2, slotsFilled: true });
    expect(notifyMod.notifyMany).toHaveBeenCalledWith([ADMIN], expect.objectContaining({ type: 'lineup_response_accepted', link: '/lineups/l-1' }));
  });

  it('accept на закрытый запрос → 409', async () => {
    m('lineupResponse').findUnique.mockResolvedValueOnce(responseRow({ request: { id: 'l-1', authorId: AUTHOR, title: 'x', slots: 2, status: 'closed' } }));
    const res = await request(app).patch('/api/lineups/responses/r-1/accept').set('x-test-user-id', AUTHOR);
    expect(res.status).toBe(409);
  });

  it('decline: условно из pending/accepted; уже обработан → 409', async () => {
    m('lineupResponse').updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await request(app).patch('/api/lineups/responses/r-1/decline').set('x-test-user-id', AUTHOR);
    expect(res.status).toBe(409);
    expect(m('lineupResponse').updateMany.mock.calls[0][0].where).toMatchObject({ id: 'r-1', status: { in: ['pending', 'accepted'] } });
  });

  it('withdraw: только админ артиста', async () => {
    const res = await request(app).patch('/api/lineups/responses/r-1/withdraw').set('x-test-user-id', AUTHOR);
    expect(res.status).toBe(403);
    expect(m('lineupResponse').updateMany).not.toHaveBeenCalled();
  });

  it('withdraw принятого — автору уведомление, место свободно', async () => {
    m('lineupResponse').updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    const res = await request(app).patch('/api/lineups/responses/r-1/withdraw').set('x-test-user-id', ADMIN);
    expect(res.status).toBe(200);
    expect(m('lineupResponse').updateMany.mock.calls[0][0].where).toEqual({ id: 'r-1', status: 'pending' });
    expect(m('lineupResponse').updateMany.mock.calls[1][0].where).toEqual({ id: 'r-1', status: 'accepted' });
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: AUTHOR, type: 'lineup_response_withdrawn' }));
  });

  it('withdraw уже отозванного → 409', async () => {
    const res = await request(app).patch('/api/lineups/responses/r-1/withdraw').set('x-test-user-id', ADMIN);
    expect(res.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Гость
// ─────────────────────────────────────────────────────────────────────────────

describe('guest', () => {
  it('GET /:id — белый список, без откликов, только их число', async () => {
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow());
    m('lineupResponse').count.mockResolvedValue(1);
    const res = await request(app).get('/api/lineups/l-1');
    expect(res.status).toBe(200);
    expect(findGuestForbiddenKeys(res.body)).toEqual([]);
    expect(res.body).not.toHaveProperty('responses');
    expect(res.body).not.toHaveProperty('authorId');
    expect(res.body).not.toHaveProperty('matches');
    expect(res.body).not.toHaveProperty('respondAs');
    expect(res.body.responsesCount).toBe(3);
    expect(res.body.acceptedCount).toBe(1);
    expect(res.body.genres).toEqual([{ id: 'g-rock', name: 'Рок' }]);
    expect(res.body.author).toMatchObject({ id: AUTHOR, isPublic: true });
    expect(res.body.description).not.toMatch(/916|t\.me/);
    expect(res.body.indexable).toBe(true);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('автор без согласия — обезличен', async () => {
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow({ author: person(AUTHOR, { consent: false }) }));
    const res = await request(app).get('/api/lineups/l-1');
    expect(res.status).toBe(200);
    expect(res.body.author).toMatchObject({ id: null, isPublic: false, avatar: null });
    expect(JSON.stringify(res.body)).not.toContain(`Имя-${AUTHOR}`);
  });

  it('черновик / заблокированный автор / нет → одинаковый 404', async () => {
    const bodies: string[] = [];
    for (const row of [lineupRow({ status: 'draft' }), lineupRow({ author: person(AUTHOR, { blocked: true }) }), null]) {
      m('lineupRequest').findUnique.mockResolvedValueOnce(row);
      const res = await request(app).get('/api/lineups/l-1');
      expect(res.status).toBe(404);
      bodies.push(JSON.stringify(res.body));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('закрытый — виден, но noindex', async () => {
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow({ status: 'closed' }));
    const res = await request(app).get('/api/lineups/l-1');
    expect(res.status).toBe(200);
    expect(res.body.indexable).toBe(false);
  });

  it('GET / — лента без запрещённых ключей, только active', async () => {
    m('lineupRequest').count.mockResolvedValue(2);
    m('lineupRequest').findMany.mockResolvedValue([lineupRow(), lineupRow({ id: 'l-2', status: 'draft' })]);
    const res = await request(app).get('/api/lineups?city=Москва&genre=g-rock&dateFrom=01.01.2020');
    expect(res.status).toBe(200);
    expect(findGuestForbiddenKeys(res.body)).toEqual([]);
    expect(res.body.items.map((i: any) => i.id)).toEqual(['l-1']);
    const where = JSON.stringify(m('lineupRequest').findMany.mock.calls[0][0].where);
    expect(where).toContain('"status":"active"');
    expect(where).toContain('"cityName"');
    expect(where).toContain('g-rock');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Автор: отклики карточками артиста
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/lineups/:id (author)', () => {
  it('автор видит отклики с карточкой артиста; гостевые/сырые поля не утекают', async () => {
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow());
    m('lineupResponse').findMany.mockResolvedValue([{
      id: 'r-1', status: 'pending', message: 'Мы готовы', createdAt: NOW, updatedAt: NOW, artistId: 'a-1', submittedById: ADMIN,
      submittedBy: { id: ADMIN, firstName: 'Админ', lastName: 'Группы', avatar: null, email: 'adm@mail.ru' },
      artist: {
        id: 'a-1', slug: 'gruppa', name: 'Группа', type: 'GROUP', avatar: null, city: 'Москва', tourReady: 'Готовы к гастролям',
        status: 'VERIFIED', listeners: BigInt(12345), listenersDelta: 10, verificationCode: 'SECRET', rejectionReason: 'x',
        ymData: { concerts: [
          { concertTitle: 'Прошлый', datetime: new Date(Date.now() - 30 * DAY).toISOString(), city: 'Москва' },
          { concertTitle: 'Скоро', datetime: new Date(Date.now() + 5 * DAY).toISOString(), city: 'Казань', place: 'Клуб', afishaUrl: 'javascript:alert(1)' },
        ], popularTracks: [{ id: 't' }] },
        genres: [{ genre: { id: 'g-rock', name: 'Рок' } }],
        releases: [1, 2, 3, 4].map((i) => ({ id: `rel-${i}`, title: `Релиз ${i}`, coverUrl: null, releaseDate: NOW, url: 'https://music.yandex.ru/album/1', platform: 'YANDEX_MUSIC' })),
      },
    }]);
    const res = await request(app).get('/api/lineups/l-1').set('x-test-user-id', AUTHOR);
    expect(res.status).toBe(200);
    expect(res.body.isAuthor).toBe(true);
    expect(res.body.responses).toHaveLength(1);
    const card = res.body.responses[0].artist;
    expect(card).toMatchObject({ id: 'a-1', listeners: 12345, href: '/artist/gruppa' });
    expect(card.releases).toHaveLength(3);
    expect(card.concerts.map((c: any) => c.title)).toEqual(['Скоро']);
    expect(card.concerts[0].url).toBeNull();
    expect(card).not.toHaveProperty('ymData');
    expect(card).not.toHaveProperty('verificationCode');
    expect(res.body.responses[0].submittedBy).not.toHaveProperty('email');
    expect(res.body.responses[0].contactUserId).toBe(ADMIN);
  });

  it('админ артиста видит, от чьего имени может откликнуться', async () => {
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow());
    m('artist').findMany.mockResolvedValue([
      { id: 'a-1', slug: 'gruppa', name: 'Группа', avatar: null, status: 'VERIFIED', city: 'Москва' },
      { id: 'a-rej', slug: null, name: 'Отклонён', avatar: null, status: 'REJECTED', city: null },
    ]);
    const res = await request(app).get('/api/lineups/l-1').set('x-test-user-id', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.isAuthor).toBe(false);
    expect(res.body).not.toHaveProperty('responses');
    expect(res.body.respondAs.map((a: any) => a.id)).toEqual(['a-1']);
  });

  it('чужой черновик → 404', async () => {
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow({ status: 'draft' }));
    const res = await request(app).get('/api/lineups/l-1').set('x-test-user-id', STRANGER);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Создание / редактирование / закрытие
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/lineups', () => {
  const valid = () => ({
    title: 'Осенний фест',
    eventDate: new Date(Date.now() + 20 * DAY).toISOString(),
    cityName: 'москва',
    venue: 'Клуб',
    genreIds: ['g-rock'],
    slots: 2,
    slotType: 'opener',
    feeType: 'fixed',
    feeAmount: 30000,
    description: 'Ищем две группы на разогрев',
    requirements: 'Сет 30 минут',
  });

  beforeEach(() => {
    m('city').findFirst.mockResolvedValue({ id: 'c-msk', name: 'Москва' });
    m('genre').count.mockImplementation(async ({ where }: any) => where.id.in.filter((id: string) => id.startsWith('g-')).length);
    m('lineupRequest').create.mockImplementation(async ({ data }: any) => {
      const { genres: _nested, ...scalars } = data; // nested create — не строка результата
      return lineupRow({ ...scalars, id: 'l-new', authorId: data.authorId, author: person(data.authorId) });
    });
  });

  const post = (body: any, userId = STRANGER) => request(app).post('/api/lineups').set('x-test-user-id', userId).send(body);

  it('любой авторизованный пользователь создаёт запрос; город — канонический из каталога', async () => {
    const res = await post(valid());
    expect(res.status).toBe(201);
    const data = m('lineupRequest').create.mock.calls[0][0].data;
    expect(data).toMatchObject({ authorId: STRANGER, cityId: 'c-msk', cityName: 'Москва', slots: 2, feeAmount: 30000, status: 'active' });
    expect(data.eventDate).toBeInstanceOf(Date);
    expect(res.body.isAuthor).toBe(true);
  });

  it.each([
    ['дата в прошлом', { eventDate: new Date(Date.now() - DAY).toISOString() }, /будущем/],
    ['дата без времени', { eventDate: '15.11.2026' }, /дату и время/],
    ['слотов 0', { slots: 0 }, /хотя бы один/],
    ['слотов 11', { slots: 11 }, /Не больше 10/],
    ['fixed без суммы', { feeAmount: null }, /сумму/],
    ['процент > 100', { feeType: 'percent', feeAmount: 150 }, /от 1 до 100/],
    ['неизвестный слот', { slotType: 'vip' }, /слот/],
    ['короткое описание', { description: 'мало' }, /от 10/],
  ])('валидация: %s → 400', async (_name, patch, msg) => {
    const res = await post({ ...valid(), ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(msg as RegExp);
    expect(m('lineupRequest').create).not.toHaveBeenCalled();
  });

  it('free/negotiable — сумма гонорара не сохраняется', async () => {
    const res = await post({ ...valid(), feeType: 'free', feeAmount: 5000 });
    expect(res.status).toBe(201);
    expect(m('lineupRequest').create.mock.calls[0][0].data.feeAmount).toBeNull();
  });

  it('город не из каталога / несуществующий жанр → 400', async () => {
    m('city').findFirst.mockResolvedValueOnce(null);
    expect((await post(valid())).status).toBe(400);
    const res = await post({ ...valid(), genreIds: ['g-rock', 'bogus'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/жанр/);
  });

  it('суточный лимит создания → 429', async () => {
    m('lineupRequest').count.mockResolvedValueOnce(10);
    const res = await post(valid());
    expect(res.status).toBe(429);
  });

  it('?artist — персональное приглашение уходит админам артиста', async () => {
    m('artist').findUnique.mockResolvedValue({ id: 'a-1', name: 'Группа', status: 'VERIFIED' });
    m('lineupMatch').create.mockResolvedValue({ id: 'm-1' });
    const res = await post({ ...valid(), inviteArtistId: 'a-1' });
    expect(res.status).toBe(201);
    expect(res.body.invite).toBe('sent');
    expect(m('lineupMatch').create.mock.calls[0][0].data).toEqual({ requestId: 'l-new', artistId: 'a-1', kind: 'invite' });
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: ADMIN, type: 'lineup_invite', link: '/lineups/l-new?as=a-1',
    }));
  });

  it('черновик — без приглашения и матчинга', async () => {
    const res = await post({ ...valid(), status: 'draft', inviteArtistId: 'a-1' });
    expect(res.status).toBe(201);
    expect(res.body.invite).toBeNull();
    expect(m('lineupMatch').create).not.toHaveBeenCalled();
  });
});

describe('PUT / close', () => {
  beforeEach(() => {
    m('city').findFirst.mockResolvedValue({ id: 'c-msk', name: 'Москва' });
    m('genre').count.mockResolvedValue(1);
  });
  const body = () => ({
    title: 'Осенний фест', eventDate: new Date(Date.now() + 20 * DAY).toISOString(), cityName: 'Москва',
    genreIds: ['g-rock'], slots: 2, slotType: 'any', feeType: 'negotiable', description: 'Ищем две группы на разогрев',
  });

  it('PUT: не автор → 403', async () => {
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow());
    const res = await request(app).put('/api/lineups/l-1').set('x-test-user-id', STRANGER).send(body());
    expect(res.status).toBe(403);
  });

  it('PUT: запрос закрыт в соседней вкладке → 409 (условный updateMany)', async () => {
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow());
    m('lineupRequest').updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await request(app).put('/api/lineups/l-1').set('x-test-user-id', AUTHOR).send(body());
    expect(res.status).toBe(409);
    expect(m('lineupRequest').updateMany.mock.calls[0][0].where).toMatchObject({ id: 'l-1', status: { in: ['active', 'draft'] } });
    expect(m('lineupRequestGenre').deleteMany).not.toHaveBeenCalled();
  });

  it('PUT без status — черновик остаётся черновиком; draft→active — приглашение', async () => {
    m('lineupRequest').findUnique
      .mockResolvedValueOnce(lineupRow({ status: 'draft' }))
      .mockResolvedValueOnce(lineupRow({ status: 'draft' }));
    m('lineupRequest').updateMany.mockResolvedValue({ count: 1 });
    const keep = await request(app).put('/api/lineups/l-1').set('x-test-user-id', AUTHOR).send(body());
    expect(keep.status).toBe(200);
    expect(m('lineupRequest').updateMany.mock.calls[0][0].data.status).toBe('draft');

    m('lineupRequest').findUnique
      .mockResolvedValueOnce(lineupRow({ status: 'draft' }))
      .mockResolvedValueOnce(lineupRow({ status: 'active' }));
    m('artist').findUnique.mockResolvedValue({ id: 'a-1', name: 'Группа', status: 'VERIFIED' });
    const pub = await request(app).put('/api/lineups/l-1').set('x-test-user-id', AUTHOR).send({ ...body(), status: 'active', inviteArtistId: 'a-1' });
    expect(pub.status).toBe(200);
    expect(pub.body.invite).toBe('sent');
    expect(m('lineupRequestGenre').createMany).toHaveBeenCalled();
  });

  it('close: только автор; повторное закрытие → 409', async () => {
    m('lineupRequest').findUnique.mockResolvedValue({ id: 'l-1', authorId: AUTHOR });
    expect((await request(app).patch('/api/lineups/l-1/close').set('x-test-user-id', STRANGER)).status).toBe(403);
    m('lineupRequest').updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await request(app).patch('/api/lineups/l-1/close').set('x-test-user-id', AUTHOR)).status).toBe(200);
    expect((await request(app).patch('/api/lineups/l-1/close').set('x-test-user-id', AUTHOR)).status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Матчинг
// ─────────────────────────────────────────────────────────────────────────────

describe('matching', () => {
  const req = (over: Record<string, unknown> = {}) => ({
    id: 'l-1', authorId: AUTHOR, title: 'Осенний фест', eventDate: FUTURE, cityName: 'Москва', slotType: 'opener', genreIds: ['g-rock'], ...over,
  });
  const artist = (id: string, over: Record<string, unknown> = {}) => ({
    id, name: `Артист ${id}`, city: 'Москва', tourReady: null, status: 'VERIFIED', activityStatus: 'ACTIVE',
    listeners: BigInt(0), genres: [{ genreId: 'g-rock' }], ...over,
  });

  it('город / гастроли / жанр / статус — фильтры в where и в JS', async () => {
    m('artist').findMany.mockResolvedValue([
      artist('same-city'),
      artist('same-city-yo', { city: 'москва' }),
      artist('tour', { city: 'Казань', tourReady: 'Готовы к гастролям' }),
      artist('no-tour', { city: 'Казань', tourReady: null }),
      artist('tour-no', { city: 'Казань', tourReady: 'нет' }),
      artist('tour-ne', { city: 'Казань', tourReady: 'Не готовы' }),
      artist('wrong-genre', { genres: [{ genreId: 'g-jazz' }] }),
      artist('draft', { status: 'DRAFT' }),
      artist('rejected', { status: 'REJECTED' }),
      artist('approved', { status: 'APPROVED' }),
      artist('disbanded', { activityStatus: 'DISBANDED' }),
      artist('a-own'), // артист самого автора
    ]);
    const found = await matching.findMatchingArtists(req());
    // свой город — первыми
    expect(found.map((a: any) => a.id)).toEqual(['same-city', 'same-city-yo', 'approved', 'tour']);
    const where = JSON.stringify(m('artist').findMany.mock.calls[0][0].where);
    expect(where).toContain('VERIFIED');
    expect(where).toContain('APPROVED');
    expect(where).toContain('"activityStatus":"ACTIVE"');
    expect(where).toContain('g-rock');
    expect(where).toContain('tourReady');
    expect(where).toContain('"notIn":["a-own"]');
    expect(where).toContain('lineupMatches');
  });

  it('без жанров у запроса — жанр не фильтрует', async () => {
    m('artist').findMany.mockResolvedValue([artist('jazz', { genres: [{ genreId: 'g-jazz' }] })]);
    const found = await matching.findMatchingArtists(req({ genreIds: [] }));
    expect(found.map((a: any) => a.id)).toEqual(['jazz']);
    expect(JSON.stringify(m('artist').findMany.mock.calls[0][0].where)).not.toContain('genreId');
  });

  it('не больше 20 артистов на запрос (с учётом уже уведомлённых)', async () => {
    m('artist').findMany.mockResolvedValue(Array.from({ length: 30 }, (_, i) => artist(`a${i}`)));
    expect(await matching.findMatchingArtists(req())).toHaveLength(20);
    m('lineupMatch').count.mockResolvedValueOnce(15);
    expect(await matching.findMatchingArtists(req())).toHaveLength(5);
    m('lineupMatch').count.mockResolvedValueOnce(20);
    m('artist').findMany.mockClear();
    expect(await matching.findMatchingArtists(req())).toEqual([]);
    expect(m('artist').findMany).not.toHaveBeenCalled();
  });

  it('не больше 5 уведомлений одному артисту в сутки', async () => {
    m('artist').findMany.mockResolvedValue([artist('busy'), artist('free')]);
    m('lineupMatch').groupBy.mockResolvedValue([{ artistId: 'busy', _count: { _all: 5 } }, { artistId: 'free', _count: { _all: 4 } }]);
    const found = await matching.findMatchingArtists(req());
    expect(found.map((a: any) => a.id)).toEqual(['free']);
    const gb = m('lineupMatch').groupBy.mock.calls[0][0];
    expect(gb.where.kind).toBe('match');
    expect(gb.where.createdAt.gte.getTime()).toBeGreaterThan(Date.now() - DAY - 5000);
  });

  it('notifyMatchingArtists: фиксирует LineupMatch и шлёт одно уведомление на админа', async () => {
    ADMINS = { 'a-x': [ADMIN], 'a-y': [ADMIN, 'u-other'], 'a-own': [AUTHOR] };
    setupArtistRights();
    m('artist').findMany.mockResolvedValue([artist('a-x'), artist('a-y')]);
    const out = await matching.notifyMatchingArtists(req());
    expect(out.artistIds).toEqual(['a-x', 'a-y']);
    expect(m('lineupMatch').create).toHaveBeenCalledTimes(2);
    expect(m('lineupMatch').create.mock.calls[0][0].data).toEqual({ requestId: 'l-1', artistId: 'a-x', kind: 'match' });
    const calls = notifyMod.notify.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toHaveLength(2);
    const toAdmin = calls.find((c: any) => c.userId === ADMIN);
    expect(toAdmin).toMatchObject({ type: 'lineup_match', link: '/lineups/l-1' });
    expect(toAdmin.title).toBe('Новый запрос на выступление: Осенний фест');
    expect(toAdmin.body).toContain('Артист a-x');
    expect(toAdmin.body).toContain('Артист a-y');
    expect(calls.find((c: any) => c.userId === 'u-other').link).toBe('/lineups/l-1?as=a-y');
  });

  it('гонка двух публикаций: уже зафиксированный артист не уведомляется повторно', async () => {
    m('artist').findMany.mockResolvedValue([artist('a-1')]);
    m('lineupMatch').create.mockRejectedValueOnce(uniqueError());
    const out = await matching.notifyMatchingArtists(req());
    expect(out.artistIds).toEqual([]);
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it('isTourReady', () => {
    expect(lineupQuery.isTourReady('Готовы к гастролям')).toBe(true);
    expect(lineupQuery.isTourReady('да, по России')).toBe(true);
    expect(lineupQuery.isTourReady('Неделя в месяц')).toBe(true);
    for (const v of ['', '  ', null, 'нет', 'Нет.', 'не готовы', '-', 'только Москва']) {
      expect(lineupQuery.isTourReady(v)).toBe(false);
    }
  });

  it('персональное приглашение: лимит автора (20 в сутки)', async () => {
    m('artist').findUnique.mockResolvedValue({ id: 'a-1', name: 'Группа', status: 'VERIFIED' });
    m('lineupMatch').count.mockResolvedValueOnce(0).mockResolvedValueOnce(20);
    expect(await matching.sendPersonalInvite(req(), 'a-1', 'Промоутер')).toBe('limited');
    expect(m('lineupMatch').create).not.toHaveBeenCalled();
  });

  it('персональное приглашение: суточный лимит и «свой» артист', async () => {
    m('artist').findUnique.mockResolvedValue({ id: 'a-1', name: 'Группа', status: 'VERIFIED' });
    m('lineupMatch').count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    expect(await matching.sendPersonalInvite(req(), 'a-1', 'Промоутер')).toBe('limited');
    m('artist').findUnique.mockResolvedValue({ id: 'a-own', name: 'Своя', status: 'VERIFIED' });
    expect(await matching.sendPersonalInvite(req(), 'a-own', 'Промоутер')).toBe('self');
    m('artist').findUnique.mockResolvedValue({ id: 'a-rej', name: 'Нет', status: 'REJECTED' });
    expect(await matching.sendPersonalInvite(req(), 'a-rej', 'Промоутер')).toBe('unavailable');
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEO: снимок /lineups/:id, маршруты, sitemap
// ─────────────────────────────────────────────────────────────────────────────

describe('SEO /lineups/:id', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { renderLineup } = require('../seo/render/lineup');
  const { resolveSeoRoute } = require('../seo/routes');
  const { listSitemapLineups } = require('../lib/publicData');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  function ldOf(head: string): any {
    const m1 = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head);
    return m1 ? JSON.parse(m1[1]) : null;
  }

  it('Event с организатором-человеком только при согласии; контакты замаскированы', async () => {
    process.env.SEO_INDEXABLE = 'true';
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow());
    const out = await renderLineup('l-1');
    expect(out.kind).toBe('snapshot');
    expect(out.status).toBe(200);
    expect(out.indexable).toBe(true);
    const event = ldOf(out.head)['@graph'].find((n: any) => n['@type'] === 'Event');
    expect(event).toMatchObject({ name: 'Осенний фест', location: { address: { addressLocality: 'Москва' } } });
    expect(Math.abs(new Date(event.startDate).getTime() - FUTURE.getTime())).toBeLessThan(1000);
    expect(event.organizer['@type']).toBe('Person');
    expect(out.body).not.toMatch(/916|t\.me/);
    expect(out.body).not.toContain('секрет');
  });

  it('автор без согласия — организатор Organization, имени нет нигде', async () => {
    m('lineupRequest').findUnique.mockResolvedValue(lineupRow({ author: person(AUTHOR, { consent: false }) }));
    const out = await renderLineup('l-1');
    const event = ldOf(out.head)['@graph'].find((n: any) => n['@type'] === 'Event');
    expect(event.organizer).toMatchObject({ '@type': 'Organization', name: 'Moooza' });
    expect(out.head + out.body).not.toContain(`Имя-${AUTHOR}`);
  });

  it('черновик → 404; закрытый → noindex', async () => {
    m('lineupRequest').findUnique.mockResolvedValueOnce(lineupRow({ status: 'draft' }));
    expect((await renderLineup('l-1')).status).toBe(404);
    m('lineupRequest').findUnique.mockResolvedValueOnce(lineupRow({ status: 'closed' }));
    const closed = await renderLineup('l-1');
    expect(closed.status).toBe(200);
    expect(closed.indexable).toBe(false);
  });

  it('маршруты: /lineups/:id — снимок, /lineups/new и /edit — приватные', () => {
    expect(resolveSeoRoute('/lineups/l-1', new URLSearchParams()).match?.kind).toBe('lineup');
    expect(resolveSeoRoute('/lineups/new', new URLSearchParams()).type).toBe('private');
    expect(resolveSeoRoute('/lineups/l-1/edit', new URLSearchParams()).type).toBe('private');
  });

  it('sitemap: только active с событием впереди', async () => {
    m('lineupRequest').findMany.mockResolvedValue([{ id: 'l-1', updatedAt: NOW }]);
    const entries = await listSitemapLineups();
    expect(entries).toEqual([{ path: '/lineups/l-1', lastmod: NOW }]);
    const where = m('lineupRequest').findMany.mock.calls[0][0].where;
    expect(where.status).toBe('active');
    expect(where.eventDate.gt).toBeInstanceOf(Date);
  });
});
