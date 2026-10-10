/**
 * «Сцена» (lib/sceneConcerts + routes/scene): периоды по Москве, дубли из разных
 * источников, сопоставление артистов, концерты из ЯМ, афиша Qtickets, push
 * подписчикам, добавление/удаление концерта админом артиста.
 */
import express from 'express';
import request from 'supertest';

const mockPrisma: any = {
  concert: {
    findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    deleteMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(),
  },
  artist: { findMany: jest.fn(), findUnique: jest.fn() },
  artistFollower: { findMany: jest.fn() },
  city: { findMany: jest.fn(), findFirst: jest.fn() },
};
jest.mock('../index', () => ({ prisma: mockPrisma }));
const mockNotify = jest.fn();
jest.mock('../utils/notify', () => ({ notify: (...a: unknown[]) => mockNotify(...a) }));
jest.mock('../utils/telegram', () => ({ tgLog: jest.fn() }));
jest.mock('../utils/logger', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const mockAccess = jest.fn();
jest.mock('../lib/artistAccess', () => ({ getArtistAccess: (...a: unknown[]) => mockAccess(...a) }));
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    if (!req.headers['x-user']) return res.status(401).json({ error: 'auth' });
    req.userId = req.headers['x-user'];
    next();
  },
  optionalAuthenticate: (req: any, _res: any, next: any) => { if (req.headers['x-user']) req.userId = req.headers['x-user']; next(); },
}));
jest.mock('../middleware/rateLimiter', () => ({ guestReadLimiter: (_req: any, _res: any, next: any) => next() }));

import {
  periodRange, dedupeConcerts, matchArtist, normName, verifiedArtistNameIndex, syncYmConcerts,
  saveQticketsCity, notifyNewConcerts, citySlug, ymConcertStart, formatConcertLocal, localIso,
} from '../lib/sceneConcerts';
import { isoOffsetMinutes } from '../lib/qtickets';
import sceneRoutes from '../routes/scene';

const app = express();
app.use(express.json());
app.use('/api/scene', sceneRoutes);

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.concert.findUnique.mockResolvedValue(null);
  mockPrisma.concert.findFirst.mockResolvedValue(null);
  mockPrisma.concert.create.mockResolvedValue({ id: 'new' });
  mockPrisma.concert.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.concert.findMany.mockResolvedValue([]);
  mockPrisma.concert.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.concert.count.mockResolvedValue(0);
  mockPrisma.concert.groupBy.mockResolvedValue([]);
  mockPrisma.city.findMany.mockResolvedValue([{ name: 'Самара' }, { name: 'Орёл' }, { name: 'Санкт-Петербург' }]);
  mockPrisma.artistFollower.findMany.mockResolvedValue([]);
});

describe('periodRange (по Москве)', () => {
  const at = (iso: string) => new Date(iso);
  it('сегодня — до полуночи МСК, с запасом 3 ч на идущие концерты', () => {
    const r = periodRange('today', at('2026-10-14T12:00:00Z')); // ср, 15:00 МСК
    expect(r.from.toISOString()).toBe('2026-10-14T09:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-14T21:00:00.000Z');
  });
  it('выходные из среды — суббота и воскресенье', () => {
    const r = periodRange('weekend', at('2026-10-14T12:00:00Z'));
    expect(r.from.toISOString()).toBe('2026-10-16T21:00:00.000Z'); // сб 00:00 МСК
    expect(r.to.toISOString()).toBe('2026-10-18T21:00:00.000Z'); // пн 00:00 МСК
  });
  it('в субботу — с текущего момента до конца воскресенья, в воскресенье — до конца дня', () => {
    expect(periodRange('weekend', at('2026-10-17T10:00:00Z')).to.toISOString()).toBe('2026-10-18T21:00:00.000Z');
    expect(periodRange('weekend', at('2026-10-18T10:00:00Z')).to.toISOString()).toBe('2026-10-18T21:00:00.000Z');
  });
});

