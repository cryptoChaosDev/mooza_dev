/**
 * «Лист ожидания»: POST /api/waitlist (письмо «Заявка принята», повтор без спама,
 * alreadyRegistered), админ-приглашения (ссылка source='waitlist', письмо, статус,
 * 24 ч, 409 при выключенной регистрации), bulk, stats, delete, отметка
 * «Зарегистрировался» (по ссылке и по email, в т.ч. через verify-email) и то,
 * что waitlist-ссылки не дают владельцу реферальный Pro.
 *
 * Prisma — маленькая in-memory подделка (where с OR/NOT/not/lt/gt/in, increment),
 * чтобы условные updateMany (окно 24 ч) проверялись по-настоящему. Mailer замокан.
 */

import express from 'express';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';
process.env.WAITLIST_BULK_PAUSE_MS = '0';
process.env.APP_URL = 'https://moooza.test';

// ─── in-memory prisma ────────────────────────────────────────────────────────
type Row = Record<string, any>;
const mockDb: { waitlistEntry: Row[]; referralLink: Row[]; user: Row[] } = { waitlistEntry: [], referralLink: [], user: [] };
let mockSettings: Record<string, string> = {};
let mockSeq = 0;

const MOCK_DEFAULTS: Record<string, Row> = {
  waitlistEntry: {
    consentPd: false, consentMarketing: false, status: 'new', invitedAt: null, invitedById: null, invitesSent: 0,
    referralLinkId: null, registeredUserId: null, registeredAt: null, confirmationSentAt: null,
  },
  referralLink: { clicks: 0, usedById: null, usedAt: null, hiddenAt: null, multiUse: false, usedCount: 0, source: null },
  user: { email: null, isAdmin: false, referrerId: null, proMonthsFromReferrals: 0, proUntil: null, isPro: false },
};
const MOCK_UNIQUE: Record<string, string[]> = { waitlistEntry: ['email'], referralLink: ['code', 'usedById'], user: ['email'] };

function mockCmp(v: any, cond: any): boolean {
  if (cond === undefined) return true;
  if (cond === null) return v === null || v === undefined;
  if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
  if (typeof cond === 'object') {
    // SQL-семантика: `not: 'x'` / lt / gt / in не совпадают с NULL.
    if ('not' in cond && (cond.not === null ? v == null : v == null || v === cond.not)) return false;
    if ('lt' in cond && (v == null || !(v < cond.lt))) return false;
    if ('gt' in cond && (v == null || !(v > cond.gt))) return false;
    if ('in' in cond && !cond.in.includes(v)) return false;
    return true;
  }
  return v === cond;
}

function mockMatches(model: string, row: Row, where: Row = {}): boolean {
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'OR') { if (!(cond as Row[]).some((w) => mockMatches(model, row, w))) return false; continue; }
    if (k === 'NOT') { if (mockMatches(model, row, cond)) return false; continue; }
    if (model === 'user' && k === 'usedReferralLink') {
      const link = mockDb.referralLink.find((l) => l.usedById === row.id);
      if (!link || !mockMatches('referralLink', link, cond.is)) return false;
      continue;
    }
    if (!mockCmp(row[k], cond)) return false;
  }
  return true;
}

function mockApply(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) row[k] = (row[k] ?? 0) + v.increment;
    else if (v !== undefined) row[k] = v;
  }
  row.updatedAt = new Date();
}

