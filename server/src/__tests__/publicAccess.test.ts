/**
 * Гостевой режим «Moooza доступна без регистрации» (Ф0/Ф1):
 *   - deep-key: ни один гостевой GET не отдаёт ключей из GUEST_FORBIDDEN_KEYS
 *     (Prisma-моки возвращают «грязные» строки и игнорируют select);
 *   - 404 для людей без согласия / заблокированных / несуществующих (одинаково),
 *     черновиков услуг и заказов, REJECTED-артистов;
 *   - matches — только владелец;
 *   - guestBrowsingEnabled=false → старое поведение (401 там, где был authenticate);
 *   - маскирование контактов, заголовки no-cache / X-Robots-Tag, 301 og/profile.
 */

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { NOW, person, profileRow, serviceRow, DIRTY_SOCIAL_LINKS } from './helpers/guestTestKit';

// ── Prisma: авто-мок (любая model.method — jest.fn) ─────────────────────────

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

// authenticate: userId из заголовка x-test-user-id, иначе 401 (как настоящий).
// optionalAuthenticate: userId из заголовка, если есть, иначе гость.
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const publicData = require('../lib/publicData');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const siteSettings = require('../routes/site-settings');
const { findGuestForbiddenKeys, GUEST_FORBIDDEN_KEYS } = publicData;

function buildApp() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const guest = require('../middleware/guest');
  const app = express();
  app.use(express.json());
  app.use('/api', guest.apiRobotsHeaders);
  app.use('/api/users', require('../routes/users').default);
  app.use('/api/artists', require('../routes/artists').default);
  app.use('/api/releases', require('../routes/releases').default);
  app.use('/api/clips', require('../routes/clips').default);
  app.use('/api/posts', require('../routes/posts').default);
  app.use('/api/orders', require('../routes/orders').default);
  app.use('/api/vacancies', require('../routes/vacancies').default);
  app.use('/api/reviews', require('../routes/reviews').default);
  app.use('/api/references', require('../routes/references').default);
  app.use('/api/site-settings', require('../routes/site-settings').default);
  app.use('/api/admin', require('../routes/admin').default);
  app.get('/api/og/profile/:userId', guest.legacyOgProfileRedirect);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => res.status(500).json({ error: String(err?.message ?? err) }));
  /* eslint-enable @typescript-eslint/no-require-imports */
  return app;
}

const app = buildApp();
const m = (model: string) => mockPrisma[model];

function setGuestBrowsing(enabled: boolean) {
  m('siteSetting').findMany.mockResolvedValue(enabled ? [{ key: 'guestBrowsingEnabled', value: 'true' }] : []);
}

function expectNoForbiddenKeys(body: unknown) {
  expect(findGuestForbiddenKeys(body)).toEqual([]);
}

function expectGuestHeaders(res: request.Response) {
  expect(res.headers['cache-control']).toBe('no-cache');
  expect(res.headers['x-robots-tag']).toBe('noindex');
  expect(String(res.headers['vary'] ?? '')).toMatch(/Authorization/i);
}

