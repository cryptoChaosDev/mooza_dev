/**
 * Tests for the auth zone fixes: /auth/register, /auth/login, the authenticate
 * middleware (blocks) and referral Pro grants.
 *
 * Prisma, mailer and telegram are mocked — no real DB / network needed.
 */

import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';

// auth.ts / middleware start cleanup intervals — don't let them keep Jest alive.
const realSetInterval = global.setInterval;
jest.spyOn(global, 'setInterval').mockImplementation(((fn: any, ms?: number) => {
  const t = realSetInterval(fn, ms);
  (t as any).unref?.();
  return t;
}) as any);

jest.mock('../utils/mailer', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/telegram', () => ({
  tgLog: jest.fn(),
  escTg: (s: any) => String(s ?? ''),
  tgEvent: new Proxy({}, { get: () => jest.fn() }),
}));
jest.mock('../utils/notify', () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  notifyMany: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logSecurity: jest.fn(),
}));

const fn = () => jest.fn();
const mockPrisma: any = {
  user: { findUnique: fn(), findFirst: fn(), create: fn(), update: fn(), updateMany: fn(), count: fn() },
  pendingRegistration: { findUnique: fn(), create: fn(), update: fn(), updateMany: fn(), delete: fn(), deleteMany: fn() },
  siteSetting: { findUnique: fn() },
  referralLink: { findUnique: fn(), count: fn(), update: fn(), updateMany: fn() },
  artistInvite: { findUnique: fn() },
  city: { findFirst: fn() },
  profession: { count: fn() },
  customFilterValue: { findMany: fn() },
  artist: { findMany: fn() },
  fieldOfActivity: { findUnique: fn() },
};
jest.mock('../index', () => ({ prisma: mockPrisma }));

function buildApp() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const authRouter = require('../routes/auth').default;
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

let settings: Record<string, string> = {};
const PW = 'Secret_2026!';

function validBody(over: Record<string, unknown> = {}) {
  return {
    email: 'New.User@Mail.ru',
    password: PW,
    firstName: 'Иван',
    lastName: 'Иванов',
    birthDate: '15.05.2000',
    consentPd: true,
    userProfessions: [{ professionId: 'prof-1' }],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  settings = {};
  mockPrisma.siteSetting.findUnique.mockImplementation(({ where }: any) =>
    Promise.resolve(settings[where.key] !== undefined ? { key: where.key, value: settings[where.key] } : null));
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.pendingRegistration.findUnique.mockResolvedValue(null);
  mockPrisma.pendingRegistration.create.mockResolvedValue({});
  mockPrisma.pendingRegistration.update.mockResolvedValue({});
  mockPrisma.referralLink.findUnique.mockResolvedValue(null);
  mockPrisma.artistInvite.findUnique.mockResolvedValue(null);
  mockPrisma.profession.count.mockResolvedValue(1);
  mockPrisma.customFilterValue.findMany.mockResolvedValue([]);
  mockPrisma.artist.findMany.mockResolvedValue([]);
});