function mockModel(name: 'waitlistEntry' | 'referralLink' | 'user') {
  const rows = () => mockDb[name];
  const one = (where: Row) => rows().find((r) => mockMatches(name, r, where)) ?? null;
  const clone = (r: Row | null) => (r ? { ...r } : null);
  return {
    findUnique: jest.fn(async ({ where }: any) => clone(one(where))),
    findFirst: jest.fn(async ({ where }: any = {}) => clone(one(where ?? {}))),
    findMany: jest.fn(async ({ where, skip = 0, take, orderBy }: any = {}) => {
      let list = rows().filter((r) => mockMatches(name, r, where ?? {}));
      if (orderBy?.createdAt === 'desc') list = [...list].sort((a, b) => b.createdAt - a.createdAt);
      return list.slice(skip, take ? skip + take : undefined).map((r) => ({ ...r }));
    }),
    count: jest.fn(async ({ where }: any = {}) => rows().filter((r) => mockMatches(name, r, where ?? {})).length),
    create: jest.fn(async ({ data }: any) => {
      for (const k of MOCK_UNIQUE[name]) {
        if (data[k] != null && rows().some((r) => r[k] === data[k])) throw Object.assign(new Error('Unique'), { code: 'P2002' });
      }
      const now = new Date();
      const row = { id: `${name}-${++mockSeq}`, createdAt: now, updatedAt: now, ...MOCK_DEFAULTS[name], ...data };
      rows().push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = one(where);
      if (!row) throw Object.assign(new Error('Not found'), { code: 'P2025' });
      mockApply(row, data);
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const list = rows().filter((r) => mockMatches(name, r, where ?? {}));
      list.forEach((r) => mockApply(r, data));
      return { count: list.length };
    }),
    delete: jest.fn(async ({ where }: any) => {
      const row = one(where);
      if (!row) throw Object.assign(new Error('Not found'), { code: 'P2025' });
      mockDb[name] = rows().filter((r) => r !== row);
      return { ...row };
    }),
    deleteMany: jest.fn(async ({ where }: any = {}) => {
      const before = rows().length;
      mockDb[name] = rows().filter((r) => !mockMatches(name, r, where ?? {}));
      return { count: before - mockDb[name].length };
    }),
    groupBy: jest.fn(async ({ by }: any) => {
      const field = by[0];
      const counts = new Map<any, number>();
      for (const r of rows()) counts.set(r[field], (counts.get(r[field]) ?? 0) + 1);
      return [...counts].map(([v, n]) => ({ [field]: v, _count: { _all: n } }));
    }),
  };
}

const mockPrisma: any = {
  waitlistEntry: mockModel('waitlistEntry'),
  referralLink: mockModel('referralLink'),
  user: mockModel('user'),
  siteSetting: {
    findUnique: jest.fn(async ({ where }: any) =>
      (mockSettings[where.key] !== undefined ? { key: where.key, value: mockSettings[where.key] } : null)),
  },
  pendingRegistration: { findUnique: jest.fn(), delete: jest.fn(async () => ({})), deleteMany: jest.fn(async () => ({ count: 0 })) },
  $executeRaw: jest.fn(async () => 0),
  $transaction: async (arg: any) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)),
};

jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const id = req.headers['x-test-user-id'];
    if (!id) return res.status(401).json({ error: 'Требуется аутентификация' });
    req.userId = id;
    next();
  },
  optionalAuthenticate: (_req: any, _res: any, next: any) => next(),
  accountBlockMessage: () => null,
  invalidateAuthCache: () => {},
}));
// Лимитеры — пропускать всё (иначе 10 заявок/час/IP ломают серию тестов).
jest.mock('../middleware/rateLimiter', () => new Proxy({}, {
  get: (_t, key) => (key === '__esModule' ? false : (_req: any, _res: any, next: any) => next()),
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
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logSecurity: jest.fn(),
}));
jest.mock('../lib/consentEvents', () => ({
  recordConsentEvent: jest.fn(async () => {}),
  requestMeta: () => ({ ip: null, userAgent: null }),
}));
jest.mock('../utils/mailer', () => ({
  sendVerificationEmail: jest.fn(async () => {}),
  sendPasswordResetEmail: jest.fn(async () => {}),
  sendWelcomeEmail: jest.fn(async () => {}),
  sendEmailChangeCode: jest.fn(async () => {}),
  sendWaitlistConfirmation: jest.fn(async () => {}),
  sendWaitlistInvite: jest.fn(async () => {}),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const mailer = require('../utils/mailer');
const waitlistLib = require('../lib/waitlist');
const { countProReferrals, applyReferralProGrants } = require('../utils/pro');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/waitlist', require('../routes/waitlist').default);
  app.use('/api/admin', require('../routes/admin').default);
  app.use('/api/auth', require('../routes/auth').default);
  app.use('/api/referrals', require('../routes/referrals').default);
  return app;
}
/* eslint-enable @typescript-eslint/no-require-imports */

const app = buildApp();
const ADMIN = 'admin-1';
const asAdmin = (r: request.Test) => r.set('x-test-user-id', ADMIN);
const HOUR = 3600_000;
const flush = () => new Promise((r) => setImmediate(r));

function addEntry(over: Row = {}): Row {
  const now = new Date();
  const row = { id: `wl-${++mockSeq}`, email: `p${mockSeq}@mail.ru`, type: 'resident_waitlist', createdAt: now, updatedAt: now, ...MOCK_DEFAULTS.waitlistEntry, consentPd: true, ...over };
  mockDb.waitlistEntry.push(row);
  return row;
}
function addLink(over: Row = {}): Row {
  const row = { id: `rl-${++mockSeq}`, code: `CODE${mockSeq}`, label: 'x', ownerId: ADMIN, createdAt: new Date(), ...MOCK_DEFAULTS.referralLink, ...over };
  mockDb.referralLink.push(row);
  return row;
}
const entry = (id: string) => mockDb.waitlistEntry.find((e) => e.id === id)!;

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.waitlistEntry = [];
  mockDb.referralLink = [];
  mockDb.user = [{ id: ADMIN, email: 'admin@moooza.ru', firstName: 'Админ', lastName: 'А', ...MOCK_DEFAULTS.user, isAdmin: true }];
  // По умолчанию — как на PROD: открытая регистрация выключена, по приглашениям включена.
  mockSettings = { registrationEnabled: 'false', referralRegistrationEnabled: 'true' };
  mailer.sendWaitlistConfirmation.mockImplementation(async () => {});
  mailer.sendWaitlistInvite.mockImplementation(async () => {});
});

