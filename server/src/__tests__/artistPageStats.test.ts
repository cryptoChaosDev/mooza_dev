/**
 * Статистика визитки артиста («ссылка в био»):
 *   - POST /api/artists/:id/track — без авторизации; view/click с белым списком
 *     целей; боты/превью-краулеры не считаются; REJECTED/нет артиста → 404;
 *     text/plain-тело (sendBeacon); лимит частоты по IP;
 *   - GET /api/artists/:id/stats — только подтверждённый админ/владелец;
 *     агрегация по дням (МСК) с нулями, итоги, переходы по целям;
 *   - отсутствие ПДн: ни IP, ни UA, ни userId не уходят в БД и в ответ.
 */

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// ── Prisma: явный мок нужных методов ────────────────────────────────────────

const mockPrisma: any = {
  $executeRaw: jest.fn(async () => 1),
  artist: { findUnique: jest.fn(async () => null) },
  userArtist: { findFirst: jest.fn(async () => null) },
  artistPageStat: { findMany: jest.fn(async () => []) },
};

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

/* eslint-disable @typescript-eslint/no-require-imports */
const stats = require('../lib/artistPageStats');
const { findGuestForbiddenKeys } = require('../lib/publicData');

function buildApp() {
  const app = express();
  // Как в проде (index.ts): IP клиента — из X-Forwarded-For за nginx. В тестах
  // так у каждого кейса свой IP и общий лимит не мешает.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/artists', require('../routes/artists').default);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => res.status(500).json({ error: String(err?.message ?? err) }));
  return app;
}
/* eslint-enable @typescript-eslint/no-require-imports */

const app = buildApp();