describe('POST /api/auth/register', () => {
  it('creates a pending registration with consent + normalized birth date', async () => {
    const res = await request(buildApp()).post('/api/auth/register').send(validBody());
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('new.user@mail.ru');
    const data = mockPrisma.pendingRegistration.create.mock.calls[0][0].data;
    expect(data.email).toBe('new.user@mail.ru');
    expect(data.payload.birthDate).toBe('2000-05-15');
    expect(data.payload.consentPdAt).toBeTruthy();
    expect(data.payload.consentPdVersion).toBeTruthy();
    expect(data.payload.consentMarketingAt).toBeNull();
  });

  it('ignores artistIds — no self-granted artist membership at signup', async () => {
    const res = await request(buildApp()).post('/api/auth/register').send(validBody({ artistIds: ['artist-1'] }));
    expect(res.status).toBe(201);
    const data = mockPrisma.pendingRegistration.create.mock.calls[0][0].data;
    expect(data.payload).not.toHaveProperty('artistIds');
  });

  it('requires PD consent and a profession; zod error is a plain string', async () => {
    const noConsent = await request(buildApp()).post('/api/auth/register').send(validBody({ consentPd: false }));
    expect(noConsent.status).toBe(400);
    expect(typeof noConsent.body.error).toBe('string');
    expect(noConsent.body.field).toBe('consentPd');

    const noProf = await request(buildApp()).post('/api/auth/register').send(validBody({ userProfessions: [] }));
    expect(noProf.status).toBe(400);
    expect(noProf.body.field).toBe('userProfessions');

    const badEmail = await request(buildApp()).post('/api/auth/register').send(validBody({ email: 'иван@почта.рф' }));
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error).toBe('Некорректный email');
  });

  it('rejects a broken / too young birth date before sending the code', async () => {
    const bad = await request(buildApp()).post('/api/auth/register').send(validBody({ birthDate: '31.02.2000' }));
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe('birthDate');
    const young = await request(buildApp()).post('/api/auth/register').send(validBody({ birthDate: '01.01.2020' }));
    expect(young.status).toBe(400);
    expect(young.body.code).toBe('AGE_TOO_YOUNG');
    expect(mockPrisma.pendingRegistration.create).not.toHaveBeenCalled();
  });

  it('never overwrites an active pending registration (other password → 409, no continue)', async () => {
    const hash = await bcrypt.hash('Victim_pass1!', 4);
    const pending = { email: 'new.user@mail.ru', passwordHash: hash, expiresAt: new Date(Date.now() + 600_000), createdAt: new Date() };
    mockPrisma.pendingRegistration.findUnique.mockResolvedValue(pending);
    const res = await request(buildApp()).post('/api/auth/register').send(validBody());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PENDING_EXISTS');
    expect(res.body.canContinue).toBe(false);
    expect(mockPrisma.pendingRegistration.update).not.toHaveBeenCalled();
    expect(mockPrisma.pendingRegistration.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.pendingRegistration.create).not.toHaveBeenCalled();
  });

  it('same person (same password) may continue; the password is not touched', async () => {
    const hash = await bcrypt.hash(PW, 4);
    mockPrisma.pendingRegistration.findUnique.mockResolvedValue({
      email: 'new.user@mail.ru', passwordHash: hash, expiresAt: new Date(Date.now() + 600_000), createdAt: new Date(),
    });
    const res = await request(buildApp()).post('/api/auth/register').send(validBody());
    expect(res.status).toBe(409);
    expect(res.body.canContinue).toBe(true);
    const upd = mockPrisma.pendingRegistration.update.mock.calls[0][0].data;
    expect(Object.keys(upd)).toEqual(['payload']);
  });

  it('closed registration: a legacy userId code does not open it, a real link does', async () => {
    settings = { registrationEnabled: 'false', referralRegistrationEnabled: 'true' };
    mockPrisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id === 'some-user-id' ? { id: 'some-user-id' } : null));
    const legacy = await request(buildApp()).post('/api/auth/register')
      .send(validBody({ referralCode: 'some-user-id', referrerId: 'some-user-id' }));
    expect(legacy.status).toBe(403);

    mockPrisma.referralLink.findUnique.mockResolvedValue({ usedById: null, multiUse: false });
    const link = await request(buildApp()).post('/api/auth/register').send(validBody({ referralCode: 'AbCd1234' }));
    expect(link.status).toBe(201);
  });

  it('closed registration: an artist invite counts only in referral-only mode', async () => {
    mockPrisma.artistInvite.findUnique.mockResolvedValue({ id: 'inv-1', artistId: 'a1', expiresAt: null, maxUses: null, usedCount: 0, roleIds: [] });
    settings = { registrationEnabled: 'false', referralRegistrationEnabled: 'false' };
    const off = await request(buildApp()).post('/api/auth/register').send(validBody({ artistInviteToken: 'tok-12345' }));
    expect(off.status).toBe(403);
    settings = { registrationEnabled: 'false', referralRegistrationEnabled: 'true' };
    const on = await request(buildApp()).post('/api/auth/register').send(validBody({ artistInviteToken: 'tok-12345' }));
    expect(on.status).toBe(201);
  });

  it('closed registration: an expired / used-up artist invite is explained (410), not opened', async () => {
    settings = { registrationEnabled: 'false', referralRegistrationEnabled: 'true' };
    mockPrisma.artistInvite.findUnique.mockResolvedValue({ id: 'inv-1', artistId: 'a1', expiresAt: new Date(Date.now() - 1000), maxUses: null, usedCount: 0, roleIds: [] });
    const expired = await request(buildApp()).post('/api/auth/register').send(validBody({ artistInviteToken: 'tok-12345' }));
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe('EXPIRED');
    mockPrisma.artistInvite.findUnique.mockResolvedValue({ id: 'inv-1', artistId: 'a1', expiresAt: null, maxUses: 3, usedCount: 3, roleIds: [] });
    const used = await request(buildApp()).post('/api/auth/register').send(validBody({ artistInviteToken: 'tok-12345' }));
    expect(used.status).toBe(410);
    expect(used.body.code).toBe('EXHAUSTED');
    expect(mockPrisma.pendingRegistration.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/check-email', () => {
  it('reports an active pending registration as pending, not taken', async () => {
    mockPrisma.pendingRegistration.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() });
    const res = await request(buildApp()).get('/api/auth/check-email').query({ email: 'a@mail.ru' });
    expect(res.body).toEqual({ available: true, valid: true, pending: true });
  });
});

