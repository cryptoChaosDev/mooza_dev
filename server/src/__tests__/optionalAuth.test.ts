/**
 * optionalAuthenticate: та же проверка в БД, что у authenticate (isBlocked,
 * blockedUntil, passwordChangedAt), кэш ~60 с, при невалидном — гость (не 401).
 */

import express, { Response } from 'express';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
};
jest.mock('../index', () => ({ prisma: mockPrisma }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { optionalAuthenticate, invalidateAuthCache } = require('../middleware/auth');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateToken } = require('../utils/jwt');

function buildApp() {
  const app = express();
  app.get('/probe', optionalAuthenticate, (req: any, res: Response) => res.json({ userId: req.userId ?? null }));
  return app;
}

const USER = 'user-1';

beforeEach(() => {
  jest.clearAllMocks();
  invalidateAuthCache();
});

describe('optionalAuthenticate', () => {
  const app = buildApp();

  it('no token → guest (200, userId null), no DB call', async () => {
    const res = await request(app).get('/probe');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('valid token + active user → userId set', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ passwordChangedAt: null, isBlocked: false, blockedUntil: null });
    const res = await request(app).get('/probe').set('Authorization', `Bearer ${generateToken({ userId: USER })}`);
    expect(res.body.userId).toBe(USER);
  });

  it('garbage token → guest, not 401', async () => {
    const res = await request(app).get('/probe').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
  });

  it('blocked user → guest', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ passwordChangedAt: null, isBlocked: true, blockedUntil: null });
    const res = await request(app).get('/probe').set('Authorization', `Bearer ${generateToken({ userId: USER })}`);
    expect(res.body.userId).toBeNull();
  });

  it('temporarily blocked (blockedUntil in future) → guest; expired block → user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      passwordChangedAt: null, isBlocked: true, blockedUntil: new Date(Date.now() + 3600_000),
    });
    let res = await request(app).get('/probe').set('Authorization', `Bearer ${generateToken({ userId: USER })}`);
    expect(res.body.userId).toBeNull();

    invalidateAuthCache();
    mockPrisma.user.findUnique.mockResolvedValue({
      passwordChangedAt: null, isBlocked: true, blockedUntil: new Date(Date.now() - 3600_000),
    });
    res = await request(app).get('/probe').set('Authorization', `Bearer ${generateToken({ userId: USER })}`);
    expect(res.body.userId).toBe(USER);
  });

  it('password changed after token issue → guest', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      passwordChangedAt: new Date(Date.now() + 60_000), isBlocked: false, blockedUntil: null,
    });
    const res = await request(app).get('/probe').set('Authorization', `Bearer ${generateToken({ userId: USER })}`);
    expect(res.body.userId).toBeNull();
  });

  it('deleted user → guest', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/probe').set('Authorization', `Bearer ${generateToken({ userId: USER })}`);
    expect(res.body.userId).toBeNull();
  });

  it('caches the DB state (~60 s): second request does not hit the DB', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ passwordChangedAt: null, isBlocked: false, blockedUntil: null });
    const token = generateToken({ userId: USER });
    await request(app).get('/probe').set('Authorization', `Bearer ${token}`);
    await request(app).get('/probe').set('Authorization', `Bearer ${token}`);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});
