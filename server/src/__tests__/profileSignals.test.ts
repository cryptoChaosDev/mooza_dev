/**
 * Сигналы профиля и каталога:
 *   - «Подтверждённый опыт» (lib/profileSignals): только подтверждённые участия,
 *     без REJECTED-артистов, фиксированное число запросов (без N+1), кэш 10 минут;
 *   - аудиодемо карточки каталога: только аудиофайл портфолио на /uploads/;
 *   - «Отвечает быстро» (lib/responseBadge): пороги, минимум диалогов, медиана,
 *     суточный пересчёт пишет только изменения.
 */

const mockModels: Record<string, Record<string, jest.Mock>> = {};
function mockDefault(method: string) {
  if (method === 'findMany' || method === 'groupBy') return [];
  if (method === 'count') return 0;
  if (method === 'updateMany') return { count: 0 };
  return null;
}
const mockQueryRaw = jest.fn(async (..._args: any[]) => [] as any[]);
const mockPrisma: any = new Proxy({}, {
  get(_t, model: string) {
    if (model === 'then') return undefined;
    if (model === '$queryRaw') return mockQueryRaw;
    if (!mockModels[model]) {
      const fns: Record<string, jest.Mock> = {};
      mockModels[model] = new Proxy(fns, {
        get(target, method: string) {
          if (!target[method]) target[method] = jest.fn(async () => mockDefault(method));
          return target[method];
        },
      });
    }
    return mockModels[model];
  },
});
jest.mock('../index', () => ({ prisma: mockPrisma }));

import {
  buildCreditsSummary, getCreditsSummary, clearCreditsCache, CREDITS_TTL_MS,
  pickPortfolioDemo, loadCatalogExtras, isUploadsPath,
} from '../lib/profileSignals';
import {
  computeResponseStats, badgeFor, median, effectiveResponse, recomputeResponseBadges,
  RESPONSE_MIN_DIALOGS, RESPONSE_BADGE_MAX_AGE_MS,
} from '../lib/responseBadge';
import { toPublicCredits, toPublicCatalogSignals, findGuestForbiddenKeys } from '../lib/publicData';

const m = (model: string) => mockPrisma[model];

beforeEach(() => {
  for (const fns of Object.values(mockModels)) {
    for (const [method, fn] of Object.entries(fns)) {
      fn.mockReset();
      fn.mockImplementation(async () => mockDefault(method));
    }
  }
  mockQueryRaw.mockReset();
  mockQueryRaw.mockImplementation(async () => []);
  clearCreditsCache();
});

// ─────────────────────────────────────────────────────────────────────────────

const artist = (id: string, listeners: number, status = 'VERIFIED') => ({
  id, slug: `slug-${id}`, name: `Артист ${id}`, avatar: null, listeners: BigInt(listeners), status,
});
const relRow = (id: string, a: any, opts: { status?: string; date?: string | null; roles?: string[] } = {}) => ({
  confirmStatus: opts.status ?? 'ACCEPTED',
  roles: (opts.roles ?? []).map((name) => ({ role: { name } })),
  release: {
    id, title: `Релиз ${id}`, coverUrl: `https://avatars.yandex.net/${id}.jpg`,
    releaseDate: opts.date === undefined ? new Date('2025-01-01T12:00:00Z') : opts.date ? new Date(opts.date) : null,
    createdAt: new Date('2025-06-01T00:00:00Z'), artist: a,
  },
});
const clipRow = (id: string, a: any, opts: { status?: string; roles?: string[] } = {}) => ({
  confirmStatus: opts.status ?? 'ACCEPTED',
  roles: (opts.roles ?? []).map((name) => ({ role: { name } })),
  clip: { id, title: `Клип ${id}`, coverUrl: null, createdAt: new Date('2025-03-01T00:00:00Z'), artist: a },
});