describe('POST /api/auth/login', () => {
  const makeUser = async (over: Record<string, unknown> = {}) => ({
    id: 'u1', email: 'a@mail.ru', password: await bcrypt.hash(PW, 4), firstName: 'A', lastName: 'B',
    isAdmin: false, isBlocked: false, blockedUntil: null, emailVerified: true, emailVerificationCode: null,
    ...over,
  });

  it('same answer for unknown email and wrong password', async () => {
    const unknown = await request(buildApp()).post('/api/auth/login').send({ email: 'x@mail.ru', password: 'whatever1!' });
    mockPrisma.user.findUnique.mockResolvedValue(await makeUser());
    const wrong = await request(buildApp()).post('/api/auth/login').send({ email: 'a@mail.ru', password: 'Wrong_pass1!' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('block status is revealed only after a correct password; blockedUntil is checked', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(await makeUser({ isBlocked: true }));
    const noPw = await request(buildApp()).post('/api/auth/login').send({ email: 'a@mail.ru', password: 'Wrong_pass1!' });
    expect(noPw.status).toBe(401);
    const blocked = await request(buildApp()).post('/api/auth/login').send({ email: 'a@mail.ru', password: PW });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ACCOUNT_BLOCKED');

    mockPrisma.user.findUnique.mockResolvedValue(await makeUser({ blockedUntil: new Date(Date.now() + 3600_000) }));
    const temp = await request(buildApp()).post('/api/auth/login').send({ email: 'a@mail.ru', password: PW });
    expect(temp.status).toBe(403);
  });

  it('responds with the whitelisted self user, never secrets', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SELF_USER_SELECT } = require('../utils/selfUser');
    for (const secret of ['password', 'emailVerificationCode', 'emailVerificationExpires', 'passwordResetCode',
      'passwordResetExpires', 'pendingEmailCodeHash', 'pendingEmailExpires', 'lastCodeSentAt', 'passwordChangedAt']) {
      expect(SELF_USER_SELECT).not.toHaveProperty(secret);
    }
    const full = await makeUser({ passwordResetCode: '12345678', pendingEmailCodeHash: 'abc' });
    mockPrisma.user.findUnique.mockImplementation(({ select }: any) => {
      if (select === SELF_USER_SELECT) return Promise.resolve({ id: 'u1', email: 'a@mail.ru', firstName: 'A' });
      return Promise.resolve(full);
    });
    const res = await request(buildApp()).post('/api/auth/login').send({ email: 'a@mail.ru', password: PW });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 'u1', email: 'a@mail.ru', firstName: 'A' });
  });

  it('loginEnabled=false blocks regular users but not admins', async () => {
    settings = { loginEnabled: 'false' };
    mockPrisma.user.findUnique.mockResolvedValue(await makeUser());
    const user = await request(buildApp()).post('/api/auth/login').send({ email: 'a@mail.ru', password: PW });
    expect(user.status).toBe(403);
    expect(user.body.code).toBe('LOGIN_DISABLED');
    mockPrisma.user.findUnique.mockResolvedValue(await makeUser({ isAdmin: true }));
    const admin = await request(buildApp()).post('/api/auth/login').send({ email: 'a@mail.ru', password: PW });
    expect(admin.status).toBe(200);
    expect(admin.body.token).toBeTruthy();
  });
});