/** Строка поля where/select где-то внутри аргументов вызова мока. */
function callArgsJson(fn: jest.Mock): string {
  return JSON.stringify(fn.mock.calls, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
}

beforeEach(() => {
  for (const fn of mockFns) {
    fn.mockReset();
    const method = Object.entries(mockModels).flatMap(([, fns]) => Object.entries(fns)).find(([, f]) => f === fn)?.[0] ?? '';
    fn.mockImplementation(async () => mockDefault(method));
  }
  siteSettings.clearSiteSettingsCache();
  publicData.clearGuestFeedCache();
  setGuestBrowsing(true);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GUEST_FORBIDDEN_KEYS', () => {
  it('contains the plan list', () => {
    for (const k of ['email', 'phone', 'password', 'telegramId', 'vkId', 'birthDate', 'lastSeenAt', 'notificationPrefs',
      'isBlocked', 'blockedUntil', 'isAdmin', 'verificationCode', 'verificationProofUrl', 'rejectionReason', 'submittedById',
      'contactsVisibility', 'termsAgreedAt', 'referrerId', 'avgResponseMinutes', 'responses', 'userId']) {
      expect(GUEST_FORBIDDEN_KEYS).toContain(k);
    }
    // префиксы friendship* / reference* / referrer*
    expect(findGuestForbiddenKeys({ friendshipStatus: 'x', referenceFiles: [], referrer: {} })).toHaveLength(3);
  });
});

describe('GET /api/users/:id (guest)', () => {
  it('profile with consent → 200, whitelist only, contacts hidden, text masked', async () => {
    m('user').findFirst.mockResolvedValue(profileRow('u-pub'));
    m('deal').count.mockResolvedValue(3);

    const res = await request(app).get('/api/users/u-pub');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expectGuestHeaders(res);
    expect(res.body.id).toBe('u-pub');
    expect(res.body.contactsAvailable).toBe(true);
    expect(res.body.socialLinks).toEqual({ yandex_music: DIRTY_SOCIAL_LINKS.yandex_music, website: DIRTY_SOCIAL_LINKS.website });
    expect(res.body.bio).toContain('[контакт — после входа]');
    expect(res.body.bio).not.toMatch(/916|t\.me/);
    expect(res.body.userServices.map((s: any) => s.id)).toEqual(['svc-active']);
    expect(res.body.userArtists.map((a: any) => a.artist.id)).toEqual(['a-1']);
    expect(res.body.dealsCount).toBe(3);
    // ссылка /professions/:userId/:professionId строится по professionId (был баг: undefined)
    expect(res.body.userProfessions[0].professionId).toBe('prof-1');
    expect(res.body.indexable).toBe(true);
    expect(res.body).not.toHaveProperty('_count.sentRequests');
    // запрос к БД ограничен согласием
    expect(callArgsJson(m('user').findFirst)).toContain('publicConsentAt');
  });

  it('no consent / blocked / temporarily blocked / missing → identical 404', async () => {
    const bodies: any[] = [];
    for (const row of [
      profileRow('u-np', { consent: false }),
      profileRow('u-bl', { blocked: true }),
      { ...profileRow('u-tb'), blockedUntil: new Date(Date.now() + 86400_000) },
      null,
    ]) {
      m('user').findFirst.mockResolvedValueOnce(row);
      const res = await request(app).get('/api/users/whatever');
      expect(res.status).toBe(404);
      bodies.push(res.body);
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it('searchIndexingOptOut → still visible, indexable=false', async () => {
    m('user').findFirst.mockResolvedValue({ ...profileRow('u-pub'), searchIndexingOptOut: true });
    const res = await request(app).get('/api/users/u-pub');
    expect(res.status).toBe(200);
    expect(res.body.indexable).toBe(false);
    expectNoForbiddenKeys(res.body);
  });

  it('authorized viewer keeps the old path (no guest whitelist) but without notificationPrefs', async () => {
    m('user').findUnique.mockResolvedValue({ id: 'u-pub', birthDateVisible: false, contactsVisibility: 'ALL', socialLinks: {} });
    const res = await request(app).get('/api/users/u-pub').set('x-test-user-id', 'viewer');
    expect(res.status).toBe(200);
    const selectArg = m('user').findUnique.mock.calls[0][0].select;
    expect(selectArg).not.toHaveProperty('notificationPrefs');
    expect(m('user').findFirst).not.toHaveBeenCalled();
  });
});

describe('GET /api/users/handle/:handle (guest)', () => {
  it('200 with consent, 404 without', async () => {
    m('user').findFirst.mockResolvedValueOnce(profileRow('u-pub'));
    let res = await request(app).get('/api/users/handle/@nick');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);

    m('user').findFirst.mockResolvedValueOnce(profileRow('u-np', { consent: false }));
    res = await request(app).get('/api/users/handle/nick2');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/users/:id/services and /user-service/:id (guest)', () => {
  it('services: only active, only for consenting owner', async () => {
    m('user').findFirst.mockResolvedValue(person('u-pub'));
    m('userService').findMany.mockResolvedValue([serviceRow('s1', 'active'), serviceRow('s2', 'draft'), serviceRow('s3', 'archived')]);
    const res = await request(app).get('/api/users/u-pub/services');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body.map((s: any) => s.id)).toEqual(['s1']);
    expect(res.body[0].description).toContain('[контакт — после входа]');
    expect(JSON.stringify(res.body[0].priceItems)).not.toContain('@mixer_pro');
    expect(m('userService').findMany.mock.calls[0][0].where.status).toBe('active');
  });

  it('authorized: non-owner sees only active, owner sees all statuses', async () => {
    m('userService').findMany.mockResolvedValue([]);
    await request(app).get('/api/users/u-pub/services').set('x-test-user-id', 'stranger');
    expect(m('userService').findMany.mock.calls[0][0].where).toEqual({ userId: 'u-pub', status: { notIn: ['draft', 'archived'] } });
    await request(app).get('/api/users/u-pub/services').set('x-test-user-id', 'u-pub');
    expect(m('userService').findMany.mock.calls[1][0].where).toEqual({ userId: 'u-pub' });

    m('userService').findUnique.mockResolvedValueOnce({ ...serviceRow('s2', 'draft'), userId: 'u-pub' });
    expect((await request(app).get('/api/users/user-service/s2').set('x-test-user-id', 'stranger')).status).toBe(404);
    m('userService').findUnique.mockResolvedValueOnce({ ...serviceRow('s2', 'draft'), userId: 'u-pub' });
    expect((await request(app).get('/api/users/user-service/s2').set('x-test-user-id', 'u-pub')).status).toBe(200);
  });

  it('services of a user without consent → 404', async () => {
    m('user').findFirst.mockResolvedValue(person('u-np', { consent: false }));
    const res = await request(app).get('/api/users/u-np/services');
    expect(res.status).toBe(404);
  });

  it('user-service: active + consent → 200; draft → 404; owner without consent → 404', async () => {
    m('userService').findFirst.mockResolvedValueOnce(serviceRow('s1', 'active'));
    let res = await request(app).get('/api/users/user-service/s1');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body.user.id).toBe('u-pub');
    expect(res.body.user.city === null || typeof res.body.user.city === 'string').toBe(true);

    m('userService').findFirst.mockResolvedValueOnce(serviceRow('s2', 'draft'));
    res = await request(app).get('/api/users/user-service/s2');
    expect(res.status).toBe(404);

    m('userService').findFirst.mockResolvedValueOnce(serviceRow('s3', 'active', person('u-np', { consent: false })));
    res = await request(app).get('/api/users/user-service/s3');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/users/catalog (guest)', () => {
  const catalogRow = (id: string) => ({
    ...person(id), bio: 'пишите @catalog_user', city: 'Москва', country: 'Россия', occupancyStatus: 'open', createdAt: NOW,
    fieldOfActivity: { id: 'f-1', name: 'Музыка' },
    userServices: [{ profession: { id: 'prof-1', name: 'Звукорежиссёр' } }],
    reviewsReceived: [{ rating: 8 }, { rating: 10 }],
    _count: { sentConnections: 2, receivedConnections: 1 },
  });

  it('flag on → 200, consent filter, take ≤ 100, whitelist (legacy array form)', async () => {
    m('user').findMany
      .mockResolvedValueOnce([{ id: 'u-1' }, { id: 'u-2' }])            // id страницы
      .mockResolvedValueOnce([catalogRow('u-1'), catalogRow('u-2')]);   // строки страницы
    m('user').count.mockResolvedValue(2);
    m('review').groupBy.mockResolvedValue([{ targetId: 'u-1', _avg: { rating: 9 }, _count: { _all: 2 } }]);
    const res = await request(app).get('/api/users/catalog?sort=connections');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expectGuestHeaders(res);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).not.toHaveProperty('connectionsCount');
    expect(res.body[0].ratingAvg).toBe(9);
    expect(res.body[0].bio).toContain('[контакт — после входа]');
    const args = m('user').findMany.mock.calls[0][0];
    expect(args.take).toBeLessThanOrEqual(100);
    expect(JSON.stringify(args.where)).toContain('publicConsentAt');
    // сортировка по связям гостю недоступна — groupBy по connection не вызывается
    expect(m('connection').groupBy).not.toHaveBeenCalled();
  });

  it('paginated form { results, pagination } and page depth ≤ 10 for guests', async () => {
    m('user').findMany.mockResolvedValueOnce([{ id: 'u-1' }]).mockResolvedValueOnce([catalogRow('u-1')]);
    m('user').count.mockResolvedValue(500);
    const res = await request(app).get('/api/users/catalog?page=99&limit=50');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body.pagination.page).toBe(10);
    expect(res.body.results).toHaveLength(1);
  });

  it('flag off → 401 like before (authenticate)', async () => {
    setGuestBrowsing(false);
    const res = await request(app).get('/api/users/catalog');
    expect(res.status).toBe(401);
    expect(m('user').findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/artists/:id (guest)', () => {
  const artistRow = (status: string) => ({
    id: 'a-1', name: 'Группа', nameNorm: 'группа', type: 'GROUP', city: 'Москва', tourReady: null,
    description: 'Букинг: +7 916 123-45-67', socialLinks: DIRTY_SOCIAL_LINKS, bandLink: null, avatar: null, banner: null,
    listeners: BigInt(1500), listenersDelta: 10, ymData: { similarArtists: [], popularTracks: [{ title: 'Хит' }], secretKey: 'x' },
    activityStatus: 'ACTIVE', status, submittedById: 'u-owner', rejectionReason: 'плохо', verificationCode: 'MOOOZA-ABC123',
    verificationProofUrl: 'https://proof', moderatedAt: NOW, submitterRoles: ['owner'], createdAt: NOW, updatedAt: NOW,
    genres: [{ artistId: 'a-1', genreId: 'g-1', genre: { id: 'g-1', name: 'Рок' } }],
    _count: { followers: 7 },
    followers: [{ userId: 'u-x' }],
    userArtists: [
      { id: 'ua-1', userId: 'u-pub', isOwner: true, isAdmin: true, inviteStatus: 'ACCEPTED', participationStatus: 'ACTIVE_MEMBER', invitedById: null, user: person('u-pub'), profession: null, roles: [{ role: { id: 'r-1', name: 'Вокал' } }] },
      { id: 'ua-2', userId: 'u-np', isOwner: false, isAdmin: false, inviteStatus: 'ACCEPTED', participationStatus: 'ACTIVE_MEMBER', invitedById: null, user: person('u-np', { consent: false }), profession: null, roles: [] },
      { id: 'ua-3', userId: 'u-pend', isOwner: false, isAdmin: false, inviteStatus: 'PENDING', participationStatus: 'ACTIVE_MEMBER', invitedById: 'u-pub', user: person('u-pend'), profession: null, roles: [] },
    ],
  });

  it('VERIFIED → 200, no moderation fields, members: consent only + hidden count', async () => {
    m('artist').findUnique.mockResolvedValue(artistRow('VERIFIED'));
    const res = await request(app).get('/api/artists/a-1');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expectGuestHeaders(res);
    expect(res.body.listeners).toBe(1500);
    expect(res.body.confirmedMembers).toHaveLength(1);
    expect(res.body.confirmedMembers[0].user.id).toBe('u-pub');
    expect(res.body.members.map((x: any) => x.id)).toEqual(['u-pub']);
    expect(res.body.hiddenMembersCount).toBe(1);
    expect(res.body.pendingMembers).toEqual([]);
    expect(res.body.socialLinks).not.toHaveProperty('phone');
    expect(res.body.socialLinks.vk).toBe(DIRTY_SOCIAL_LINKS.vk); // страница группы — не личный контакт
    expect(res.body.contactsAvailable).toBe(true);
    expect(res.body.description).toContain('[контакт — после входа]');
    expect(res.body.ymData).not.toHaveProperty('secretKey');
    expect(res.body.indexable).toBe(true);
  });

  it('PENDING → 200 + indexable=false; REJECTED / missing → 404', async () => {
    m('artist').findUnique.mockResolvedValueOnce(artistRow('PENDING'));
    let res = await request(app).get('/api/artists/a-1');
    expect(res.status).toBe(200);
    expect(res.body.indexable).toBe(false);

    m('artist').findUnique.mockResolvedValueOnce(artistRow('REJECTED'));
    res = await request(app).get('/api/artists/a-1');
    expect(res.status).toBe(404);

    m('artist').findUnique.mockResolvedValueOnce(null);
    res = await request(app).get('/api/artists/nope');
    expect(res.status).toBe(404);
  });

  it('authorized non-admin does not get verification code / proof / rejection reason', async () => {
    m('artist').findUnique.mockResolvedValue(artistRow('VERIFIED'));
    const res = await request(app).get('/api/artists/a-1').set('x-test-user-id', 'u-stranger');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('verificationCode');
    expect(res.body).not.toHaveProperty('verificationProofUrl');
    expect(res.body).not.toHaveProperty('rejectionReason');
    // PENDING-участие видно только админам артиста и самому приглашённому
    expect(res.body.members.map((x: any) => x.id)).not.toContain('u-pend');
  });

  it('authorized owner (confirmed UserArtist.isOwner) still gets verification code', async () => {
    m('artist').findUnique.mockResolvedValue(artistRow('DRAFT'));
    const res = await request(app).get('/api/artists/a-1').set('x-test-user-id', 'u-pub');
    expect(res.status).toBe(200);
    expect(res.body.verificationCode).toBe('MOOOZA-ABC123');
  });
});

describe('releases / clips (guest)', () => {
  const credits = [
    { id: 'p-1', userId: 'u-pub', confirmStatus: 'ACCEPTED', user: person('u-pub'), roles: [{ role: { id: 'r-1', name: 'Гитара' } }] },
    { id: 'p-2', userId: 'u-np', confirmStatus: 'ACCEPTED', user: person('u-np', { consent: false }), roles: [] },
    { id: 'p-3', userId: 'u-pend', confirmStatus: 'PENDING', user: person('u-pend'), roles: [] },
  ];

  it('GET /api/releases/:id → credits with consent + hidden count; REJECTED → 404', async () => {
    m('release').findUnique.mockResolvedValueOnce({
      id: 'r-1', artistId: 'a-1', title: 'Альбом', coverUrl: null, releaseDate: NOW, platform: 'YANDEX_MUSIC', url: 'https://music.yandex.ru/album/1',
      releaseType: 'album', label: null, genre: 'rock', trackCount: 2, likesCount: 5, tracklist: [{ id: 't1', title: 'Трек', durationMs: 1000, artists: ['Группа'] }],
      createdAt: NOW, updatedAt: NOW, artist: { id: 'a-1', name: 'Группа', avatar: null, status: 'VERIFIED', verificationCode: 'X' }, participants: credits,
    });
    let res = await request(app).get('/api/releases/r-1');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body.participants.map((p: any) => p.user.id)).toEqual(['u-pub']);
    expect(res.body.hiddenParticipantsCount).toBe(1);

    m('release').findUnique.mockResolvedValueOnce({ id: 'r-2', artistId: 'a-2', artist: { id: 'a-2', status: 'REJECTED' }, participants: [] });
    res = await request(app).get('/api/releases/r-2');
    expect(res.status).toBe(404);
  });

  it('GET /api/releases/artist/:id → list; REJECTED artist → 404', async () => {
    m('artist').findUnique.mockResolvedValueOnce({ id: 'a-1', status: 'APPROVED', updatedAt: NOW, verificationCode: 'X' });
    m('release').findMany.mockResolvedValueOnce([{ id: 'r-1', artistId: 'a-1', title: 'A', coverUrl: null, platform: 'VK', url: 'https://vk.com/music', releaseDate: null, updatedAt: NOW, tracklist: [] }]);
    let res = await request(app).get('/api/releases/artist/a-1');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body).toEqual([{ id: 'r-1', title: 'A', coverUrl: null, platform: 'VK', url: 'https://vk.com/music', releaseDate: null }]);

    m('artist').findUnique.mockResolvedValueOnce({ id: 'a-2', status: 'REJECTED' });
    res = await request(app).get('/api/releases/artist/a-2');
    expect(res.status).toBe(404);
  });

  it('GET /api/clips/:id and /api/clips/artist/:id', async () => {
    m('clip').findUnique.mockResolvedValueOnce({
      id: 'c-1', artistId: 'a-1', title: 'Клип', coverUrl: null, platform: 'RUTUBE', url: 'https://rutube.ru/v/1', createdAt: NOW, updatedAt: NOW,
      artist: { id: 'a-1', name: 'Группа', avatar: null, status: 'DRAFT' }, participants: credits,
    });
    let res = await request(app).get('/api/clips/c-1');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body.indexable).toBe(false);
    expect(res.body.hiddenParticipantsCount).toBe(1);

    m('artist').findUnique.mockResolvedValueOnce({ id: 'a-1', status: 'VERIFIED', updatedAt: NOW });
    m('clip').findMany.mockResolvedValueOnce([{ id: 'c-1', artistId: 'a-1', title: 'Клип', coverUrl: null, platform: 'RUTUBE', url: 'https://rutube.ru/v/1', updatedAt: NOW }]);
    res = await request(app).get('/api/clips/artist/a-1');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);

    m('clip').findUnique.mockResolvedValueOnce({ id: 'c-2', artistId: 'a-2', artist: { id: 'a-2', status: 'REJECTED' }, participants: [] });
    res = await request(app).get('/api/clips/c-2');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/posts/feed (guest)', () => {
  const basePost = (id: string, author: any, extra: Record<string, unknown> = {}) => ({
    id, type: 'blog', title: null, content: `Пост ${id}, пишите @contact_${id.replace(/-/g, '_')}`, category: null, city: null,
    imageUrl: null, images: [], audioUrl: null, audioName: null, pollOptions: null, pollEndsAt: null, tags: [], genres: [],
    links: ['https://t.me/secret', 'https://music.yandex.ru/album/1'], mentions: [{ id: 'u-np', type: 'user', name: 'Скрытый Человек' }, { id: 'a-1', type: 'artist', name: 'Группа' }],
    repostComment: null, repostDeleted: false, repostOfId: null, repostOf: null, artistId: null, artist: null, channelId: null, channel: null,
    serviceId: null, service: null, orderId: null, order: null, vacancyId: null, vacancy: null,
    authorId: author.id, author,
    likes: [{ id: 'l-1', userId: 'u-x' }],
    savedBy: [{ id: 's-1', userId: 'u-x' }],
    comments: [{ id: 'c-1', content: 'коммент', authorId: 'u-x', author: person('u-x'), reactions: [{ id: 'cr-1', emoji: '👍', userId: 'u-x' }], replies: [] }],
    reactions: [{ id: 'pr-1', emoji: '🔥', userId: 'u-x' }],
    _count: { likes: 1, comments: 1, savedBy: 1, reposts: 0, reactions: 2 },
    createdAt: NOW, updatedAt: NOW,
    ...extra,
  });

  function feedRows() {
    return [
      basePost('p-pub', person('u-pub')),
      basePost('p-artist', person('u-np', { consent: false }), { artistId: 'a-1', artist: { id: 'a-1', name: 'Группа', avatar: null, status: 'VERIFIED' } }),
      basePost('p-order', person('u-np', { consent: false }), {
        type: 'order', orderId: 'o-1',
        order: { id: 'o-1', title: 'Нужен звукорежиссёр', budgetFrom: 1000, budgetTo: 2000, deadline: null, status: 'active', executorId: 'u-exec', authorId: 'u-np', service: { name: 'Сведение', section: { name: 'Продакшн' } } },
      }),
      basePost('p-hidden', person('u-np', { consent: false })),
      basePost('p-blocked', person('u-bl', { blocked: true })),
      basePost('p-repost', person('u-pub'), {
        repostOfId: 'p-hidden', repostOf: { ...basePost('p-hidden', person('u-np', { consent: false })) },
      }),
    ];
  }

  it('200: only public authors / artist / order posts, no comments, aggregated reactions, whitelist', async () => {
    m('post').findMany.mockResolvedValue(feedRows());
    m('postReaction').groupBy.mockResolvedValue([{ postId: 'p-pub', emoji: '🔥', _count: { _all: 2 } }]);
    m('user').findMany.mockResolvedValue([]); // упомянутые люди без согласия

    const res = await request(app).get('/api/posts/feed');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expectGuestHeaders(res);
    const ids = res.body.map((p: any) => p.id);
    expect(ids).toEqual(['p-pub', 'p-artist', 'p-order', 'p-repost']);
    const pub = res.body[0];
    // та же форма поста, что у авторизованной ленты dev (decoratePosts)
    expect(pub.comments).toEqual([]);
    expect(pub._count.comments).toBe(1);
    expect(pub).not.toHaveProperty('reactions');
    expect(pub.reactionSummary).toEqual([{ emoji: '🔥', count: 2 }]);
    expect(pub.myReaction).toBeNull();
    expect(pub.myVote).toBeNull();
    expect(pub.isLiked).toBe(false);
    expect(pub.isSaved).toBe(false);
    expect(pub.likes).toEqual([]);
    expect(pub.pollVotes).toEqual([]);
    expect(pub.content).toContain('[контакт — после входа]');
    expect(pub.links).toEqual(['https://music.yandex.ru/album/1']);
    expect(pub.mentions[0]).toEqual({ id: null, type: 'user', name: 'Участник Moooza' });
    expect(pub.mentions[1].id).toBe('a-1');
    const artistPost = res.body[1];
    expect(artistPost.author.id).toBeNull();
    expect(artistPost.artist.id).toBe('a-1');
    const orderPost = res.body[2];
    expect(orderPost.author.displayName).toBe('Заказчик на Moooza');
    expect(orderPost.order.hasExecutor).toBe(true);
    const repost = res.body[3];
    expect(repost.repostOf).toBeNull();
    expect(repost.repostHidden).toBe(true);
    // where содержит ограничение видимости
    expect(callArgsJson(m('post').findMany)).toContain('publicConsentAt');
  });

  it('limit ≤ 20, offset ≥ 200 → [] without DB', async () => {
    m('post').findMany.mockResolvedValue([]);
    let res = await request(app).get('/api/posts/feed?limit=100&offset=0');
    expect(res.status).toBe(200);
    expect(m('post').findMany.mock.calls[0][0].take).toBe(20);

    m('post').findMany.mockClear();
    res = await request(app).get('/api/posts/feed?limit=20&offset=190');
    expect(m('post').findMany.mock.calls[0][0].take).toBe(10);

    m('post').findMany.mockClear();
    res = await request(app).get('/api/posts/feed?offset=200');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(m('post').findMany).not.toHaveBeenCalled();
  });

  it('cursor mode: { items, nextCursor } like dev, opaque guest cursor, depth ≤ 200', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      ...basePost(`p-${i}`, person('u-pub')), createdAt: new Date(Date.UTC(2026, 0, 3 - i)),
    }));
    m('post').findMany.mockResolvedValue(rows);
    let res = await request(app).get('/api/posts/feed?limit=2&cursor=');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).toBe(`g2:${rows[1].createdAt.toISOString()}|p-1`);
    expect(m('post').findMany.mock.calls[0][0].take).toBe(3);

    // следующая страница — keyset по (createdAt,id) + глубина в курсоре
    m('post').findMany.mockClear();
    m('post').findMany.mockResolvedValue([rows[2]]);
    res = await request(app).get(`/api/posts/feed?limit=2&cursor=${encodeURIComponent(`g2:${rows[1].createdAt.toISOString()}|p-1`)}`);
    expect(res.body.items.map((p: any) => p.id)).toEqual(['p-2']);
    expect(res.body.nextCursor).toBeNull();
    expect(JSON.stringify(m('post').findMany.mock.calls[0][0].where)).toContain('"lt"');

    // глубина исчерпана — пусто без запроса в БД
    m('post').findMany.mockClear();
    res = await request(app).get('/api/posts/feed?cursor=g200');
    expect(res.body).toEqual({ items: [], nextCursor: null });
    expect(m('post').findMany).not.toHaveBeenCalled();
  });

  it('ranked sort with cursor slices one shared snapshot', async () => {
    const cands = Array.from({ length: 5 }, (_, i) => ({
      id: `r-${i}`, createdAt: new Date(Date.UTC(2026, 0, 10 - i)), authorId: `a-${i}`,
      _count: { likes: i, reactions: 0, comments: 0, savedBy: 0 },
    }));
    m('post').findMany.mockImplementation(async (args: any) => {
      if (args?.take === 600) return cands; // кандидаты для ранжирования
      const ids: string[] = args?.where?.AND?.[0]?.id?.in ?? [];
      return ids.map((id) => ({ ...basePost(id, person('u-pub')) }));
    });
    const res = await request(app).get('/api/posts/feed?sort=popular&limit=2&cursor=');
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: any) => p.id)).toEqual(['r-4', 'r-3']);
    expect(res.body.nextCursor).toBe('g2');
    const res2 = await request(app).get('/api/posts/feed?sort=popular&limit=2&cursor=g2');
    expect(res2.body.items.map((p: any) => p.id)).toEqual(['r-2', 'r-1']);
  });

  it('HTML content: mentions of people without consent are anonymized, contact links lose href', async () => {
    const html = '<p>Привет <span class="post-mention" data-type="mention" data-id="u-np" data-label="Скрытый">@Скрытый</span> '
      + 'и <span class="post-mention" data-type="mention" data-id="u-pub" data-label="Публичный">@Публичный</span>, '
      + 'пиши <a href="https://t.me/secret_handle">сюда</a> или 8 916 123-45-67, трек <a href="https://music.yandex.ru/album/1">тут</a></p>';
    m('post').findMany.mockResolvedValue([{ ...basePost('p-html', person('u-pub')), content: html, mentions: [{ id: 'u-np', type: 'user', name: 'Скрытый' }, { id: 'u-pub', type: 'user', name: 'Публичный' }] }]);
    m('user').findMany.mockResolvedValue([{ id: 'u-pub' }]);
    const res = await request(app).get('/api/posts/feed');
    const content: string = res.body[0].content;
    expect(content).not.toContain('u-np');
    expect(content).not.toContain('Скрытый');
    expect(content).toContain('@Участник Moooza');
    expect(content).toContain('data-id="u-pub"');
    expect(content).not.toContain('t.me');
    expect(content).not.toContain('916');
    expect(content).toContain('href="https://music.yandex.ru/album/1"');
  });

  it('works with guestBrowsingEnabled=false too (feed was public before), still guest-safe', async () => {
    setGuestBrowsing(false);
    m('post').findMany.mockResolvedValue(feedRows());
    const res = await request(app).get('/api/posts/feed?sort=popular');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
  });

  it('authorized feed: limit is capped at 50', async () => {
    m('post').findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/posts/feed?limit=100000&offset=-5').set('x-test-user-id', 'viewer');
    expect(res.status).toBe(200);
    const call = m('post').findMany.mock.calls.find((c: any[]) => c[0]?.take !== undefined);
    expect(call[0].take).toBe(50);
    expect(call[0].skip).toBe(0);
  });
});

