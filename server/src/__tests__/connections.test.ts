/**
 * Integration tests for /api/connections
 *
 * Prisma and socket helpers are mocked — no real DB needed.
 * Auth middleware is replaced by a stub that injects req.userId.
 */

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// ── Constants shared across tests ────────────────────────────────────────────

const USER_A = 'user-a-id';
const USER_B = 'user-b-id';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Stub authenticate: sets req.userId from a custom header injected by tests
jest.mock('../middleware/auth', () => ({
  authenticate: (req: Request & { userId?: string }, _res: Response, next: NextFunction) => {
    req.userId = req.headers['x-test-user-id'] as string;
    next();
  },
  optionalAuthenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Silence telegram log (routes call both tgLog and typed tgEvent.* helpers)
jest.mock('../utils/telegram', () => ({
  tgLog: jest.fn(),
  escTg: (s: unknown) => String(s ?? ''),
  tgEvent: new Proxy({}, { get: () => jest.fn() }),
}));

// Silence socket helpers
jest.mock('../socket', () => ({
  emitToUser: jest.fn(),
  notifyUser: jest.fn(),
}));

// notify() — единая точка уведомлений (запись + сокет + push)
const mockNotify = jest.fn();
jest.mock('../utils/notify', () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
}));

// Prisma mock — all used methods are replaced with jest.fn()
const mockPrisma = {
  connection: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  connectionService: {
    createMany: jest.fn(),
  },
  service: {
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  notification: {
    create: jest.fn(),
  },
};

jest.mock('../index', () => ({
  prisma: mockPrisma,
}));

// ── App factory (import router AFTER mocks are set up) ────────────────────────

function buildApp() {
  // dynamic require so mocks are already in place
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const connectionsRouter = require('../routes/connections').default;
  const app = express();
  app.use(express.json());
  app.use('/api/connections', connectionsRouter);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal connection object as Prisma would return it */
function makeConn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    status: 'PENDING',
    requesterId: USER_A,
    receiverId: USER_B,
    requesterRole: 'CUSTOMER',
    receiverRole: 'EXECUTOR',
    needsDeal: true,
    breakRequestedBy: null,
    breakReasonRequester: null,
    breakReasonReceiver: null,
    professionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    services: [],
    requester: { id: USER_A, firstName: 'Alice', lastName: 'A', avatar: null, role: null, city: null, isPremium: false, isVerified: false },
    receiver:  { id: USER_B, firstName: 'Bob',   lastName: 'B', avatar: null, role: null, city: null, isPremium: false, isVerified: false },
    profession: null,
    ...overrides,
  };
}

function asUser(userId: string) {
  return { 'x-test-user-id': userId };
}

// ── Before each: reset all mock state ────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ passwordChangedAt: null, isBlocked: false });
  mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });
  mockPrisma.connection.findFirst.mockResolvedValue(null);   // нет недавнего отказа (кулдаун)
  mockPrisma.connection.findMany.mockResolvedValue([]);      // нет моих PENDING-запросов
  mockPrisma.connection.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.connection.deleteMany.mockResolvedValue({ count: 1 });
  mockNotify.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/connections — send request
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/connections', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });

  it('creates a PENDING connection and returns 201', async () => {
    const created = makeConn();
    mockPrisma.connection.create.mockResolvedValue(created);
    mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Alice', lastName: 'A' });

    const res = await request(app)
      .post('/api/connections')
      .set(asUser(USER_A))
      .send({ receiverId: USER_B, serviceIds: [], requesterRole: 'CUSTOMER', receiverRole: 'EXECUTOR', needsDeal: true });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.iAmRequester).toBe(true);
    expect(res.body.partner.id).toBe(USER_B);

    // Уведомление получателю — через notify() и со ссылкой (клик не ведёт на «/»)
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_B, type: 'connection_request', link: '/connections/requests' })
    );
  });

  it('returns 409 when an identical PENDING connection already exists', async () => {
    // existing PENDING from me with the same roles and services
    mockPrisma.connection.findMany.mockResolvedValue([makeConn({ requesterRole: null, receiverRole: null, services: [] })]);

    const res = await request(app)
      .post('/api/connections')
      .set(asUser(USER_A))
      .send({ receiverId: USER_B, serviceIds: [] });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/уже отправлен/i);
  });

  it('allows a new PENDING request even when an ACCEPTED connection exists', async () => {
    const created = makeConn();
    mockPrisma.connection.create.mockResolvedValue(created);
    mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Alice', lastName: 'A' });

    const res = await request(app)
      .post('/api/connections')
      .set(asUser(USER_A))
      .send({ receiverId: USER_B, serviceIds: [], requesterRole: 'EXECUTOR', receiverRole: 'CUSTOMER', needsDeal: false });

    // Should succeed — the ACCEPTED connection does not block a new PENDING
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
  });

  it('returns 429 while the reject cooldown is active', async () => {
    mockPrisma.connection.findFirst.mockResolvedValue({ id: 'conn-old', updatedAt: new Date() }); // rejected just now

    const res = await request(app)
      .post('/api/connections')
      .set(asUser(USER_A))
      .send({ receiverId: USER_B, serviceIds: [] });

    expect(res.status).toBe(429);
    expect(mockPrisma.connection.create).not.toHaveBeenCalled();
  });

  it('returns 400 for unknown serviceIds instead of 500', async () => {
    mockPrisma.service.findMany.mockResolvedValue([]); // ни одна услуга не найдена

    const res = await request(app)
      .post('/api/connections')
      .set(asUser(USER_A))
      .send({ receiverId: USER_B, serviceIds: ['nope'] });

    expect(res.status).toBe(400);
    expect(mockPrisma.connection.create).not.toHaveBeenCalled();
  });

  it('returns 400 when receiverId is missing', async () => {
    const res = await request(app)
      .post('/api/connections')
      .set(asUser(USER_A))
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 when sender tries to connect to themselves', async () => {
    const res = await request(app)
      .post('/api/connections')
      .set(asUser(USER_A))
      .send({ receiverId: USER_A });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/connections/:id/accept
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/connections/:id/accept', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });

  it('accepts an incoming PENDING request and returns ACCEPTED status', async () => {
    const pending = makeConn({ receiverId: USER_B });       // USER_B is the receiver
    const accepted = makeConn({ status: 'ACCEPTED', receiverId: USER_B });
    mockPrisma.connection.findUnique
      .mockResolvedValueOnce(pending)     // проверка прав/статуса
      .mockResolvedValueOnce(accepted);   // перечитывание после записи
    mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Bob', lastName: 'B' });

    const res = await request(app)
      .patch('/api/connections/conn-1/accept')
      .set(asUser(USER_B));            // receiver accepts

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACCEPTED');
    // Условная запись по статусу (защита от гонки accept/reject)
    expect(mockPrisma.connection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'conn-1', status: 'PENDING' }),
        data: { status: 'ACCEPTED' },
      })
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A, type: 'connection_accepted' })
    );
  });

  it('returns 409 when the status changed concurrently', async () => {
    mockPrisma.connection.findUnique.mockResolvedValue(makeConn({ receiverId: USER_B }));
    mockPrisma.connection.updateMany.mockResolvedValue({ count: 0 }); // кто-то успел раньше

    const res = await request(app)
      .patch('/api/connections/conn-1/accept')
      .set(asUser(USER_B));

    expect(res.status).toBe(409);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('returns 403 when the requester tries to accept their own request', async () => {
    // USER_A is the requester, not the receiver
    const pending = makeConn({ requesterId: USER_A, receiverId: USER_B });
    mockPrisma.connection.findUnique.mockResolvedValue(pending);

    const res = await request(app)
      .patch('/api/connections/conn-1/accept')
      .set(asUser(USER_A));           // requester, not allowed

    expect(res.status).toBe(403);
  });

  it('returns 400 when connection is not PENDING', async () => {
    const accepted = makeConn({ status: 'ACCEPTED', receiverId: USER_B });
    mockPrisma.connection.findUnique.mockResolvedValue(accepted);

    const res = await request(app)
      .patch('/api/connections/conn-1/accept')
      .set(asUser(USER_B));

    expect(res.status).toBe(400);
  });

  it('returns 404 when connection does not exist', async () => {
    mockPrisma.connection.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/connections/nonexistent/accept')
      .set(asUser(USER_B));

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/connections/:id/reject
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/connections/:id/reject', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });

  it('sets status to REJECTED (does not delete), returns { ok: true }', async () => {
    const pending = makeConn({ receiverId: USER_B });
    mockPrisma.connection.findUnique.mockResolvedValue(pending);
    mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Bob', lastName: 'B' });

    const res = await request(app)
      .patch('/api/connections/conn-1/reject')
      .set(asUser(USER_B));           // receiver rejects

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Must update to REJECTED (conditionally on PENDING), not delete
    expect(mockPrisma.connection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
        data: { status: 'REJECTED' },
      })
    );
    expect(mockPrisma.connection.delete).not.toHaveBeenCalled();
    expect(mockPrisma.connection.deleteMany).not.toHaveBeenCalled();

    // Requester must be notified (через notify — с учётом настроек)
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A, type: 'connection_rejected' })
    );
  });

  it('returns 403 when the requester tries to reject their own request', async () => {
    const pending = makeConn({ requesterId: USER_A, receiverId: USER_B });
    mockPrisma.connection.findUnique.mockResolvedValue(pending);

    const res = await request(app)
      .patch('/api/connections/conn-1/reject')
      .set(asUser(USER_A));

    expect(res.status).toBe(403);
    expect(mockPrisma.connection.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 when connection is not PENDING', async () => {
    const accepted = makeConn({ status: 'ACCEPTED', receiverId: USER_B });
    mockPrisma.connection.findUnique.mockResolvedValue(accepted);

    const res = await request(app)
      .patch('/api/connections/conn-1/reject')
      .set(asUser(USER_B));

    expect(res.status).toBe(400);
    expect(mockPrisma.connection.updateMany).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/connections/:id/add-services
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/connections/:id/add-services', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });

  it('refuses to change an ACCEPTED connection one-sidedly (409)', async () => {
    mockPrisma.service.findMany.mockResolvedValue([{ id: 'svc-1' }]);
    mockPrisma.connection.findUnique.mockResolvedValue(makeConn({ status: 'ACCEPTED' }));

    const res = await request(app)
      .patch('/api/connections/conn-1/add-services')
      .set(asUser(USER_A))
      .send({ serviceIds: ['svc-1'] });

    expect(res.status).toBe(409);
    expect(mockPrisma.connectionService.createMany).not.toHaveBeenCalled();
  });

  it('returns 400 for unknown serviceIds', async () => {
    mockPrisma.service.findMany.mockResolvedValue([]);

    const res = await request(app)
      .patch('/api/connections/conn-1/add-services')
      .set(asUser(USER_A))
      .send({ serviceIds: ['missing'] });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/connections/rejected — my rejected outgoing requests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/connections/rejected', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });

  it('returns outgoing connections that were rejected', async () => {
    const rejected = makeConn({ status: 'REJECTED' });
    mockPrisma.connection.findMany.mockResolvedValue([rejected]);

    const res = await request(app)
      .get('/api/connections/rejected')
      .set(asUser(USER_A));

    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe('REJECTED');
    expect(res.body[0].iAmRequester).toBe(true);

    expect(mockPrisma.connection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ requesterId: USER_A, status: 'REJECTED' }),
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/connections — accepted only
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/connections', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });

  it('returns only ACCEPTED connections', async () => {
    const acc = makeConn({ status: 'ACCEPTED' });
    mockPrisma.connection.findMany.mockResolvedValue([acc]);

    const res = await request(app)
      .get('/api/connections')
      .set(asUser(USER_A));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].status).toBe('ACCEPTED');

    // Verify the query filter includes status: ACCEPTED
    expect(mockPrisma.connection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACCEPTED' }),
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/connections/requests — incoming pending
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/connections/requests', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });

  it('returns incoming PENDING connections addressed to me', async () => {
    const pending = makeConn({ receiverId: USER_B });
    mockPrisma.connection.findMany.mockResolvedValue([pending]);

    const res = await request(app)
      .get('/api/connections/requests')
      .set(asUser(USER_B));

    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe('PENDING');
    expect(res.body[0].iAmRequester).toBe(false);  // USER_B is the receiver

    expect(mockPrisma.connection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receiverId: USER_B, status: 'PENDING' }),
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/connections/sent — outgoing pending
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/connections/sent', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });

  it('returns outgoing PENDING connections sent by me', async () => {
    const pending = makeConn();   // requesterId = USER_A
    mockPrisma.connection.findMany.mockResolvedValue([pending]);

    const res = await request(app)
      .get('/api/connections/sent')
      .set(asUser(USER_A));

    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe('PENDING');
    expect(res.body[0].iAmRequester).toBe(true);

    expect(mockPrisma.connection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ requesterId: USER_A, status: 'PENDING' }),
      })
    );
  });
});