describe('«Подтверждённый опыт» — агрегат кредитов', () => {
  it('only confirmed participations and non-REJECTED artists; unique artists, listeners sum, roles by frequency, newest first', () => {
    const a1 = artist('a1', 30_000);
    const a2 = artist('a2', 10_000);
    const rej = artist('rej', 999_999, 'REJECTED');
    const s = buildCreditsSummary(
      [
        relRow('r-old', a1, { date: '2020-05-01T12:00:00Z', roles: ['Барабаны'] }),
        relRow('r-new', a2, { date: '2026-02-01T12:00:00Z', roles: ['Барабаны', 'Аранжировка'] }),
        relRow('r-nodate', a1, { date: null, roles: ['Барабаны'] }),
        relRow('r-pending', a1, { status: 'PENDING', roles: ['Вокал'] }),
        relRow('r-declined', a2, { status: 'DECLINED' }),
        relRow('r-rejected-artist', rej, { roles: ['Вокал'] }),
      ],
      [clipRow('c-1', a2, { roles: ['Аранжировка'] }), clipRow('c-pend', a1, { status: 'PENDING' })],
    );
    expect(s.releasesCount).toBe(3);
    expect(s.clipsCount).toBe(1);
    expect(s.releases.map((r) => r.id)).toEqual(['r-new', 'r-nodate', 'r-old']); // без даты — по дате добавления (2025-06)
    expect(s.artists.map((a) => a.id)).toEqual(['a1', 'a2']); // по слушателям
    expect(s.artists.find((a) => a.id === 'a1')!.credits).toBe(2);
    expect(s.listenersTotal).toBe(40_000); // уникальные артисты, REJECTED не считается
    expect(s.roles).toEqual(['Барабаны', 'Аранжировка']);
    expect(s.releases[0]).toEqual({
      id: 'r-new', title: 'Релиз r-new', coverUrl: 'https://avatars.yandex.net/r-new.jpg',
      releaseDate: new Date('2026-02-01T12:00:00Z'), artist: { id: 'a2', slug: 'slug-a2', name: 'Артист a2' },
      roles: ['Барабаны', 'Аранжировка'],
    });
  });

  it('two queries regardless of size (no N+1), filters confirmed + non-REJECTED in the DB, caches for 10 minutes', async () => {
    const artists = Array.from({ length: 10 }, (_, i) => artist(`a${i}`, 1000 * i));
    m('releaseParticipant').findMany.mockResolvedValue(Array.from({ length: 50 }, (_, i) => relRow(`r${i}`, artists[i % 10])));
    m('clipParticipant').findMany.mockResolvedValue(Array.from({ length: 20 }, (_, i) => clipRow(`c${i}`, artists[i % 10])));

    const t0 = 1_000_000;
    const s = await getCreditsSummary('u-1', t0);
    expect(s.releasesCount).toBe(50);
    expect(s.clipsCount).toBe(20);
    expect(s.artists).toHaveLength(10);
    expect(m('releaseParticipant').findMany).toHaveBeenCalledTimes(1);
    expect(m('clipParticipant').findMany).toHaveBeenCalledTimes(1);
    // ни одного запроса на элемент: артисты/релизы/роли приходят вложенным select
    for (const model of ['artist', 'release', 'clip', 'role', 'releaseParticipantRole', 'clipParticipantRole']) {
      for (const fn of Object.values(mockModels[model] ?? {})) expect(fn).not.toHaveBeenCalled();
    }
    const relArgs = m('releaseParticipant').findMany.mock.calls[0][0];
    expect(relArgs.where).toEqual({ userId: 'u-1', confirmStatus: 'ACCEPTED', release: { artist: { status: { not: 'REJECTED' } } } });
    const clipArgs = m('clipParticipant').findMany.mock.calls[0][0];
    expect(clipArgs.where).toEqual({ userId: 'u-1', confirmStatus: 'ACCEPTED', clip: { artist: { status: { not: 'REJECTED' } } } });

    // кэш: в пределах 10 минут — без запросов, после — заново
    await getCreditsSummary('u-1', t0 + CREDITS_TTL_MS - 1);
    expect(m('releaseParticipant').findMany).toHaveBeenCalledTimes(1);
    await getCreditsSummary('u-1', t0 + CREDITS_TTL_MS + 1);
    expect(m('releaseParticipant').findMany).toHaveBeenCalledTimes(2);
  });

  it('public serializer: whitelist only, no person ids / forbidden keys', () => {
    const s = buildCreditsSummary([{ ...relRow('r1', artist('a1', 5)), userId: 'u-secret', user: { email: 'x@y.z' } }], []);
    const out = toPublicCredits({ ...s, artists: s.artists.map((a) => ({ ...a, verificationCode: 'X' } as any)) });
    expect(findGuestForbiddenKeys(out)).toEqual([]);
    expect(JSON.stringify(out)).not.toContain('verificationCode');
    expect(Object.keys(out).sort()).toEqual(['artists', 'artistsCount', 'clips', 'clipsCount', 'listenersTotal', 'releases', 'releasesCount', 'roles']);
    expect(Object.keys(out.artists[0]).sort()).toEqual(['avatar', 'id', 'listeners', 'name', 'slug']);
  });
});