describe('GET /api/posts/:id', () => {
  const post = {
    id: 'p-1', type: 'blog', content: 'hi', authorId: 'u-pub', author: person('u-pub'), artistId: null, artist: null,
    comments: [{ id: 'c', authorId: 'u-x' }], reactions: [{ userId: 'u-x', emoji: '🔥' }], likes: [], savedBy: [],
    _count: { likes: 0, comments: 1, savedBy: 0, reposts: 0, reactions: 1 }, images: [], tags: [], genres: [], links: [], createdAt: NOW, updatedAt: NOW,
  };

  it('flag on → guest version', async () => {
    m('post').findFirst.mockResolvedValue(post);
    const res = await request(app).get('/api/posts/p-1');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body.comments).toEqual([]);
  });

  it('hidden author → 404', async () => {
    m('post').findFirst.mockResolvedValue({ ...post, author: person('u-np', { consent: false }) });
    const res = await request(app).get('/api/posts/p-1');
    expect(res.status).toBe(404);
  });

  it('flag off → still guest-safe (в dev /posts/:id уже публичный, как лента)', async () => {
    setGuestBrowsing(false);
    m('post').findFirst.mockResolvedValue(post);
    const res = await request(app).get('/api/posts/p-1');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
  });

  it('GET /api/posts/:id/comments → guest gets an empty page (comments only as a count)', async () => {
    const res = await request(app).get('/api/posts/p-1/comments');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null, guestHidden: true });
    expect(m('comment').findMany).not.toHaveBeenCalled();
  });
});