const ARTIST_ID = '11111111-2222-4333-8444-555555555555';
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
let ipSeq = 1;
const nextIp = () => `10.0.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

function track(body: unknown, opts: { ua?: string | null; ip?: string; id?: string; text?: boolean } = {}) {
  const r = request(app).post(`/api/artists/${opts.id ?? ARTIST_ID}/track`).set('X-Forwarded-For', opts.ip ?? nextIp());
  if (opts.ua !== null) r.set('User-Agent', opts.ua ?? BROWSER_UA);
  else r.set('User-Agent', '');
  if (opts.text) return r.set('Content-Type', 'text/plain;charset=UTF-8').send(JSON.stringify(body));
  return r.send(body as any);
}

/** Склеить tagged-template вызова $executeRaw обратно в SQL (для проверок). */
function rawCall(i = 0): { sql: string; values: unknown[] } {
  const [strings, ...values] = mockPrisma.$executeRaw.mock.calls[i];
  return { sql: Array.from(strings as string[]).join('?'), values };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.artist.findUnique.mockResolvedValue({ id: ARTIST_ID, status: 'VERIFIED' });
  mockPrisma.userArtist.findFirst.mockResolvedValue(null);
  mockPrisma.artistPageStat.findMany.mockResolvedValue([]);
});

// ── Чистые хелперы ───────────────────────────────────────────────────────────

describe('lib/artistPageStats — хелперы', () => {
  it('день — календарный по МСК (UTC+3)', () => {
    expect(stats.mskDayString(new Date('2026-10-09T20:59:59.999Z'))).toBe('2026-10-09');
    expect(stats.mskDayString(new Date('2026-10-09T21:00:00.000Z'))).toBe('2026-10-10');
    expect(stats.mskDayString(new Date('2026-12-31T22:30:00.000Z'))).toBe('2027-01-01');
  });

  it('shiftDay — календарно через границы месяца/года', () => {
    expect(stats.shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(stats.shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(stats.shiftDay('2026-10-09', -29)).toBe('2026-09-10');
  });

  it('боты, превью-краулеры, headless и пустой UA — не люди', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'TelegramBot (like TwitterBot)',
      'vkShare; +http://vk.com/dev/Share',
      'facebookexternalhit/1.1',
      'Mozilla/5.0 (compatible; bingpreview/2.0)',
      'Some-Crawler/1.0',
      'Baiduspider',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0 Safari/537.36',
      'curl/8.4.0',
      'python-requests/2.31',
      '',
      null,
    ]) {
      expect(stats.isBotUserAgent(ua)).toBe(true);
    }
    expect(stats.isBotUserAgent(BROWSER_UA)).toBe(false);
    expect(stats.isBotUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36 Telegram-Android/11.0')).toBe(false);
  });

  it('days: по умолчанию 30, максимум 90', () => {
    expect(stats.parseStatsDays(undefined)).toBe(30);
    expect(stats.parseStatsDays('abc')).toBe(30);
    expect(stats.parseStatsDays('0')).toBe(30);
    expect(stats.parseStatsDays('7')).toBe(7);
    expect(stats.parseStatsDays('1000')).toBe(90);
  });
});

// ── POST /:id/track ──────────────────────────────────────────────────────────

describe('POST /api/artists/:id/track', () => {
  it('view гостя → 204 и +1 просмотр за сегодняшний день (МСК), атомарный upsert', async () => {
    const res = await track({ event: 'view' });
    expect(res.status).toBe(204);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    const { sql, values } = rawCall();
    expect(sql).toContain('INSERT INTO "ArtistPageStat"');
    expect(sql).toContain('ON CONFLICT ("artistId", "day")');
    expect(sql).toContain('"views" = "ArtistPageStat"."views" + 1');
    expect(values).toEqual([ARTIST_ID, stats.mskDayString(new Date())]);
  });

  it('click по площадке → +1 к clicks[target]', async () => {
    const res = await track({ event: 'click', target: 'yandex_music' });
    expect(res.status).toBe(204);
    const { sql, values } = rawCall();
    expect(sql).toContain('jsonb_set');
    expect(values[0]).toBe(ARTIST_ID);
    expect(values[1]).toBe(stats.mskDayString(new Date()));
    expect(values.slice(2).every((v) => v === 'yandex_music')).toBe(true);
  });

  it('text/plain с JSON (navigator.sendBeacon) принимается', async () => {
    const res = await track({ event: 'click', target: 'tickets' }, { text: true });
    expect(res.status).toBe(204);
    expect(rawCall().values).toContain('tickets');
  });

  it('боты и превью-краулеры не считаются (204 без записи)', async () => {
    for (const ua of ['Mozilla/5.0 (compatible; YandexBot/3.0)', 'TelegramBot (like TwitterBot)', 'vkShare; +http://vk.com/dev/Share']) {
      const res = await track({ event: 'view' }, { ua });
      expect(res.status).toBe(204);
    }
    const noUa = await track({ event: 'view' }, { ua: null });
    expect(noUa.status).toBe(204);
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    expect(mockPrisma.artist.findUnique).not.toHaveBeenCalled();
  });

  it('некорректное событие / цель вне белого списка → 400 без записи', async () => {
    expect((await track({ event: 'like' })).status).toBe(400);
    expect((await track({})).status).toBe(400);
    expect((await track('not json', { text: true })).status).toBe(400);
    expect((await track({ event: 'click' })).status).toBe(400);
    expect((await track({ event: 'click', target: 'evil_key' })).status).toBe(400);
    expect((await track({ event: 'click', target: '__proto__' })).status).toBe(400);
    expect((await track({ event: 'click', target: { $ne: 1 } })).status).toBe(400);
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('нет артиста / REJECTED → 404 без записи', async () => {
    mockPrisma.artist.findUnique.mockResolvedValueOnce(null);
    expect((await track({ event: 'view' })).status).toBe(404);
    mockPrisma.artist.findUnique.mockResolvedValueOnce({ id: ARTIST_ID, status: 'REJECTED' });
    expect((await track({ event: 'view' })).status).toBe(404);
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('DRAFT/PENDING (видны гостю с бейджем) — считаются', async () => {
    mockPrisma.artist.findUnique.mockResolvedValueOnce({ id: ARTIST_ID, status: 'PENDING' });
    expect((await track({ event: 'view' })).status).toBe(204);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('без ПДн: ни IP, ни User-Agent, ни userId не уходят в БД', async () => {
    const ip = '203.0.113.77';
    await request(app)
      .post(`/api/artists/${ARTIST_ID}/track`)
      .set('X-Forwarded-For', ip)
      .set('User-Agent', BROWSER_UA)
      .set('x-test-user-id', 'u-viewer')
      .send({ event: 'click', target: 'spotify' });
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    const { sql, values } = rawCall();
    const dump = JSON.stringify({ sql, values });
    expect(dump).not.toContain(ip);
    expect(dump).not.toContain('iPhone');
    expect(dump).not.toContain('u-viewer');
    expect(values.every((v) => typeof v === 'string')).toBe(true);
    expect(values).toEqual(expect.arrayContaining([ARTIST_ID, 'spotify']));
  });

  it('лимит частоты по IP: после 60 событий в минуту — 429, запись не идёт', async () => {
    const ip = '198.51.100.9';
    const codes: number[] = [];
    for (let i = 0; i < 62; i++) codes.push((await track({ event: 'view' }, { ip })).status);
    expect(codes.slice(0, 60).every((c) => c === 204)).toBe(true);
    expect(codes.slice(60)).toEqual([429, 429]);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(60);
    // Другой IP — свой счётчик.
    expect((await track({ event: 'view' }, { ip: '198.51.100.10' })).status).toBe(204);
  });
});

// ── GET /:id/stats ───────────────────────────────────────────────────────────

describe('GET /api/artists/:id/stats', () => {
  const asAdmin = () => mockPrisma.userArtist.findFirst.mockResolvedValue({ id: 'ua-1', isOwner: false });

  it('гость → 401, не админ → 403 (статистика не читается)', async () => {
    expect((await request(app).get(`/api/artists/${ARTIST_ID}/stats`)).status).toBe(401);
    const res = await request(app).get(`/api/artists/${ARTIST_ID}/stats`).set('x-test-user-id', 'u-stranger');
    expect(res.status).toBe(403);
    expect(mockPrisma.artistPageStat.findMany).not.toHaveBeenCalled();
  });

  it('права — только подтверждённый (ACCEPTED) админ или владелец', async () => {
    asAdmin();
    const res = await request(app).get(`/api/artists/${ARTIST_ID}/stats`).set('x-test-user-id', 'u-admin');
    expect(res.status).toBe(200);
    const where = mockPrisma.userArtist.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ artistId: ARTIST_ID, userId: 'u-admin', inviteStatus: 'ACCEPTED' });
    expect(where.OR).toEqual([{ isAdmin: true }, { isOwner: true }]);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('агрегация по дням: итоги, переходы по целям, ряд с нулями за 30 дней', async () => {
    asAdmin();
    const today = stats.mskDayString(new Date());
    const d = (delta: number) => new Date(`${stats.shiftDay(today, delta)}T00:00:00.000Z`);
    mockPrisma.artistPageStat.findMany.mockResolvedValue([
      { day: d(-29), views: 4, clicks: { yandex_music: 2 } },
      { day: d(-3), views: 10, clicks: { yandex_music: 3, vk_music: 1, tickets: 2 } },
      { day: d(0), views: 5, clicks: { spotify: 1, unknown_legacy: 50, release: 'x' } },
      // Старше окна — не учитывается (защита, даже если БД вернула).
      { day: d(-30), views: 999, clicks: { yandex_music: 999 } },
    ]);
    const res = await request(app).get(`/api/artists/${ARTIST_ID}/stats?days=30`).set('x-test-user-id', 'u-admin');
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body.days).toBe(30);
    expect(body.to).toBe(today);
    expect(body.from).toBe(stats.shiftDay(today, -29));
    expect(body.series).toHaveLength(30);
    expect(body.series[0]).toEqual({ date: body.from, views: 4, clicks: 2 });
    expect(body.series[26]).toEqual({ date: stats.shiftDay(today, -3), views: 10, clicks: 6 });
    expect(body.series[29]).toEqual({ date: today, views: 5, clicks: 1 });
    expect(body.series[1]).toEqual({ date: stats.shiftDay(today, -28), views: 0, clicks: 0 });
    expect(body.views).toBe(19);
    expect(body.clicks).toBe(9);
    expect(body.clicksByTarget).toEqual([
      { target: 'yandex_music', count: 5 },
      { target: 'tickets', count: 2 },
      { target: 'vk_music', count: 1 },
      { target: 'spotify', count: 1 },
    ].sort((a, b) => b.count - a.count || stats.TRACK_TARGETS.indexOf(a.target) - stats.TRACK_TARGETS.indexOf(b.target)));
    // Запрос в БД — по артисту и с нижней границей окна.
    const args = mockPrisma.artistPageStat.findMany.mock.calls[0][0];
    expect(args.where.artistId).toBe(ARTIST_ID);
    expect(args.where.day.gte.toISOString().slice(0, 10)).toBe(body.from);
  });

  it('days ограничен 90; по умолчанию 30', async () => {
    asAdmin();
    const r1 = await request(app).get(`/api/artists/${ARTIST_ID}/stats?days=365`).set('x-test-user-id', 'u-admin');
    expect(r1.body.series).toHaveLength(90);
    const r2 = await request(app).get(`/api/artists/${ARTIST_ID}/stats`).set('x-test-user-id', 'u-admin');
    expect(r2.body.series).toHaveLength(30);
  });

  it('ответ — только агрегаты, без ПДн', async () => {
    asAdmin();
    mockPrisma.artistPageStat.findMany.mockResolvedValue([
      // «Грязная» строка: даже если бы в БД оказались лишние поля — наружу не идут.
      { day: new Date(`${stats.mskDayString(new Date())}T00:00:00.000Z`), views: 1, clicks: { vk: 1 }, artistId: ARTIST_ID, ip: '1.2.3.4', userAgent: 'x', userId: 'u-1', email: 'a@b.c' },
    ]);
    const res = await request(app).get(`/api/artists/${ARTIST_ID}/stats`).set('x-test-user-id', 'u-admin');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['clicks', 'clicksByTarget', 'days', 'from', 'series', 'to', 'views']);
    for (const p of res.body.series) expect(Object.keys(p).sort()).toEqual(['clicks', 'date', 'views']);
    for (const c of res.body.clicksByTarget) expect(Object.keys(c).sort()).toEqual(['count', 'target']);
    expect(findGuestForbiddenKeys(res.body)).toEqual([]);
    const dump = JSON.stringify(res.body);
    for (const leak of ['1.2.3.4', 'userAgent', 'userId', 'a@b.c', '"ip"']) expect(dump).not.toContain(leak);
    // select — только счётчики.
    expect(mockPrisma.artistPageStat.findMany.mock.calls[0][0].select).toEqual({ day: true, views: true, clicks: true });
  });
});
