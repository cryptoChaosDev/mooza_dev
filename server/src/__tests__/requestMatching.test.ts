/**
 * «Ищу музыканта» — подбор исполнителей и анти-спам рассылки.
 * Prisma и notify замоканы — реальная БД не нужна.
 */

const mockNotify = jest.fn();
jest.mock('../utils/notify', () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
  isNotificationEnabled: jest.fn().mockResolvedValue(true),
}));

const mockPrisma = {
  user: { findMany: jest.fn(), count: jest.fn() },
  review: { groupBy: jest.fn() },
  orderMatchNotification: { groupBy: jest.fn(), findMany: jest.fn(), createMany: jest.fn() },
  $queryRaw: jest.fn(),
};
jest.mock('../index', () => ({ prisma: mockPrisma }));

import {
  candidateWhere, countMatchCandidates, notifyOrderMatches, rankCandidates, scoreCandidate, toPreviewUsers,
  DAILY_MATCH_NOTIFY_CAP, MATCH_LIMIT, type CandidateRow, type MatchCriteria,
} from '../lib/requestMatching';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const DRUMS = 'p:drums';
const AUTHOR = 'author-1';

const criteria = (over: Partial<MatchCriteria> = {}): MatchCriteria => ({
  professionIds: [DRUMS],
  genreIds: [],
  genreNames: [],
  cityName: null,
  isRemote: false,
  budgetTo: null,
  excludeUserId: AUTHOR,
  ...over,
});

function row(id: string, over: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id,
    firstName: `Имя-${id}`,
    lastName: 'Фамилия',
    nickname: null,
    avatar: null,
    city: null,
    genres: [],
    occupancyStatus: null,
    lastSeenAt: null,
    notificationPrefs: null,
    publicConsentAt: null,
    isBlocked: false,
    blockedUntil: null,
    isVerified: false,
    isPremium: false,
    userServices: [],
    userProfessions: [{ professionId: DRUMS, profession: { name: 'Барабанщик' } }],
    ...over,
  };
}

const service = (over: Partial<CandidateRow['userServices'][number]> = {}): CandidateRow['userServices'][number] => ({
  professionId: DRUMS,
  priceFrom: null,
  priceTo: null,
  profession: { name: 'Барабанщик' },
  genres: [],
  geographies: [],
  workFormats: [],
  selectedCustomFilterValues: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.user.count.mockResolvedValue(0);
  mockPrisma.review.groupBy.mockResolvedValue([]);
  mockPrisma.orderMatchNotification.groupBy.mockResolvedValue([]);
  mockPrisma.orderMatchNotification.findMany.mockResolvedValue([]);
  mockPrisma.orderMatchNotification.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.$queryRaw.mockResolvedValue([]);
});

describe('фильтры кандидатов', () => {
  it('профессия обязательна, автор и заблокированные исключены, «закрыт для предложений» — тоже', () => {
    const where: any = candidateWhere(criteria(), NOW);
    const json = JSON.stringify(where);
    expect(json).toContain('"isBlocked":false');
    expect(where.AND).toEqual(expect.arrayContaining([{ id: { not: AUTHOR } }]));
    expect(json).toContain('"professionId":{"in":["p:drums"]},"status":"active"');
    expect(json).toContain('"userProfessions"');
    // occupancyStatus NULL не должен выпадать из-за NOT IN
    expect(where.AND).toEqual(expect.arrayContaining([
      { OR: [{ occupancyStatus: null }, { occupancyStatus: { notIn: ['closed', 'busy'] } }] },
    ]));
  });

  it('countMatchCandidates: без профессии — 0 без запроса к БД', async () => {
    expect(await countMatchCandidates(criteria({ professionIds: [] }), NOW)).toBe(0);
    expect(mockPrisma.user.count).not.toHaveBeenCalled();
    mockPrisma.user.count.mockResolvedValue(7);
    expect(await countMatchCandidates(criteria(), NOW)).toBe(7);
  });
});

describe('ранжирование', () => {
  it('активная услуга важнее профессии в профиле', () => {
    const withService = scoreCandidate(row('a', { userServices: [service()] }), criteria(), { now: NOW });
    const profileOnly = scoreCandidate(row('b'), criteria(), { now: NOW });
    expect(withService.score).toBeGreaterThan(profileOnly.score);
    expect(withService.reasons).toContain('service');
  });

  it('жанр: по id, по фильтру «Жанр» услуги и по «Любой жанр»', () => {
    const c = criteria({ genreIds: ['g:metal'], genreNames: ['Метал'] });
    const byId = scoreCandidate(row('a', { userServices: [service({ genres: [{ id: 'g:metal', name: 'Метал' }] })] }), c, { now: NOW });
    const byFilter = scoreCandidate(row('b', {
      userServices: [service({ selectedCustomFilterValues: [{ value: 'Метал', filter: { name: 'Жанр' } }] })],
    }), c, { now: NOW });
    const anyGenre = scoreCandidate(row('c', {
      userServices: [service({ selectedCustomFilterValues: [{ value: 'Любой жанр', filter: { name: 'Жанр' } }] })],
    }), c, { now: NOW });
    const none = scoreCandidate(row('d', { userServices: [service()] }), c, { now: NOW });
    expect(byId.reasons).toContain('genre');
    expect(byFilter.reasons).toContain('genre');
    expect(anyGenre.reasons).toContain('genre_any');
    expect(byId.score).toBeGreaterThan(anyGenre.score);
    expect(anyGenre.score).toBeGreaterThan(none.score);
  });

  it('город: свой город > готов к удалёнке > другой город', () => {
    const c = criteria({ cityName: 'Самара' });
    const local = scoreCandidate(row('a', { city: 'Самара' }), c, { now: NOW });
    const remote = scoreCandidate(row('b', { city: 'Москва', userServices: [service({ workFormats: [{ name: 'Удалённо' }] })] }), c, { now: NOW });
    const other = scoreCandidate(row('c', { city: 'Москва', userServices: [service()] }), c, { now: NOW });
    expect(local.reasons).toContain('city');
    expect(remote.reasons).toContain('remote');
    expect(remote.score).toBeGreaterThan(other.score);
  });

  it('недавняя активность, статус «Открыт», рейтинг и быстрый ответ поднимают', () => {
    const base = scoreCandidate(row('a'), criteria(), { now: NOW }).score;
    const active = scoreCandidate(row('b', { lastSeenAt: new Date(NOW.getTime() - 86_400_000) }), criteria(), { now: NOW }).score;
    const stale = scoreCandidate(row('c', { lastSeenAt: new Date(NOW.getTime() - 40 * 86_400_000) }), criteria(), { now: NOW }).score;
    const open = scoreCandidate(row('d', { occupancyStatus: 'open' }), criteria(), { now: NOW }).score;
    const rated = scoreCandidate(row('e'), criteria(), { now: NOW, rating: { avg: 9, count: 4 } }).score;
    const fast = scoreCandidate(row('f'), criteria(), { now: NOW, avgResponseMinutes: 20 }).score;
    expect(active).toBeGreaterThan(base);
    expect(stale).toBe(base);
    expect(open).toBeGreaterThan(base);
    expect(rated).toBeGreaterThan(base);
    expect(fast).toBeGreaterThan(base);
  });
});