describe('orders / vacancies (guest)', () => {
  const orderRow = (status: string, extra: Record<string, unknown> = {}) => ({
    id: 'o-1', authorId: 'u-np', serviceId: 'srv-1', title: 'Нужен звукорежиссёр', titleNorm: 'x', budgetFrom: 1000, budgetTo: 5000,
    deadline: null, description: 'Подробности: 8 (916) 123-45-67, ivan@mail.ru', status, executorId: null, executorChosenAt: null,
    createdAt: NOW, updatedAt: NOW,
    author: person('u-np', { consent: false }), executor: null,
    service: { id: 'srv-1', name: 'Сведение', section: { id: 'sec-1', name: 'Продакшн' } },
    selectedCustomFilterValues: [],
    referenceFiles: [{ id: 'rf-1', url: '/uploads/orders/x.pdf', originalName: 'ТЗ.pdf' }],
    referenceLinks: [{ id: 'rl-1', url: 'https://disk.yandex.ru/x' }],
    responses: [{ id: 'resp-1', executorId: 'u-x', price: 100 }],
    posts: [{ id: 'post-o-1' }],
    _count: { responses: 1, referenceFiles: 1, referenceLinks: 1 },
    ...extra,
  });

  it('GET /api/orders/:id → 200, materials hidden, contacts masked, anonymized customer', async () => {
    m('order').findUnique.mockResolvedValue(orderRow('active'));
    const res = await request(app).get('/api/orders/o-1');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body.materialsCount).toBe(2);
    expect(res.body.responsesCount).toBe(1);
    expect(res.body.author).toMatchObject({ id: null, displayName: 'Заказчик на Moooza', isPublic: false });
    expect(res.body.description).not.toMatch(/916|ivan@/);
    expect(res.body.postId).toBe('post-o-1');
    expect(res.body.indexable).toBe(true);
  });

  it('draft → 404; no feed post → 404; archived → 200 + indexable=false', async () => {
    m('order').findUnique.mockResolvedValueOnce(orderRow('draft'));
    expect((await request(app).get('/api/orders/o-1')).status).toBe(404);
    m('order').findUnique.mockResolvedValueOnce(orderRow('active', { posts: [] }));
    expect((await request(app).get('/api/orders/o-1')).status).toBe(404);
    m('order').findUnique.mockResolvedValueOnce(orderRow('archived'));
    const res = await request(app).get('/api/orders/o-1');
    expect(res.status).toBe(200);
    expect(res.body.indexable).toBe(false);
  });

  const vacancyRow = (status: string, artistStatus = 'VERIFIED') => ({
    id: 'v-1', artistId: 'a-1', authorId: 'u-owner', professionId: 'prof-1', title: 'Ищем барабанщика', titleNorm: 'x',
    workFormat: 'offline', geography: 'city', employmentType: 'project', paymentType: 'rate', compensation: 5000,
    description: 'Пишите в tg @drum_owner', requireComment: false, requirePortfolio: true, status, createdAt: NOW, updatedAt: NOW,
    profession: { id: 'prof-1', name: 'Барабанщик' }, selectedCustomFilterValues: [],
    artist: { id: 'a-1', name: 'Группа', avatar: null, status: artistStatus, verificationCode: 'X' },
    referenceFiles: [{ id: 'f' }], referenceLinks: [], responses: [{ applicantId: 'u-x' }], posts: [{ id: 'post-v-1' }],
    _count: { responses: 1, referenceFiles: 1, referenceLinks: 0 },
  });

  it('GET /api/vacancies/:id → 200; draft → 404; REJECTED artist → 404', async () => {
    m('vacancy').findUnique.mockResolvedValueOnce(vacancyRow('active'));
    let res = await request(app).get('/api/vacancies/v-1');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body.artist.id).toBe('a-1');
    expect(res.body.description).toContain('[контакт — после входа]');
    expect(res.body.materialsCount).toBe(1);

    m('vacancy').findUnique.mockResolvedValueOnce(vacancyRow('draft'));
    res = await request(app).get('/api/vacancies/v-1');
    expect(res.status).toBe(404);

    m('vacancy').findUnique.mockResolvedValueOnce(vacancyRow('active', 'REJECTED'));
    res = await request(app).get('/api/vacancies/v-1');
    expect(res.status).toBe(404);
  });

  it('matches: guest → 401, non-owner → 403, owner → 200', async () => {
    expect((await request(app).get('/api/orders/o-1/matches')).status).toBe(401);
    expect((await request(app).get('/api/vacancies/v-1/matches')).status).toBe(401);

    m('order').findUnique.mockResolvedValue({ id: 'o-1', authorId: 'owner', serviceId: 'srv-1', selectedCustomFilterValues: [] });
    expect((await request(app).get('/api/orders/o-1/matches').set('x-test-user-id', 'stranger')).status).toBe(403);
    const ok = await request(app).get('/api/orders/o-1/matches').set('x-test-user-id', 'owner');
    expect(ok.status).toBe(200);

    m('vacancy').findUnique.mockResolvedValue({ id: 'v-1', authorId: 'owner', artistId: 'a-1', professionId: 'prof-1', selectedCustomFilterValues: [] });
    m('artist').findUnique.mockResolvedValue({ submittedById: 'owner' });
    m('userArtist').findFirst.mockResolvedValue(null);
    expect((await request(app).get('/api/vacancies/v-1/matches').set('x-test-user-id', 'stranger')).status).toBe(403);
  });
});