describe('POST /api/auth/telegram (widget)', () => {
  it('refuses when TELEGRAM_BOT_TOKEN is not set', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const res = await request(buildApp()).post('/api/auth/telegram')
      .send({ id: 1, first_name: 'X', auth_date: Math.floor(Date.now() / 1000), hash: 'deadbeef' });
    expect(res.status).toBe(503);
  });
});

describe('authenticate middleware — blocks', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { authenticate } = require('../middleware/auth');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateToken } = require('../utils/jwt');
  const app = express();
  app.get('/x', authenticate, (_req, res) => res.json({ ok: true }));
  const auth = () => ({ Authorization: `Bearer ${generateToken({ userId: 'u1' })}` });

  it('permanent block → 403 even with an expired temporary block; isBlocked is never cleared', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordChangedAt: null, isBlocked: true, blockedUntil: new Date(Date.now() - 1000) });
    const res = await request(app).get('/x').set(auth());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_BLOCKED');
    for (const call of [...mockPrisma.user.update.mock.calls, ...mockPrisma.user.updateMany.mock.calls]) {
      expect(call[0].data).not.toHaveProperty('isBlocked');
    }
  });

  it('expired temporary block → passes and clears only blockedUntil', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordChangedAt: null, isBlocked: false, blockedUntil: new Date(Date.now() - 1000) });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).get('/x').set(auth());
    expect(res.status).toBe(200);
    expect(mockPrisma.user.updateMany.mock.calls[0][0].data).toEqual({ blockedUntil: null });
  });

  it('active temporary block → 403', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordChangedAt: null, isBlocked: false, blockedUntil: new Date(Date.now() + 60_000) });
    const res = await request(app).get('/x').set(auth());
    expect(res.status).toBe(403);
  });

  it('missing token → 401 with a TOKEN_MISSING code', async () => {
    const res = await request(app).get('/x');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_MISSING');
  });
});

describe('applyReferralProGrants', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { applyReferralProGrants } = require('../utils/pro');

  it('counts only burned single-use links and claims the delta atomically', async () => {
    mockPrisma.referralLink.count.mockResolvedValue(20);
    mockPrisma.user.findUnique.mockResolvedValue({ proMonthsFromReferrals: 1, proUntil: null });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.update.mockResolvedValue({});
    await applyReferralProGrants('owner-1');
    expect(mockPrisma.referralLink.count.mock.calls[0][0].where).toEqual({ ownerId: 'owner-1', multiUse: false, usedById: { not: null } });
    expect(mockPrisma.user.count).not.toHaveBeenCalled();
    expect(mockPrisma.user.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'owner-1', proMonthsFromReferrals: 1 }, data: { proMonthsFromReferrals: 2 },
    });
    // exactly one month granted (one proUntil update)
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('a concurrent call that lost the claim grants nothing', async () => {
    mockPrisma.referralLink.count.mockResolvedValue(10);
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ proMonthsFromReferrals: 0 }) // stale read
      .mockResolvedValueOnce({ proMonthsFromReferrals: 1 }); // after the winner
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });
    await applyReferralProGrants('owner-1');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