describe('рассылка order_match', () => {
  const params = { orderId: 'order-1', orderTitle: 'Барабанщик на концерт', authorId: AUTHOR, criteria: criteria(), summary: 'Самара', now: NOW };

  it('топ-10 из подходящих; автор, отключившие уведомления и упёршиеся в лимит — исключены', async () => {
    const pool = [
      row(AUTHOR, { userServices: [service()] }), // на всякий случай: автор не должен получить уведомление
      row('muted', { userServices: [service()], notificationPrefs: { orders: false } }),
      row('capped', { userServices: [service()] }),
      ...Array.from({ length: 12 }, (_, i) => row(`u${String(i).padStart(2, '0')}`, {
        userServices: i < 3 ? [service()] : [],
        lastSeenAt: i % 2 ? new Date(NOW.getTime() - 3600_000) : null,
      })),
    ];
    mockPrisma.user.findMany.mockResolvedValue(pool);
    mockPrisma.orderMatchNotification.groupBy.mockResolvedValue([{ userId: 'capped', _count: { _all: DAILY_MATCH_NOTIFY_CAP } }]);

    const { notified } = await notifyOrderMatches(params);
    const ids = notified.map((n) => n.id);
    expect(ids).toHaveLength(MATCH_LIMIT);
    expect(ids).not.toContain(AUTHOR);
    expect(ids).not.toContain('muted');
    expect(ids).not.toContain('capped');
    // У кого услуга — в начале списка
    expect(ids.slice(0, 3).sort()).toEqual(['u00', 'u01', 'u02']);

    expect(mockPrisma.orderMatchNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ orderId: 'order-1', userId: 'u00' })]),
      skipDuplicates: true,
    });
    expect(mockNotify).toHaveBeenCalledTimes(MATCH_LIMIT);
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'order_match',
      actorId: AUTHOR,
      link: '/orders/order-1',
      body: expect.stringContaining('«Барабанщик на концерт» — Самара'),
    }));
    // Суточный лимит считается за последние 24 часа
    const gb = mockPrisma.orderMatchNotification.groupBy.mock.calls[0][0];
    expect(gb.where.createdAt.gte.getTime()).toBe(NOW.getTime() - 86_400_000);
  });

  it('повторно по тому же заказу не уведомляет', async () => {
    mockPrisma.user.findMany.mockResolvedValue([row('u1'), row('u2')]);
    mockPrisma.orderMatchNotification.findMany.mockResolvedValue([{ userId: 'u1' }]);
    const { notified } = await notifyOrderMatches(params);
    expect(notified.map((n) => n.id)).toEqual(['u2']);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0].userId).toBe('u2');
  });

  it('нет подходящих — никаких записей и уведомлений', async () => {
    const { notified } = await notifyOrderMatches(params);
    expect(notified).toEqual([]);
    expect(mockPrisma.orderMatchNotification.createMany).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('время ответа считается только для лидеров и не ломает подбор при ошибке SQL', async () => {
    mockPrisma.user.findMany.mockResolvedValue([row('u1'), row('u2')]);
    mockPrisma.$queryRaw.mockRejectedValue(new Error('boom'));
    const ranked = await rankCandidates(criteria(), { now: NOW });
    expect(ranked.map((r) => r.id).sort()).toEqual(['u1', 'u2']);
  });

  it('превью для заказчика — только публичные профили', () => {
    const ranked = [
      { id: 'pub', score: 10, reasons: [], row: row('pub', { publicConsentAt: new Date('2026-01-01'), city: 'Самара' }) },
      { id: 'priv', score: 9, reasons: [], row: row('priv') },
      { id: 'blocked', score: 8, reasons: [], row: row('blocked', { publicConsentAt: new Date('2026-01-01'), isBlocked: true }) },
    ];
    const preview = toPreviewUsers(ranked);
    expect(preview).toEqual([{
      id: 'pub', displayName: 'Имя-pub Фамилия', avatar: null, isVerified: false, profession: 'Барабанщик', city: 'Самара',
    }]);
  });
});