describe('GET /api/reviews/user/:userId (guest)', () => {
  it('target with consent → authors anonymized when no consent, text masked', async () => {
    m('user').findFirst.mockResolvedValue(person('u-pub'));
    m('review').findMany.mockResolvedValue([
      { id: 'rv-1', authorId: 'u-np', targetId: 'u-pub', rating: 9, text: 'Отлично! мой номер 89161234567', reply: null, type: 'deal', serviceId: null, dealId: 'd-1', createdAt: NOW, updatedAt: NOW, author: person('u-np', { consent: false }), service: null, deal: { id: 'd-1', createdAt: NOW, updatedAt: NOW, status: 'COMPLETED', customerId: 'u-np' } },
      { id: 'rv-2', authorId: 'u-pub2', targetId: 'u-pub', rating: 7, text: 'ok', reply: 'спасибо', type: 'connection', createdAt: NOW, updatedAt: NOW, author: person('u-pub2'), service: { id: 'srv-1', name: 'Сведение' }, deal: null },
    ]);
    const res = await request(app).get('/api/reviews/user/u-pub');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body[0].author).toMatchObject({ id: null, displayName: 'Пользователь Moooza' });
    expect(res.body[0].text).toContain('[контакт — после входа]');
    expect(res.body[1].author.id).toBe('u-pub2');
  });

  it('target without consent → 404', async () => {
    m('user').findFirst.mockResolvedValue(person('u-np', { consent: false }));
    expect((await request(app).get('/api/reviews/user/u-np')).status).toBe(404);
  });
});