describe('аудиодемо карточки каталога', () => {
  it('only an audio portfolio file on /uploads/ (documents, external and streaming links are never played)', () => {
    expect(pickPortfolioDemo([
      { url: '/uploads/portfolio/cv.pdf', mimeType: 'application/pdf', originalName: 'cv.pdf' },
      { url: 'https://evil.example/x.mp3', mimeType: 'audio/mpeg', originalName: 'x.mp3' },
      { url: '/uploads/../etc/passwd.mp3', mimeType: 'audio/mpeg', originalName: 'p.mp3' },
      { url: '/uploads/portfolio/demo.mp3', mimeType: 'audio/mpeg', title: 'Шоурил', originalName: 'demo.mp3' },
    ], [])).toEqual({ url: '/uploads/portfolio/demo.mp3', title: 'Шоурил' });

    expect(pickPortfolioDemo([{ url: '/uploads/portfolio/a.png', mimeType: 'image/png' }], [
      { type: 'audio', url: 'https://music.yandex.ru/album/1', title: 'ЯМ' },
      { type: 'video', url: '/uploads/portfolio/v.mp3', title: 'видео' },
    ])).toBeNull();
    expect(pickPortfolioDemo([], [{ type: 'audio', url: '/uploads/portfolio/l.m4a', title: '' }])).toEqual({ url: '/uploads/portfolio/l.m4a', title: 'Демо' });
    expect(pickPortfolioDemo([], [{ type: 'audio', url: '/uploads/portfolio/page.html', title: 'x' }])).toBeNull();
    expect(isUploadsPath('//uploads/x.mp3')).toBe(false);
    expect(isUploadsPath('/uploads//x.mp3')).toBe(false);
  });

  it('loadCatalogExtras: three queries per page, releases count from confirmed participations', async () => {
    m('releaseParticipant').groupBy.mockResolvedValue([{ userId: 'u-1', _count: { _all: 12 } }]);
    m('portfolioFile').findMany.mockResolvedValue([
      { userId: 'u-1', url: '/uploads/portfolio/b.mp3', mimeType: 'audio/mpeg', title: 'B', sortOrder: 2, createdAt: new Date(1) },
      { userId: 'u-1', url: '/uploads/portfolio/a.mp3', mimeType: 'audio/mpeg', title: 'A', sortOrder: 1, createdAt: new Date(2) },
      { userId: 'u-2', url: '/uploads/portfolio/doc.pdf', mimeType: 'application/pdf', title: 'doc', sortOrder: 0, createdAt: new Date(1) },
    ]);
    const extras = await loadCatalogExtras(['u-1', 'u-2', 'u-1']);
    expect(extras.get('u-1')).toEqual({ releasesCount: 12, demo: { url: '/uploads/portfolio/a.mp3', title: 'A' } });
    expect(extras.get('u-2')).toEqual({ releasesCount: 0, demo: null });
    expect(m('releaseParticipant').groupBy).toHaveBeenCalledTimes(1);
    expect(m('portfolioFile').findMany).toHaveBeenCalledTimes(1);
    expect(m('portfolioLink').findMany).toHaveBeenCalledTimes(1);
    const gb = m('releaseParticipant').groupBy.mock.calls[0][0];
    expect(gb.where).toEqual({ userId: { in: ['u-1', 'u-2'] }, confirmStatus: 'ACCEPTED', release: { artist: { status: { not: 'REJECTED' } } } });
    expect(m('portfolioFile').findMany.mock.calls[0][0].where.mimeType).toEqual({ startsWith: 'audio/' });
    expect(m('portfolioLink').findMany.mock.calls[0][0].where.url).toEqual({ startsWith: '/uploads/' });

    // пустая страница — без запросов
    await loadCatalogExtras([]);
    expect(m('releaseParticipant').groupBy).toHaveBeenCalledTimes(1);
  });

  it('toPublicCatalogSignals: demo re-checked (/uploads only), title masked, badge without minutes', () => {
    const fresh = new Date();
    expect(toPublicCatalogSignals(
      { releasesCount: 3, demo: { url: '/uploads/portfolio/a.mp3', title: 'Демо, пишите @my_handle' } },
      { responseBadge: 'fast', responseBadgeAt: fresh, responseMedianMinutes: 7 } as any,
    )).toEqual({ releasesCount: 3, demo: { url: '/uploads/portfolio/a.mp3', title: expect.not.stringContaining('@my_handle') }, responseBadge: 'fast' });
    expect(toPublicCatalogSignals({ releasesCount: -1, demo: { url: 'https://x.ru/a.mp3', title: 'x' } }, null))
      .toEqual({ releasesCount: 0, demo: null, responseBadge: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-09T12:00:00Z');
const minAgo = (min: number) => new Date(NOW.getTime() - min * 60_000);
/** Диалог: входящее `daysAgo` дней назад, ответ через `replyMin` минут (null — без ответа). */
const dialog = (daysAgo: number, replyMin: number | null) => {
  const incomingAt = minAgo(daysAgo * 24 * 60);
  return { incomingAt, repliedAt: replyMin == null ? null : new Date(incomingAt.getTime() + replyMin * 60_000) };
};

describe('«Отвечает быстро» — пороги и минимум диалогов', () => {
  it('median ≤ 60 min with ≥ 5 dialogs → fast', () => {
    const st = computeResponseStats([dialog(1, 5), dialog(2, 10), dialog(3, 30), dialog(4, 50), dialog(5, 600)], NOW);
    expect(st).toEqual({ dialogs: 5, medianMinutes: 30, badge: 'fast' });
  });

  it('fewer than 5 dialogs → no badge and no minutes, even if instant', () => {
    expect(RESPONSE_MIN_DIALOGS).toBe(5);
    const st = computeResponseStats([dialog(1, 1), dialog(2, 1), dialog(3, 1), dialog(4, 1)], NOW);
    expect(st).toEqual({ dialogs: 4, medianMinutes: null, badge: null });
  });

  it('median ≤ 24 h → day; > 24 h → null (minutes kept for signed-in viewers)', () => {
    expect(computeResponseStats([dialog(1, 61), dialog(2, 120), dialog(3, 180), dialog(4, 240), dialog(5, 300)], NOW).badge).toBe('day');
    expect(computeResponseStats([1, 2, 3, 4, 5].map((d) => dialog(d + 2, 24 * 60)), NOW).badge).toBe('day');
    const slow = computeResponseStats([1, 2, 3, 4, 5].map((d) => dialog(d + 2, 30 * 60)), NOW);
    expect(slow).toEqual({ dialogs: 5, medianMinutes: 1800, badge: null });
  });

  it('unanswered > 24 h counts as ∞; fresh unanswered and dialogs older than 90 days are ignored', () => {
    // 3 быстрых + 2 неотвеченных: медиана — 3-й по счёту (быстрый) → fast
    expect(computeResponseStats([dialog(2, 5), dialog(3, 5), dialog(4, 5), dialog(5, null), dialog(6, null)], NOW).badge).toBe('fast');
    // 2 быстрых + 3 неотвеченных: медиана ∞ → ничего
    expect(computeResponseStats([dialog(2, 5), dialog(3, 5), dialog(4, null), dialog(5, null), dialog(6, null)], NOW))
      .toEqual({ dialogs: 5, medianMinutes: null, badge: null });
    // свежий неотвеченный (5 минут назад) не считается диалогом; старше 90 дней — тоже
    const st = computeResponseStats([
      dialog(1, 5), dialog(2, 5), dialog(3, 5), dialog(4, 5),
      { incomingAt: minAgo(5), repliedAt: null },
      dialog(91, 5),
    ], NOW);
    expect(st.dialogs).toBe(4);
    expect(st.badge).toBeNull();
  });

  it('median / badgeFor edge cases', () => {
    expect(median([])).toBeNull();
    expect(median([1, 3])).toBe(2);
    expect(median([1, Infinity])).toBe(Infinity);
    expect(badgeFor(60, 5)).toBe('fast');
    expect(badgeFor(61, 5)).toBe('day');
    expect(badgeFor(24 * 60, 5)).toBe('day');
    expect(badgeFor(24 * 60 + 1, 5)).toBeNull();
    expect(badgeFor(10, 4)).toBeNull();
  });

  it('effectiveResponse: stale cache (> 7 days) or unknown value → nothing', () => {
    const now = new Date();
    expect(effectiveResponse({ responseBadge: 'fast', responseBadgeAt: now, responseMedianMinutes: 12 }, now)).toEqual({ badge: 'fast', medianMinutes: 12 });
    expect(effectiveResponse({ responseBadge: 'fast', responseBadgeAt: new Date(now.getTime() - RESPONSE_BADGE_MAX_AGE_MS - 1000), responseMedianMinutes: 12 }, now))
      .toEqual({ badge: null, medianMinutes: null });
    expect(effectiveResponse({ responseBadge: 'super', responseBadgeAt: now }, now).badge).toBeNull();
    expect(effectiveResponse({ responseBadge: 'fast', responseBadgeAt: null }, now).badge).toBeNull();
  });

  it('recomputeResponseBadges: one raw query, writes only changes, clears stale holders', async () => {
    const rows = [
      ...[1, 2, 3, 4, 5].map((d) => ({ responderId: 'u-fast', ...dialog(d, 10) })),
      ...[1, 2, 3, 4, 5].map((d) => ({ responderId: 'u-same', ...dialog(d, 120) })),
      ...[1, 2].map((d) => ({ responderId: 'u-few', ...dialog(d, 1) })),
    ];
    mockQueryRaw.mockResolvedValue(rows);
    m('user').findMany.mockResolvedValue([
      { id: 'u-same', responseBadge: 'day', responseMedianMinutes: 120 }, // не изменился — без update
      { id: 'u-old', responseBadge: 'fast', responseMedianMinutes: 3 },   // больше не проходит — снять
    ]);
    m('user').update.mockResolvedValue({});
    m('user').updateMany.mockResolvedValue({ count: 1 });

    const res = await recomputeResponseBadges(NOW);
    expect(res).toEqual({ users: 2, changed: 1, cleared: 1 });
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(m('user').update).toHaveBeenCalledTimes(1);
    expect(m('user').update).toHaveBeenCalledWith({
      where: { id: 'u-fast' },
      data: { responseBadge: 'fast', responseMedianMinutes: 10, responseBadgeAt: NOW },
    });
    const updateManyArgs = m('user').updateMany.mock.calls.map((c: any[]) => c[0]);
    expect(updateManyArgs).toContainEqual({ where: { id: { in: ['u-fast', 'u-same'] } }, data: { responseBadgeAt: NOW } });
    expect(updateManyArgs).toContainEqual({
      where: { id: { in: ['u-old'] } },
      data: { responseBadge: null, responseMedianMinutes: null, responseBadgeAt: NOW },
    });
  });

  it('recomputeResponseBadges never throws (DB error → zero result)', async () => {
    mockQueryRaw.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recomputeResponseBadges(NOW)).resolves.toEqual({ users: 0, changed: 0, cleared: 0 });
    spy.mockRestore();
  });
});