describe('дубли и сопоставление', () => {
  it('один концерт артиста из ЯМ и Qtickets — остаётся Qtickets', () => {
    const d = new Date('2026-11-13T16:00:00Z');
    const rows = [
      { id: 'ym', artistId: 'a1', cityKey: 'самара', startsAt: d, source: 'YANDEX_MUSIC' },
      { id: 'x', artistId: null, cityKey: 'самара', startsAt: d, source: 'QTICKETS' },
      { id: 'qt', artistId: 'a1', cityKey: 'самара', startsAt: new Date('2026-11-13T17:00:00Z'), source: 'QTICKETS' },
    ];
    expect(dedupeConcerts(rows).map((r) => r.id)).toEqual(['qt', 'x']);
  });

  it('артист по точному названию или части до « | », « - »; неоднозначные и короткие — нет', async () => {
    mockPrisma.artist.findMany.mockResolvedValue([
      { id: 'a1', name: 'Полумягкие' }, { id: 'a2', name: 'Kursha' },
      { id: 'd1', name: 'Дубль' }, { id: 'd2', name: 'дубль' }, { id: 's', name: 'Ок' },
    ]);
    const idx = await verifiedArtistNameIndex();
    expect(matchArtist('Полумягкие | 10 октября Самара', idx)).toBe('a1');
    expect(matchArtist('«Kursha» - большой концерт', idx)).toBe('a2');
    expect(matchArtist('KURSHA', idx)).toBe('a2');
    expect(matchArtist('Дубль', idx)).toBeNull();
    expect(matchArtist('Ок', idx)).toBeNull();
    expect(matchArtist('Kursha и друзья', idx)).toBeNull();
    expect(normName('Ёлка «Live»')).toBe('елка live');
  });

  it('слаг города и дата без времени из ЯМ', () => {
    expect(citySlug('Санкт-Петербург')).toBe('sankt-peterburg');
    expect(citySlug('Орёл')).toBe('orel');
    expect(ymConcertStart({ date: '2026-11-13' })).toEqual({ startsAt: new Date('2026-11-13T09:00:00.000Z'), hasTime: false, utcOffsetMin: null });
    expect(ymConcertStart({ datetime: '2026-11-13T19:00:00+04:00' })).toEqual(expect.objectContaining({ hasTime: true, utcOffsetMin: 240 }));
    expect(ymConcertStart({})).toBeNull();
  });
});

describe('syncYmConcerts', () => {
  it('создаёт новые, обновляет известные, удаляет пропавшие будущие', async () => {
    mockPrisma.concert.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'old' });
    const n = await syncYmConcerts({ id: 'a1', name: 'Kursha' }, [
      { datetime: '2026-11-13T19:00:00+04:00', city: 'Самара', place: 'Клуб', afishaUrl: 'https://afisha.yandex.ru/x' },
      { date: '2026-12-01', city: 'Орёл', title: 'Тур' },
      { city: 'Без даты' },
    ], new Date('2026-10-10T00:00:00Z'));
    expect(n).toBe(1);
    expect(mockPrisma.concert.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      source: 'YANDEX_MUSIC', artistId: 'a1', title: 'Kursha', cityName: 'Самара', cityKey: 'самара', venue: 'Клуб',
      ticketUrl: 'https://afisha.yandex.ru/x', hasTime: true,
    }) });
    expect(mockPrisma.concert.update).toHaveBeenCalledWith({ where: { id: 'old' }, data: expect.objectContaining({ title: 'Тур', hasTime: false }) });
    const del = mockPrisma.concert.deleteMany.mock.calls[0][0].where;
    expect(del).toEqual(expect.objectContaining({ source: 'YANDEX_MUSIC', artistId: 'a1' }));
    expect(del.externalId.notIn).toHaveLength(2);
  });
});

describe('saveQticketsCity', () => {
  const item = (id: string, title: string) => ({
    externalId: id, url: `https://samara.qtickets.events/${id}-x`, title, type: 'Концерт',
    startsAt: new Date('2026-11-01T15:00:00Z'), utcOffsetMin: 240, venue: 'Клуб', imageUrl: null, priceFrom: 500,
  });
  const idx = new Map([['полумягкие', 'a1']]);

  it('полный обход: сохраняет, сопоставляет артиста и снимает пропавшие события города', async () => {
    const r = await saveQticketsCity('Самара', [item('1', 'Полумягкие | тур'), item('2', 'Чужой концерт')], true, idx);
    expect(r).toEqual(expect.objectContaining({ created: 2, matched: 1 }));
    expect(mockPrisma.concert.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ source: 'QTICKETS', externalId: '1', artistId: 'a1', cityKey: 'самара', utcOffsetMin: 240 }));
    expect(mockPrisma.concert.create.mock.calls[1][0].data.artistId).toBeNull();
    expect(mockPrisma.concert.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({
      source: 'QTICKETS', cityKey: 'самара', externalId: { notIn: ['1', '2'] },
    }) });
  });

  it('обход оборвался — ничего не удаляем', async () => {
    await saveQticketsCity('Самара', [item('1', 'X')], false, idx);
    expect(mockPrisma.concert.deleteMany).not.toHaveBeenCalled();
  });
});