describe('references (guest)', () => {
  it('GET /api/references/artists → whitelist (no verificationCode/ymData), contacts stripped', async () => {
    m('artist').findMany.mockResolvedValue([{
      id: 'a-1', name: 'Группа', status: 'VERIFIED', listeners: BigInt(5), socialLinks: DIRTY_SOCIAL_LINKS, description: 'тел 89161234567',
      verificationCode: 'MOOOZA-X', verificationProofUrl: 'p', rejectionReason: 'r', submittedById: 'u', ymData: { big: true },
      genres: [{ artistId: 'a-1', genreId: 'g-1', genre: { id: 'g-1', name: 'Рок' } }],
    }]);
    const res = await request(app).get('/api/references/artists');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    expect(res.body[0]).not.toHaveProperty('ymData');
    expect(res.body[0]).not.toHaveProperty('socialLinks');
    expect(res.body[0].listeners).toBe(5);
    expect(m('artist').findMany.mock.calls[0][0].take).toBeLessThanOrEqual(100);
  });

  it('authorized /references/artists also selects a whitelist (no verificationCode, no ymData)', async () => {
    m('artist').findMany.mockResolvedValue([]);
    await request(app).get('/api/references/artists').set('x-test-user-id', 'viewer');
    const select = m('artist').findMany.mock.calls[0][0].select;
    expect(select).toBeDefined();
    for (const k of ['verificationCode', 'verificationProofUrl', 'rejectionReason', 'submittedById', 'ymData']) {
      expect(select).not.toHaveProperty(k);
    }
  });

  it('GET /api/references/service-search → active only, consent filter, limit ≤ 50, whitelist', async () => {
    m('userService').count.mockResolvedValue(1);
    m('userService').findMany.mockResolvedValue([serviceRow('s-1', 'active')]);
    m('review').groupBy.mockResolvedValue([]);
    const res = await request(app).get('/api/references/service-search?limit=500');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    const args = m('userService').findMany.mock.calls[0][0];
    expect(args.take).toBe(50);
    expect(args.where.status).toBe('active');
    expect(JSON.stringify(args.where)).toContain('publicConsentAt');
    expect(res.body.results[0].description).toContain('[контакт — после входа]');
  });

  it('GET /api/references/search (people) → consent filter for guests', async () => {
    m('user').findMany.mockResolvedValue([{ ...person('u-pub'), city: 'Москва', fieldOfActivity: null, userProfessions: [], userServices: [] }]);
    m('user').count.mockResolvedValue(1);
    const res = await request(app).get('/api/references/search?limit=999');
    expect(res.status).toBe(200);
    expectNoForbiddenKeys(res.body);
    const args = m('user').findMany.mock.calls[0][0];
    expect(args.take).toBe(50);
    expect(JSON.stringify(args.where)).toContain('publicConsentAt');
  });
});