// ─── POST /api/waitlist ──────────────────────────────────────────────────────
describe('POST /api/waitlist', () => {
  const body = (over: Row = {}) => ({ email: ' New@Mail.ru ', type: 'customer', consentPd: true, ...over });

  it('первая заявка: создаёт запись и отправляет «Заявка принята» (без согласия на рекламу тоже)', async () => {
    const res = await request(app).post('/api/waitlist').send(body({ consentMarketing: false }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockDb.waitlistEntry).toHaveLength(1);
    const e = mockDb.waitlistEntry[0];
    expect(e.email).toBe('new@mail.ru');
    expect(e.status).toBe('new');
    expect(e.confirmationSentAt).toBeInstanceOf(Date);
    expect(mailer.sendWaitlistConfirmation).toHaveBeenCalledTimes(1);
    expect(mailer.sendWaitlistConfirmation).toHaveBeenCalledWith('new@mail.ru', 'customer');
  });

  it('повторная отправка формы в течение 24 ч — без второго письма, заявка не дублируется', async () => {
    await request(app).post('/api/waitlist').send(body());
    const res = await request(app).post('/api/waitlist').send(body({ type: 'company', consentMarketing: true }));
    expect(res.body).toEqual({ ok: true });
    expect(mockDb.waitlistEntry).toHaveLength(1);
    expect(mockDb.waitlistEntry[0].type).toBe('company');
    expect(mockDb.waitlistEntry[0].consentMarketing).toBe(true);
    expect(mailer.sendWaitlistConfirmation).toHaveBeenCalledTimes(1);
  });

  it('повтор через сутки — письмо снова; приглашённой заявке подтверждение не шлём', async () => {
    const old = addEntry({ email: 'old@mail.ru', confirmationSentAt: new Date(Date.now() - 25 * HOUR) });
    await request(app).post('/api/waitlist').send(body({ email: 'old@mail.ru' }));
    expect(mailer.sendWaitlistConfirmation).toHaveBeenCalledTimes(1);
    expect(entry(old.id).confirmationSentAt.getTime()).toBeGreaterThan(Date.now() - HOUR);

    addEntry({ email: 'inv@mail.ru', status: 'invited', confirmationSentAt: null });
    await request(app).post('/api/waitlist').send(body({ email: 'inv@mail.ru' }));
    expect(mailer.sendWaitlistConfirmation).toHaveBeenCalledTimes(1);
  });

  it('email уже зарегистрирован — заявку не создаём, alreadyRegistered: true, письма нет', async () => {
    mockDb.user.push({ ...MOCK_DEFAULTS.user, id: 'u-9', email: 'new@mail.ru' });
    const res = await request(app).post('/api/waitlist').send(body());
    expect(res.body).toEqual({ ok: true, alreadyRegistered: true });
    expect(mockDb.waitlistEntry).toHaveLength(0);
    expect(mailer.sendWaitlistConfirmation).not.toHaveBeenCalled();
  });

  it('письмо не ушло — ответ всё равно ok, отметка снимается (следующая отправка формы попробует снова)', async () => {
    mailer.sendWaitlistConfirmation.mockRejectedValueOnce(new Error('smtp down'));
    const res = await request(app).post('/api/waitlist').send(body());
    expect(res.body).toEqual({ ok: true });
    await flush();
    expect(mockDb.waitlistEntry[0].confirmationSentAt).toBeNull();
  });

  it('без согласия на ПДн — 400', async () => {
    const res = await request(app).post('/api/waitlist').send(body({ consentPd: false }));
    expect(res.status).toBe(400);
    expect(mockDb.waitlistEntry).toHaveLength(0);
  });
});

// ─── POST /api/admin/waitlist/:id/invite ─────────────────────────────────────
describe('POST /api/admin/waitlist/:id/invite', () => {
  it('создаёт одноразовую ссылку source=waitlist (владелец — админ, скрыта), шлёт письмо, ставит статус', async () => {
    const e = addEntry({ email: 'a+b@mail.ru' });
    const res = await asAdmin(request(app).post(`/api/admin/waitlist/${e.id}/invite`));
    expect(res.status).toBe(200);

    expect(mockDb.referralLink).toHaveLength(1);
    const link = mockDb.referralLink[0];
    expect(link).toMatchObject({ source: 'waitlist', ownerId: ADMIN, label: 'Лист ожидания: a+b@mail.ru', multiUse: false, usedById: null });
    expect(link.hiddenAt).toBeInstanceOf(Date);

    const url = `https://moooza.test/register?ref=${link.code}&email=a%2Bb%40mail.ru`;
    expect(mailer.sendWaitlistInvite).toHaveBeenCalledWith('a+b@mail.ru', url);
    expect(res.body.inviteUrl).toBe(url);
    expect(res.body.entry.inviteUrl).toBe(url);

    expect(entry(e.id)).toMatchObject({ status: 'invited', invitedById: ADMIN, invitesSent: 1, referralLinkId: link.id });
    expect(entry(e.id).invitedAt).toBeInstanceOf(Date);
  });

  it('повтор в течение 24 ч — 429 с понятным текстом; через сутки — та же ссылка, invitesSent=2', async () => {
    const e = addEntry();
    await asAdmin(request(app).post(`/api/admin/waitlist/${e.id}/invite`));
    const again = await asAdmin(request(app).post(`/api/admin/waitlist/${e.id}/invite`));
    expect(again.status).toBe(429);
    expect(again.body.error).toMatch(/Приглашение уже отправлено .* повторить можно через \d+ ч/);
    expect(mailer.sendWaitlistInvite).toHaveBeenCalledTimes(1);

    entry(e.id).invitedAt = new Date(Date.now() - 25 * HOUR);
    const later = await asAdmin(request(app).post(`/api/admin/waitlist/${e.id}/invite`));
    expect(later.status).toBe(200);
    expect(mockDb.referralLink).toHaveLength(1); // переиспользована
    expect(entry(e.id).invitesSent).toBe(2);
    expect(mailer.sendWaitlistInvite).toHaveBeenCalledTimes(2);
  });

  it('сожжённая ссылка не переиспользуется — создаётся новая', async () => {
    const used = addLink({ source: 'waitlist', usedById: 'someone', usedAt: new Date() });
    const e = addEntry({ status: 'invited', referralLinkId: used.id, invitedAt: new Date(Date.now() - 48 * HOUR), invitesSent: 1 });
    const res = await asAdmin(request(app).post(`/api/admin/waitlist/${e.id}/invite`));
    expect(res.status).toBe(200);
    expect(mockDb.referralLink).toHaveLength(2);
    expect(entry(e.id).referralLinkId).not.toBe(used.id);
  });

  it('409, если регистрация закрыта и по приглашениям выключена; открытая регистрация — можно', async () => {
    const e = addEntry();
    mockSettings = { registrationEnabled: 'false', referralRegistrationEnabled: 'false' };
    const res = await asAdmin(request(app).post(`/api/admin/waitlist/${e.id}/invite`));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Включите регистрацию по приглашениям в настройках сайта, иначе ссылка не сработает');
    expect(mockDb.referralLink).toHaveLength(0);
    expect(mailer.sendWaitlistInvite).not.toHaveBeenCalled();

    mockSettings = {}; // по умолчанию регистрация открыта
    const open = await asAdmin(request(app).post(`/api/admin/waitlist/${e.id}/invite`));
    expect(open.status).toBe(200);
  });

  it('письмо не ушло — 502, статус и счётчик откатываются, ссылка остаётся для повтора', async () => {
    const e = addEntry();
    mailer.sendWaitlistInvite.mockRejectedValueOnce(new Error('smtp down'));
    const res = await asAdmin(request(app).post(`/api/admin/waitlist/${e.id}/invite`));
    expect(res.status).toBe(502);
    expect(entry(e.id)).toMatchObject({ status: 'new', invitedAt: null, invitesSent: 0 });
    expect(entry(e.id).referralLinkId).toBe(mockDb.referralLink[0].id);
    const retry = await asAdmin(request(app).post(`/api/admin/waitlist/${e.id}/invite`));
    expect(retry.status).toBe(200);
    expect(mockDb.referralLink).toHaveLength(1);
  });

  it('у email уже есть аккаунт — 409, письма нет, заявка отмечена registered', async () => {
    const e = addEntry({ email: 'has@mail.ru' });
    mockDb.user.push({ ...MOCK_DEFAULTS.user, id: 'u-has', email: 'has@mail.ru' });
    const res = await asAdmin(request(app).post(`/api/admin/waitlist/${e.id}/invite`));
    expect(res.status).toBe(409);
    expect(mailer.sendWaitlistInvite).not.toHaveBeenCalled();
    expect(entry(e.id)).toMatchObject({ status: 'registered', registeredUserId: 'u-has' });
  });

  it('неизвестная заявка — 404; не админ — 403', async () => {
    expect((await asAdmin(request(app).post('/api/admin/waitlist/nope/invite'))).status).toBe(404);
    mockDb.user.push({ ...MOCK_DEFAULTS.user, id: 'u-plain', email: 'plain@mail.ru' });
    const e = addEntry();
    const res = await request(app).post(`/api/admin/waitlist/${e.id}/invite`).set('x-test-user-id', 'u-plain');
    expect(res.status).toBe(403);
  });
});

// ─── POST /api/admin/waitlist/invite-bulk ────────────────────────────────────
describe('POST /api/admin/waitlist/invite-bulk', () => {
  it('до 50 id: приглашает по очереди, пропущенные — с причиной', async () => {
    const a = addEntry();
    const b = addEntry();
    const reg = addEntry({ status: 'registered' });
    const fresh = addEntry({ status: 'invited', invitedAt: new Date(), invitesSent: 1 });
    const res = await asAdmin(request(app).post('/api/admin/waitlist/invite-bulk'))
      .send({ ids: [a.id, b.id, reg.id, fresh.id, 'missing', a.id] });
    expect(res.status).toBe(200);
    expect(res.body.invited).toBe(2);
    expect(res.body.skipped).toEqual([
      expect.objectContaining({ id: reg.id, reason: 'already_registered' }),
      expect.objectContaining({ id: fresh.id, reason: 'too_soon' }),
      expect.objectContaining({ id: 'missing', reason: 'not_found' }),
    ]);
    expect(mailer.sendWaitlistInvite).toHaveBeenCalledTimes(2);
    expect(mockDb.referralLink.every((l) => l.source === 'waitlist')).toBe(true);
  });

  it('пусто или больше 50 — 400; выключенная регистрация — 409', async () => {
    expect((await asAdmin(request(app).post('/api/admin/waitlist/invite-bulk')).send({ ids: [] })).status).toBe(400);
    const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    expect((await asAdmin(request(app).post('/api/admin/waitlist/invite-bulk')).send({ ids })).status).toBe(400);
    mockSettings = { registrationEnabled: 'false' };
    const e = addEntry();
    const closed = await asAdmin(request(app).post('/api/admin/waitlist/invite-bulk')).send({ ids: [e.id] });
    expect(closed.status).toBe(409);
    expect(mailer.sendWaitlistInvite).not.toHaveBeenCalled();
  });
});

// ─── GET stats / list, DELETE ────────────────────────────────────────────────
describe('admin: stats, список, удаление', () => {
  it('stats: всего, по статусам и типам, конверсия приглашённых, invitesEnabled', async () => {
    addEntry({ type: 'customer' });
    addEntry({ type: 'customer', status: 'invited', invitesSent: 1 });
    addEntry({ type: 'company', status: 'invited', invitesSent: 2 });
    addEntry({ type: 'listener', status: 'registered', invitesSent: 1 });
    addEntry({ type: 'listener', status: 'registered', invitesSent: 0 }); // пришёл сам
    const res = await asAdmin(request(app).get('/api/admin/waitlist/stats'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 5,
      byStatus: { new: 1, invited: 2, registered: 2 },
      byType: { resident_waitlist: 0, listener: 2, customer: 2, company: 1 },
      invitedTotal: 3,
      conversion: 0.333,
      invitesEnabled: true,
    });
  });

  it('список: фильтр по статусу и типу, ссылка-приглашение и зарегистрировавшийся аккаунт', async () => {
    const link = addLink({ source: 'waitlist', code: 'INV12345' });
    const inv = addEntry({ email: 'inv@mail.ru', type: 'customer', status: 'invited', referralLinkId: link.id, invitesSent: 1 });
    mockDb.user.push({ ...MOCK_DEFAULTS.user, id: 'u-reg', email: 'reg@mail.ru', firstName: 'Рег', lastName: 'Р', nickname: 'reg' });
    addEntry({ email: 'reg@mail.ru', type: 'customer', status: 'registered', registeredUserId: 'u-reg', registeredAt: new Date() });
    addEntry({ type: 'company' });

    const invited = await asAdmin(request(app).get('/api/admin/waitlist').query({ status: 'invited' }));
    expect(invited.body.total).toBe(1);
    expect(invited.body.items[0].id).toBe(inv.id);
    expect(invited.body.items[0].inviteUrl).toBe('https://moooza.test/register?ref=INV12345&email=inv%40mail.ru');

    const reg = await asAdmin(request(app).get('/api/admin/waitlist').query({ status: 'registered', type: 'customer' }));
    expect(reg.body.total).toBe(1);
    expect(reg.body.items[0].registeredUser).toMatchObject({ id: 'u-reg', nickname: 'reg' });
    expect(reg.body.items[0].inviteUrl).toBeNull();

    const company = await asAdmin(request(app).get('/api/admin/waitlist').query({ type: 'company' }));
    expect(company.body.total).toBe(1);
  });

  it('удаление (152-ФЗ): заявка удалена, несожжённая ссылка удалена, сожжённая — без email в label', async () => {
    const unused = addLink({ source: 'waitlist', label: 'Лист ожидания: x@mail.ru' });
    const used = addLink({ source: 'waitlist', label: 'Лист ожидания: y@mail.ru', usedById: 'u-y' });
    const a = addEntry({ email: 'x@mail.ru', referralLinkId: unused.id });
    const b = addEntry({ email: 'y@mail.ru', referralLinkId: used.id, status: 'registered' });

    expect((await asAdmin(request(app).delete(`/api/admin/waitlist/${a.id}`))).status).toBe(200);
    expect((await asAdmin(request(app).delete(`/api/admin/waitlist/${b.id}`))).status).toBe(200);
    expect(mockDb.waitlistEntry).toHaveLength(0);
    expect(mockDb.referralLink.map((l) => l.id)).toEqual([used.id]);
    expect(mockDb.referralLink[0].label).not.toContain('y@mail.ru');

    expect((await asAdmin(request(app).delete(`/api/admin/waitlist/${a.id}`))).status).toBe(404);
  });

  it('досверка по email выполняется SQL-ом и не чаще раза в 30 с', async () => {
    await waitlistLib.syncWaitlistRegisteredByEmail(true);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    await waitlistLib.syncWaitlistRegisteredByEmail();
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

// ─── «Зарегистрировался» и Pro ───────────────────────────────────────────────
describe('отметка «Зарегистрировался»', () => {
  it('по сожжённой ссылке-приглашению и по совпадению email; registered не перезаписывается', async () => {
    const link = addLink({ source: 'waitlist' });
    const byLink = addEntry({ email: 'invitee@mail.ru', status: 'invited', referralLinkId: link.id });
    const byEmail = addEntry({ email: 'other@mail.ru' });
    const done = addEntry({ email: 'done@mail.ru', status: 'registered', registeredUserId: 'u-old', registeredAt: new Date(0) });

    // Друг по пересланной ссылке зарегистрировался с другим email — приглашение использовано.
    expect(await waitlistLib.markWaitlistRegistered({ userId: 'u-1', email: 'friend@mail.ru', referralLinkId: link.id })).toBe(1);
    expect(entry(byLink.id)).toMatchObject({ status: 'registered', registeredUserId: 'u-1' });

    expect(await waitlistLib.markWaitlistRegistered({ userId: 'u-2', email: ' Other@Mail.ru ' })).toBe(1);
    expect(entry(byEmail.id)).toMatchObject({ status: 'registered', registeredUserId: 'u-2' });
    expect(entry(byEmail.id).registeredAt).toBeInstanceOf(Date);

    expect(await waitlistLib.markWaitlistRegistered({ userId: 'u-3', email: 'done@mail.ru' })).toBe(0);
    expect(entry(done.id).registeredUserId).toBe('u-old');
  });

  it('verify-email: регистрация по waitlist-ссылке сжигает её, отмечает заявку и НЕ даёт админу Pro', async () => {
    // У админа уже 9 сожжённых waitlist-ссылок — 10-я дала бы месяц Pro, если бы считалась.
    for (let i = 0; i < 9; i++) addLink({ source: 'waitlist', usedById: `u-prev-${i}`, usedAt: new Date() });
    const link = addLink({ source: 'waitlist', code: 'WLINVITE' });
    const e = addEntry({ email: 'invitee@mail.ru', status: 'invited', referralLinkId: link.id, invitesSent: 1 });

    mockPrisma.pendingRegistration.findUnique.mockResolvedValue({
      email: 'invitee@mail.ru', code: '123456', passwordHash: 'hash',
      expiresAt: new Date(Date.now() + 600_000), createdAt: new Date(),
      payload: { firstName: 'Иван', lastName: 'Петров', referralCode: 'WLINVITE', consentPdAt: new Date().toISOString(), consentPdVersion: '2026-05-31' },
    });
    const res = await request(app).post('/api/auth/verify-email').send({ email: 'invitee@mail.ru', code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    const newUser = mockDb.user.find((u) => u.email === 'invitee@mail.ru')!;
    expect(mockDb.referralLink.find((l) => l.id === link.id)!.usedById).toBe(newUser.id);
    expect(entry(e.id)).toMatchObject({ status: 'registered', registeredUserId: newUser.id });

    await flush();
    await flush();
    const admin = mockDb.user.find((u) => u.id === ADMIN)!;
    expect(admin.proMonthsFromReferrals).toBe(0);
    expect(admin.proUntil).toBeNull();
  });

  it('verify-email без ссылки: заявка с тем же email тоже отмечается', async () => {
    const e = addEntry({ email: 'self@mail.ru' });
    mockSettings = {};
    mockPrisma.pendingRegistration.findUnique.mockResolvedValue({
      email: 'self@mail.ru', code: '654321', passwordHash: 'hash',
      expiresAt: new Date(Date.now() + 600_000), createdAt: new Date(),
      payload: { firstName: 'Сам', lastName: 'Пришёл', consentPdAt: new Date().toISOString() },
    });
    const res = await request(app).post('/api/auth/verify-email').send({ email: 'self@mail.ru', code: '654321' });
    expect(res.status).toBe(200);
    expect(entry(e.id).status).toBe('registered');
  });
});

describe('Pro за waitlist-ссылки не начисляется', () => {
  it('countProReferrals не считает source=waitlist (и считает обычные/NULL)', async () => {
    for (let i = 0; i < 12; i++) addLink({ source: 'waitlist', usedById: `u-w-${i}` });
    addLink({ source: null, usedById: 'u-n-1' });
    addLink({ source: null, usedById: 'u-n-2' });
    addLink({ source: null, usedById: null });                 // не сожжена
    addLink({ source: null, multiUse: true, usedCount: 50 }); // кампания
    expect(await countProReferrals(ADMIN)).toBe(2);
  });

  it('applyReferralProGrants: 10+ сожжённых waitlist-ссылок — месяц Pro не выдаётся', async () => {
    for (let i = 0; i < 10; i++) addLink({ source: 'waitlist', usedById: `u-w-${i}` });
    await applyReferralProGrants(ADMIN);
    const admin = mockDb.user.find((u) => u.id === ADMIN)!;
    expect(admin.proMonthsFromReferrals).toBe(0);
    expect(admin.proUntil).toBeNull();

    // Контроль: 10 личных ссылок — месяц выдаётся.
    for (let i = 0; i < 10; i++) addLink({ source: null, usedById: `u-p-${i}` });
    await applyReferralProGrants(ADMIN);
    expect(mockDb.user.find((u) => u.id === ADMIN)!.proMonthsFromReferrals).toBe(1);
  });

  it('GET /referrals/stats: регистрации по waitlist-ссылкам не в count и не в proCount', async () => {
    const wl = addLink({ source: 'waitlist', usedById: 'u-wl' });
    const own = addLink({ source: null, usedById: 'u-own' });
    mockDb.user.push({ ...MOCK_DEFAULTS.user, id: 'u-wl', email: 'wl@mail.ru', referrerId: ADMIN, referralLinkUsed: wl.code });
    mockDb.user.push({ ...MOCK_DEFAULTS.user, id: 'u-own', email: 'own@mail.ru', referrerId: ADMIN, referralLinkUsed: own.code });
    mockDb.user.push({ ...MOCK_DEFAULTS.user, id: 'u-legacy', email: 'leg@mail.ru', referrerId: ADMIN });
    const res = await asAdmin(request(app).get('/api/referrals/stats'));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.proCount).toBe(1);
  });

  it('waitlist-ссылки не видны в «Моих ссылках» владельца', async () => {
    addLink({ source: 'waitlist', hiddenAt: new Date() });
    const mine = addLink({ source: null });
    const res = await asAdmin(request(app).get('/api/referrals/links'));
    expect(res.body.map((l: Row) => l.id)).toEqual([mine.id]);
  });
});

describe('временное авто-приглашение (waitlistAutoInvite)', () => {
  const body = (over: Row = {}) => ({ email: 'auto@mail.ru', type: 'resident_waitlist', consentPd: true, ...over });

  it('флаг выключен — обычное «Заявка принята», без приглашения', async () => {
    const res = await request(app).post('/api/waitlist').send(body());
    expect(res.body).toEqual({ ok: true });
    expect(mockDb.waitlistEntry[0].status).toBe('new');
    expect(mailer.sendWaitlistInvite).not.toHaveBeenCalled();
    expect(mailer.sendWaitlistConfirmation).toHaveBeenCalledTimes(1);
  });

  it('флаг включён — сразу приглашение: статус invited, ссылка в ответе, письмо-приглашение вместо подтверждения', async () => {
    mockSettings = { ...mockSettings, waitlistAutoInvite: 'true' };
    const res = await request(app).post('/api/waitlist').send(body());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.invited).toBe(true);
    expect(res.body.inviteUrl).toMatch(/\/register\?ref=[^&]+&email=auto%40mail\.ru$/);
    const e = mockDb.waitlistEntry[0];
    expect(e.status).toBe('invited');
    expect(e.invitedById).toBe(ADMIN); // нет team@moooza.ru — старейший админ
    expect(mailer.sendWaitlistInvite).toHaveBeenCalledTimes(1);
    expect(mailer.sendWaitlistConfirmation).not.toHaveBeenCalled();
    const link = mockDb.referralLink.find((l: Row) => l.id === e.referralLinkId);
    expect(link?.source).toBe('waitlist');
  });

  it('флаг включён, но регистрация по приглашениям выключена — обычное подтверждение', async () => {
    mockSettings = { registrationEnabled: 'false', referralRegistrationEnabled: 'false', waitlistAutoInvite: 'true' };
    const res = await request(app).post('/api/waitlist').send(body());
    expect(res.body).toEqual({ ok: true });
    expect(mockDb.waitlistEntry[0].status).toBe('new');
    expect(mailer.sendWaitlistInvite).not.toHaveBeenCalled();
    expect(mailer.sendWaitlistConfirmation).toHaveBeenCalledTimes(1);
  });

  it('флаг включён, письмо-приглашение не ушло — откат и обычное подтверждение', async () => {
    mockSettings = { ...mockSettings, waitlistAutoInvite: 'true' };
    (mailer.sendWaitlistInvite as jest.Mock).mockRejectedValueOnce(new Error('smtp down'));
    const res = await request(app).post('/api/waitlist').send(body());
    expect(res.body).toEqual({ ok: true });
    expect(mockDb.waitlistEntry[0].status).toBe('new');
    expect(mailer.sendWaitlistConfirmation).toHaveBeenCalledTimes(1);
  });
});

