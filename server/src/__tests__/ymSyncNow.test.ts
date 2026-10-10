/**
 * Разовый синк Яндекс Музыки (syncArtistNow): сразу после создания карточки /
 * привязки ссылки / верификации — в т.ч. для непроверенной карточки. Ночной
 * обход (без allowUnverified) непроверенных по-прежнему не трогает.
 */
import { EventEmitter } from 'events';

// ── Фейковое API Яндекс Музыки (https.get) ──────────────────────────────────
const ymResponses: Record<string, unknown> = {};
let ymDelayMs = 0;
function fakeGet(opts: { path: string }, cb: (res: any) => void) {
  const req: any = new EventEmitter();
  req.destroy = () => {};
  setTimeout(() => {
    const key = Object.keys(ymResponses).find((p) => opts.path.startsWith(p));
    const res: any = new EventEmitter();
    res.statusCode = key ? 200 : 404;
    res.setEncoding = () => {};
    res.resume = () => {};
    cb(res);
    if (key) res.emit('data', JSON.stringify(ymResponses[key]));
    res.emit('end');
  }, ymDelayMs);
  return req;
}
jest.mock('https', () => ({ __esModule: true, default: { get: (o: any, cb: any) => fakeGet(o, cb) }, get: (o: any, cb: any) => fakeGet(o, cb) }));

// ── Prisma ────────────────────────────────────────────────────────────────────
const artistRow = {
  id: 'a1', name: 'Kursha', ymId: '777', status: 'DRAFT',
  socialLinks: { yandex_music: 'https://music.yandex.ru/artist/777' }, bandLink: null,
  description: null, ymData: null, updatedAt: new Date('2026-10-10T10:00:00Z'),
};
const mockPrisma = {
  artist: {
    findUnique: jest.fn(async () => ({ ...artistRow })),
    updateMany: jest.fn(async () => ({ count: 1 })),
  },
  artistListenersSnapshot: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
  dismissedMediaItem: { findMany: jest.fn(async () => []) },
  release: { findMany: jest.fn(async () => []), createMany: jest.fn(async () => ({ count: 1 })), update: jest.fn() },
  clip: { findMany: jest.fn(async () => []), createMany: jest.fn(async () => ({ count: 1 })) },
  userArtist: { findMany: jest.fn(async () => [{ userId: 'owner1' }]) },
};
jest.mock('../index', () => ({ prisma: mockPrisma }));
const mockNotify = jest.fn();
jest.mock('../utils/notify', () => ({ notify: (...a: unknown[]) => mockNotify(...a) }));
jest.mock('../utils/telegram', () => ({ tgLog: jest.fn() }));
const mockWarn = jest.fn();
jest.mock('../utils/logger', () => ({ __esModule: true, default: { info: jest.fn(), warn: (...a: unknown[]) => mockWarn(...a), error: jest.fn() } }));

import { syncArtistFromYandexMusic, syncArtistNow } from '../utils/yandexMusicSync';

beforeEach(() => {
  jest.clearAllMocks();
  ymDelayMs = 0;
  artistRow.status = 'DRAFT';
  artistRow.ymId = '777';
  for (const k of Object.keys(ymResponses)) delete ymResponses[k];
  ymResponses['/artists/777/brief-info'] = {
    result: {
      artist: { id: 777, name: 'Kursha', description: { text: 'Группа из Самары' } },
      stats: { lastMonthListeners: 1234 },
      albums: [],
      videos: [],
    },
  };
  ymResponses['/artists/777/direct-albums'] = {
    result: { albums: [{ id: 555, title: 'Первый альбом', releaseDate: '2025-05-01T00:00:00+03:00' }], pager: { page: 0, perPage: 100, total: 1 } },
  };
});

describe('syncArtistFromYandexMusic — статус карточки', () => {
  it('ночной режим не трогает непроверенную карточку', async () => {
    const res = await syncArtistFromYandexMusic({ id: 'a1', name: 'Kursha', ymId: '777' });
    expect(res).toBeNull();
    expect(mockPrisma.artist.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.release.createMany).not.toHaveBeenCalled();
  });

  it('разовый режим синхронизирует и непроверенную: слушатели, описание, релизы', async () => {
    const res = await syncArtistFromYandexMusic({ id: 'a1', name: 'Kursha', ymId: '777' }, { allowUnverified: true });
    expect(res).toEqual(expect.objectContaining({ listeners: 1234, newReleases: 1 }));
    const patch = (mockPrisma.artist.updateMany.mock.calls[0] as any)[0].data;
    expect(Number(patch.listeners)).toBe(1234);
    expect(patch.description).toBe('Группа из Самары');
    expect(mockPrisma.release.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ externalId: '555', title: 'Первый альбом', url: 'https://music.yandex.ru/album/555' })],
      skipDuplicates: true,
    }));
    // Владельцу — уведомление об импорте (клиент по нему обновляет карточку).
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner1', type: 'release_import' }));
  });
});

describe('syncArtistNow', () => {
  it('синхронизирует карточку со ссылкой на Яндекс Музыку', async () => {
    await syncArtistNow('a1', 'created');
    expect(mockPrisma.artist.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.release.createMany).toHaveBeenCalledTimes(1);
  });

  it('без ссылки на Яндекс Музыку ничего не делает', async () => {
    artistRow.ymId = null as any;
    await syncArtistNow('a1', 'created');
    expect(mockPrisma.artist.updateMany).not.toHaveBeenCalled();
  });

  it('повторный вызов, пока идёт первый, пропускается', async () => {
    ymDelayMs = 30;
    await Promise.all([syncArtistNow('a1', 'created'), syncArtistNow('a1', 'linked')]);
    expect(mockPrisma.artist.updateMany).toHaveBeenCalledTimes(1);
    // После завершения — снова можно.
    await syncArtistNow('a1', 'verified');
    expect(mockPrisma.artist.updateMany).toHaveBeenCalledTimes(2);
  });

  it('сбой не пробрасывается — предупреждение в лог', async () => {
    mockPrisma.artist.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(syncArtistNow('a1', 'created')).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });
});