describe('site settings: guestBrowsingEnabled', () => {
  it('GET /api/site-settings exposes guestBrowsingEnabled (default false) and only allowlisted keys', async () => {
    m('siteSetting').findMany.mockResolvedValue([{ key: 'secretInternal', value: 'x' }]);
    const res = await request(app).get('/api/site-settings');
    expect(res.status).toBe(200);
    expect(res.body.guestBrowsingEnabled).toBe('false');
    expect(res.body).not.toHaveProperty('secretInternal');
  });

  it('PUT /api/admin/site-settings: allowlist + values true/false', async () => {
    m('user').findUnique.mockResolvedValue({ isAdmin: true });
    let res = await request(app).put('/api/admin/site-settings').set('x-test-user-id', 'admin').send({ foo: 'true' });
    expect(res.status).toBe(400);
    res = await request(app).put('/api/admin/site-settings').set('x-test-user-id', 'admin').send({ guestBrowsingEnabled: 'maybe' });
    expect(res.status).toBe(400);
    res = await request(app).put('/api/admin/site-settings').set('x-test-user-id', 'admin').send({ guestBrowsingEnabled: true });
    expect(res.status).toBe(200);
    expect(m('siteSetting').upsert).toHaveBeenCalledWith({
      where: { key: 'guestBrowsingEnabled' },
      update: { value: 'true' },
      create: { key: 'guestBrowsingEnabled', value: 'true' },
    });
  });

  it('flag off: previously public endpoints stay public (guest-safe), catalog (был authenticate) → 401', async () => {
    setGuestBrowsing(false);
    m('user').findFirst.mockResolvedValue(profileRow('u-pub'));
    const profile = await request(app).get('/api/users/u-pub');
    expect(profile.status).toBe(200);
    expectNoForbiddenKeys(profile.body);
    expect((await request(app).get('/api/users/catalog')).status).toBe(401);
  });
});

describe('misc headers / redirects', () => {
  it('/api/og/profile/:id → 301 to /profile/:id', async () => {
    const res = await request(app).get('/api/og/profile/u-1');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/profile/u-1');
  });

  it('X-Robots-Tag: noindex on API responses (incl. 404)', async () => {
    const res = await request(app).get('/api/users/missing');
    expect(res.status).toBe(404);
    expect(res.headers['x-robots-tag']).toBe('noindex');
  });

  it('guest JSON is revalidated via ETag (no public max-age)', async () => {
    m('user').findFirst.mockResolvedValue(profileRow('u-pub'));
    const first = await request(app).get('/api/users/u-pub');
    expect(first.headers.etag).toBeDefined();
    expect(first.headers['cache-control']).toBe('no-cache');
    const second = await request(app).get('/api/users/u-pub').set('If-None-Match', first.headers.etag);
    expect(second.status).toBe(304);
  });
});
