/**
 * Согласия (раздел F плана, серверная часть Ф3):
 *   POST/DELETE /api/users/me/public-consent, ConsentEvent, хук onPublicDataChanged,
 *   PATCH /api/users/me/search-indexing, POST /api/users/me/public-consent/prompt-shown,
 *   флаг shouldPromptPublicConsent в GET /api/users/me, согласия при регистрации.
 */

import express from 'express';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';

const mockFns: jest.Mock[] = [];
const mockModels: Record<string, Record<string, jest.Mock>> = {};
function mockDefault(method: string) {
  if (method === 'findMany' || method === 'groupBy') return [];
  if (method === 'count') return 0;
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
jest.mock('../socket', () => ({ emitToUser: jest.fn(), notifyUser: jest.fn(), isUserOnline: jest.fn(() => false), disconnectUserSockets: jest.fn() }));
jest.mock('../utils/telegram', () => ({
  tgLog: jest.fn(),
  escTg: (s: any) => String(s ?? ''),
  tgEvent: new Proxy({}, { get: () => jest.fn() }),
}));
jest.mock('../utils/notify', () => ({
  notify: jest.fn(async () => {}),
  notifyMany: jest.fn(async () => {}),
  isNotificationEnabled: jest.fn(async () => true),
}));
jest.mock('../utils/mailer', () => ({
  sendVerificationEmail: jest.fn(async () => {}),
  sendPasswordResetEmail: jest.fn(async () => {}),
  sendWelcomeEmail: jest.fn(async () => {}),
  sendEmailChangeCode: jest.fn(async () => {}),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const publicData = require('../lib/publicData');

function buildApp() {
  const app = express();
  app.use(express.json());
  /* eslint-disable @typescript-eslint/no-require-imports */
  app.use('/api/users', require('../routes/users').default);
  app.use('/api/auth', require('../routes/auth').default);
  /* eslint-enable @typescript-eslint/no-require-imports */
  return app;
}
const app = buildApp();
const m = (model: string) => mockPrisma[model];
const ME = 'user-me';
const asMe = { 'x-test-user-id': ME };

beforeEach(() => {
  for (const fn of mockFns) {
    fn.mockReset();
    const method = Object.entries(mockModels).flatMap(([, fns]) => Object.entries(fns)).find(([, f]) => f === fn)?.[0] ?? '';
    fn.mockImplementation(async () => mockDefault(method));
  }
});

describe('POST /api/users/me/public-consent', () => {
  it('grants consent once, writes ConsentEvent(grant) and notifies listeners', async () => {
    const changes: any[] = [];
    const off = publicData.onPublicDataChanged((c: any) => changes.push(c));
    m('user').findUnique.mockResolvedValue({ publicConsentAt: null });

    const res = await request(app).post('/api/users/me/public-consent').set(asMe).send({ source: 'prompt' });
    off();
    expect(res.status).toBe(200);
    expect(m('user').update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ME },
      data: expect.objectContaining({ publicConsentVersion: '2026-05-31' }),
    }));
    expect(m('consentEvent').create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: ME, type: 'pd_public', action: 'grant', version: '2026-05-31', source: 'prompt' }),
    });
    expect(changes).toEqual([expect.objectContaining({ type: 'user', id: ME })]);
  });

  it('already granted → no new event', async () => {
    m('user').findUnique.mockResolvedValue({ publicConsentAt: new Date() });
    const res = await request(app).post('/api/users/me/public-consent').set(asMe);
    expect(res.status).toBe(200);
    expect(m('user').update).not.toHaveBeenCalled();
    expect(m('consentEvent').create).not.toHaveBeenCalled();
  });

  it('ConsentEvent failure does not break the request', async () => {
    m('user').findUnique.mockResolvedValue({ publicConsentAt: null });
    m('consentEvent').create.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/users/me/public-consent').set(asMe);
    spy.mockRestore();
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/users/me/public-consent', () => {
  it('revokes: publicConsentAt=null, revokedAt=now, contacts ALL→REGISTERED, event revoke, listeners', async () => {
    const changes: any[] = [];
    const off = publicData.onPublicDataChanged((c: any) => changes.push(c));
    m('user').findUnique.mockResolvedValue({
      publicConsentAt: new Date(), contactsVisibility: 'ALL', avatar: null, bannerImage: null,
    });
    m('user').update.mockResolvedValue({ publicConsentAt: null, publicConsentRevokedAt: new Date(), contactsVisibility: 'REGISTERED', avatar: null, bannerImage: null });

    const res = await request(app).delete('/api/users/me/public-consent').set(asMe);
    off();
    expect(res.status).toBe(200);
    const data = m('user').update.mock.calls[0][0].data;
    expect(data.publicConsentAt).toBeNull();
    expect(data.publicConsentRevokedAt).toBeInstanceOf(Date);
    expect(data.contactsVisibility).toBe('REGISTERED');
    expect(data.contactsVisible).toBe(false);
    expect(m('consentEvent').create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: ME, type: 'pd_public', action: 'revoke' }),
    });
    expect(changes).toEqual([expect.objectContaining({ type: 'user', id: ME, reason: 'consent_revoked' })]);
  });

  it('FRIENDS visibility is kept as is', async () => {
    m('user').findUnique.mockResolvedValue({ publicConsentAt: new Date(), contactsVisibility: 'FRIENDS', avatar: null, bannerImage: null });
    m('user').update.mockResolvedValue({});
    await request(app).delete('/api/users/me/public-consent').set(asMe);
    expect(m('user').update.mock.calls[0][0].data).not.toHaveProperty('contactsVisibility');
  });

  it('requires auth', async () => {
    expect((await request(app).delete('/api/users/me/public-consent')).status).toBe(401);
  });

  it('after revoke the guest gets 404 for the profile (query is consent-bound)', async () => {
    m('user').findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/api/users/${ME}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(m('user').findFirst.mock.calls[0][0].where)).toContain('publicConsentAt');
  });
});