describe('notifyNewConcerts', () => {
  const concert = (id: string) => ({
    id, artistId: 'a1', startsAt: new Date('2026-11-13T16:00:00Z'), hasTime: true,
    cityName: 'Самара', cityKey: 'самара', venue: 'Клуб', artist: { name: 'Kursha' },
  });

  it('push подписчикам из города артиста — один раз на концерт', async () => {
    mockPrisma.concert.findMany.mockResolvedValue([concert('c1')]);
    mockPrisma.artistFollower.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    const sent = await notifyNewConcerts(new Date('2026-10-10T00:00:00Z'));
    expect(sent).toBe(2);
    expect(mockPrisma.artistFollower.findMany).toHaveBeenCalledWith({
      where: { artistId: 'a1', user: { cityNorm: 'самара' } }, select: { userId: true },
    });
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', type: 'scene_concert', title: 'Kursha: концерт в Самара', link: '/artist/a1',
    }));
  });

  it('концерт уже захвачен параллельным прогоном или есть уведомлённый двойник — без push', async () => {
    mockPrisma.concert.findMany.mockResolvedValue([concert('c1'), concert('c2')]);
    mockPrisma.concert.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    mockPrisma.concert.count.mockResolvedValue(1); // двойник из другого источника уже уведомлён
    mockPrisma.artistFollower.findMany.mockResolvedValue([{ userId: 'u1' }]);
    expect(await notifyNewConcerts(new Date('2026-10-10T00:00:00Z'))).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('routes /api/scene', () => {
  const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const body = { artistId: 'a1', date: future, time: '19:00', city: 'самара', venue: 'Клуб', ticketUrl: 'https://t.me/x' };

  it('неизвестный город — 404', async () => {
    const res = await request(app).get('/api/scene/concerts?city=atlantida');
    expect(res.status).toBe(404);
  });

  it('добавить концерт — только админ артиста, город из каталога, площадка обязательна', async () => {
    mockAccess.mockResolvedValue({ isAdmin: false });
    expect((await request(app).post('/api/scene/concerts').set('x-user', 'u1').send(body)).status).toBe(403);

    mockAccess.mockResolvedValue({ isAdmin: true });
    mockPrisma.artist.findUnique.mockResolvedValue({ id: 'a1', name: 'Kursha' });
    mockPrisma.city.findFirst.mockResolvedValue(null);
    expect((await request(app).post('/api/scene/concerts').set('x-user', 'u1').send(body)).status).toBe(400);

    mockPrisma.city.findFirst.mockResolvedValue({ name: 'Самара' });
    expect((await request(app).post('/api/scene/concerts').set('x-user', 'u1').send({ ...body, venue: '' })).status).toBe(400);
    expect((await request(app).post('/api/scene/concerts').set('x-user', 'u1').send({ ...body, ticketUrl: 'javascript:alert(1)' })).status).toBe(400);

    expect((await request(app).post('/api/scene/concerts').set('x-user', 'u1').send({ ...body, date: '2030-02-30' })).status).toBe(400);

    // Пояс города известен по афише (Самара, +4): 19:00 местного = 15:00 UTC.
    mockPrisma.concert.findFirst.mockResolvedValue({ utcOffsetMin: 240 });
    const ok = await request(app).post('/api/scene/concerts').set('x-user', 'u1').send(body);
    expect(ok.status).toBe(201);
    const data = mockPrisma.concert.create.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({ source: 'MANUAL', artistId: 'a1', cityName: 'Самара', cityKey: 'самара', createdById: 'u1', utcOffsetMin: 240 }));
    expect(data.startsAt.toISOString()).toBe(`${future}T15:00:00.000Z`);
  });

  it('удалить можно только добавленный вручную', async () => {
    mockPrisma.concert.findUnique.mockResolvedValue({ id: 'c1', source: 'QTICKETS', artistId: 'a1' });
    expect((await request(app).delete('/api/scene/concerts/c1').set('x-user', 'u1')).status).toBe(400);
    mockPrisma.concert.findUnique.mockResolvedValue({ id: 'c1', source: 'MANUAL', artistId: 'a1' });
    mockAccess.mockResolvedValue({ isAdmin: true });
    expect((await request(app).delete('/api/scene/concerts/c1').set('x-user', 'u1')).status).toBe(200);
    expect(mockPrisma.concert.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});

describe('местное время концерта', () => {
  it('смещение пояса из ISO-строки', () => {
    expect(isoOffsetMinutes('2026-11-01T19:00:00+04:00')).toBe(240);
    expect(isoOffsetMinutes('2026-11-01T19:00:00-03:30')).toBe(-210);
    expect(isoOffsetMinutes('2026-11-01T19:00:00Z')).toBe(0);
    expect(isoOffsetMinutes('2026-11-01')).toBeNull();
  });
  it('формат и ISO по поясу города (без пояса — Москва)', () => {
    const at = new Date('2026-11-13T15:00:00Z');
    expect(formatConcertLocal(at, true, 240)).toBe('13 ноября, 19:00');
    expect(formatConcertLocal(at, true, null)).toBe('13 ноября, 18:00');
    expect(formatConcertLocal(at, false, 240)).toBe('13 ноября');
    expect(localIso(at, 240)).toBe('2026-11-13T19:00:00+04:00');
    expect(localIso(at, null)).toBe('2026-11-13T18:00:00+03:00');
  });
});