describe('PATCH /api/users/me/search-indexing', () => {
  it('validates boolean and updates', async () => {
    expect((await request(app).patch('/api/users/me/search-indexing').set(asMe).send({ optOut: 'yes' })).status).toBe(400);
    m('user').update.mockResolvedValue({ searchIndexingOptOut: true });
    const res = await request(app).patch('/api/users/me/search-indexing').set(asMe).send({ optOut: true });
    expect(res.status).toBe(200);
    expect(res.body.searchIndexingOptOut).toBe(true);
    expect(m('user').update.mock.calls[0][0].data).toEqual({ searchIndexingOptOut: true });
  });
});

describe('prompt for public consent', () => {
  it('POST prompt-shown increments counter and stamps date', async () => {
    m('user').update.mockResolvedValue({ publicConsentPromptAt: new Date(), publicConsentPromptCount: 1 });
    const res = await request(app).post('/api/users/me/public-consent/prompt-shown').set(asMe);
    expect(res.status).toBe(200);
    expect(m('user').update.mock.calls[0][0].data).toEqual({
      publicConsentPromptAt: expect.any(Date),
      publicConsentPromptCount: { increment: 1 },
    });
  });

  const meRow = (over: Record<string, unknown> = {}) => ({
    id: ME, firstName: 'A', lastName: 'B', publicConsentAt: null, publicConsentRevokedAt: null,
    publicConsentPromptAt: null, publicConsentPromptCount: 0, ...over,
  });

  it('GET /me: true when no consent and has an active service', async () => {
    m('user').findUnique.mockResolvedValue(meRow());
    m('userService').count.mockResolvedValue(1);
    const res = await request(app).get('/api/users/me').set(asMe);
    expect(res.status).toBe(200);
    expect(res.body.shouldPromptPublicConsent).toBe(true);
  });

  it('GET /me: true for ACCEPTED artist membership or credits', async () => {
    m('user').findUnique.mockResolvedValue(meRow());
    m('releaseParticipant').count.mockResolvedValue(2);
    expect((await request(app).get('/api/users/me').set(asMe)).body.shouldPromptPublicConsent).toBe(true);
  });

  it('GET /me: false when nothing to show', async () => {
    m('user').findUnique.mockResolvedValue(meRow());
    expect((await request(app).get('/api/users/me').set(asMe)).body.shouldPromptPublicConsent).toBe(false);
  });

  it('GET /me: false when consent given / shown 3 times / shown < 30 days ago / revoked', async () => {
    m('userService').count.mockResolvedValue(1);
    for (const over of [
      { publicConsentAt: new Date() },
      { publicConsentPromptCount: 3 },
      { publicConsentPromptAt: new Date(Date.now() - 5 * 86400_000), publicConsentPromptCount: 1 },
      { publicConsentRevokedAt: new Date() },
    ]) {
      m('user').findUnique.mockResolvedValueOnce(meRow(over));
      const res = await request(app).get('/api/users/me').set(asMe);
      expect(res.body.shouldPromptPublicConsent).toBe(false);
    }
  });

  it('GET /me: true again when last shown > 30 days ago and count < 3', async () => {
    m('userService').count.mockResolvedValue(1);
    m('user').findUnique.mockResolvedValue(meRow({ publicConsentPromptAt: new Date(Date.now() - 31 * 86400_000), publicConsentPromptCount: 2 }));
    expect((await request(app).get('/api/users/me').set(asMe)).body.shouldPromptPublicConsent).toBe(true);
  });
});

describe('registration consents → ConsentEvent (поток dev: consentPd обязателен)', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    email: 'new@moooza-test.ru', password: 'Secret_2026!', firstName: 'Иван', lastName: 'Петров',
    birthDate: '15.05.2000', consentPd: true, userProfessions: [{ professionId: 'prof-1' }],
    ...over,
  });

  async function registerAndVerify(over: Record<string, unknown>) {
    m('profession').count.mockResolvedValue(1);
    const reg = await request(app).post('/api/auth/register').send(body(over));
    expect(reg.status).toBe(201);
    const payload = m('pendingRegistration').create.mock.calls[0][0].data.payload;
    m('pendingRegistration').findUnique.mockResolvedValue({
      email: 'new@moooza-test.ru', passwordHash: 'hash', code: '12345678', expiresAt: new Date(Date.now() + 60_000), payload,
    });
    m('user').create.mockResolvedValue({ id: 'new-user', email: 'new@moooza-test.ru', firstName: 'Иван', lastName: 'Петров' });
    const ver = await request(app).post('/api/auth/verify-email').send({ email: 'new@moooza-test.ru', code: '12345678' });
    expect(ver.status).toBe(200);
    return payload;
  }

  const events = () => m('consentEvent').create.mock.calls
    .map((c: any[]) => `${c[0].data.type}:${c[0].data.action}:${c[0].data.source}`)
    .sort();

  it('pd + terms + marketing → three grant events; IP/UA captured at /register', async () => {
    const payload = await registerAndVerify({ consentMarketing: true });
    expect(payload.consentPdAt).toBeTruthy();
    expect(payload.consentMarketingAt).toBeTruthy();
    expect(payload._consentMeta).toBeDefined();
    expect(events()).toEqual(['marketing:grant:register', 'pd:grant:register', 'terms:grant:register']);
    const pd = m('consentEvent').create.mock.calls.find((c: any[]) => c[0].data.type === 'pd')[0].data;
    expect(pd.version).toBe('2026-05-31');
    expect(pd.userId).toBe('new-user');
  });

  it('without marketing → only pd + terms', async () => {
    await registerAndVerify({});
    expect(events()).toEqual(['pd:grant:register', 'terms:grant:register']);
  });

  it('ConsentEvent failure does not break verification', async () => {
    m('consentEvent').create.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await registerAndVerify({});
    spy.mockRestore();
  });
});
