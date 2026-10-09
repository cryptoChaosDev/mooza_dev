/**
 * Tests for /api/posts — security/validation fixes of the feed audit.
 *
 * Prisma, notify and socket helpers are mocked — no real DB needed.
 * Auth middleware is replaced by a stub that injects req.userId.
 */

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const ME = 'user-me';
const OTHER = 'user-other';

jest.mock('../middleware/auth', () => ({
  authenticate: (req: Request & { userId?: string }, _res: Response, next: NextFunction) => {
    req.userId = req.headers['x-test-user-id'] as string;
    next();
  },
  optionalAuthenticate: (req: Request & { userId?: string }, _res: Response, next: NextFunction) => {
    const id = req.headers['x-test-user-id'];
    if (id) req.userId = id as string;
    next();
  },
}));

const mockTgLog = jest.fn();
jest.mock('../utils/telegram', () => ({
  tgLog: (...args: unknown[]) => mockTgLog(...args),
  tgEvent: new Proxy({}, { get: () => jest.fn() }),
  escTg: (s: unknown) => String(s ?? '').replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;')),
}));

const mockNotify = jest.fn();
jest.mock('../utils/notify', () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
  isNotificationEnabled: jest.fn().mockResolvedValue(true),
}));

jest.mock('../socket', () => ({
  emitToUser: jest.fn(),
  notifyUser: jest.fn(),
}));

const mockPrisma = {
  post: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  city: { findFirst: jest.fn() },
  like: { createMany: jest.fn(), deleteMany: jest.fn() },
  savedPost: { createMany: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn() },
  comment: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
  postReaction: { upsert: jest.fn(), groupBy: jest.fn() },
  userService: { findFirst: jest.fn() },
};

jest.mock('../index', () => ({ prisma: mockPrisma }));

function buildApp() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const router = require('../routes/posts').default;
  const app = express();
  app.use(express.json());
  app.use('/api/posts', router);
  return app;
}

const asUser = (id: string) => ({ 'x-test-user-id': id });

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.postReaction.groupBy.mockResolvedValue([]);
  mockPrisma.post.count.mockResolvedValue(1);
  mockPrisma.post.create.mockImplementation(async ({ data }: any) => ({
    id: 'post-1', ...data, author: { firstName: 'Me', lastName: '<b>X</b>' },
  }));
});

describe('POST /api/posts — content & media validation', () => {
  it('strips arbitrary classes and forces rel/target on links', async () => {
    const res = await request(buildApp())
      .post('/api/posts')
      .set(asUser(ME))
      .send({ content: '<p><a class="fixed inset-0 z-[100]" href="https://phish.example">x</a><img src=x onerror=alert(1)></p>' });
    expect(res.status).toBe(201);
    const saved = mockPrisma.post.create.mock.calls[0][0].data.content as string;
    expect(saved).not.toContain('class=');
    expect(saved).not.toContain('onerror');
    expect(saved).toContain('rel="noopener noreferrer nofollow"');
    // admin log: no post text, author name escaped
    const log = mockTgLog.mock.calls[0][0] as string;
    expect(log).not.toContain('phish');
    expect(log).toContain('&lt;b&gt;X&lt;/b&gt;');
  });

  it('rebuilds mention labels from DB and drops unknown mention ids', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u-1', firstName: 'Real', lastName: 'User' }]);
    await request(buildApp())
      .post('/api/posts')
      .set(asUser(ME))
      .send({ content: '<p><span data-type="mention" class="post-mention" data-id="u-1" data-label="Admin">@Admin</span> <span data-type="mention" data-id="ghost">@Ghost</span></p>' });
    const data = mockPrisma.post.create.mock.calls[0][0].data;
    expect(data.content).toContain('@Real User');
    expect(data.content).not.toContain('@Admin');
    expect(data.content).not.toContain('data-id="ghost"');
    expect(data.mentions).toEqual([{ id: 'u-1', type: 'user', name: 'Real User' }]);
  });

  it('rejects foreign image URLs', async () => {
    const res = await request(buildApp())
      .post('/api/posts')
      .set(asUser(ME))
      .send({ content: 'hi', images: ['@evil.com/p.png'] });
    expect(res.status).toBe(400);
    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });

  it('accepts own uploads', async () => {
    const res = await request(buildApp())
      .post('/api/posts')
      .set(asUser(ME))
      .send({ content: 'hi', images: ['/uploads/posts/post-1-2.jpg'] });
    expect(res.status).toBe(201);
  });

  it('rejects javascript: links', async () => {
    const res = await request(buildApp())
      .post('/api/posts')
      .set(asUser(ME))
      .send({ content: 'hi', links: ['javascript:alert(1)'] });
    expect(res.status).toBe(400);
  });

  it('does not allow fake «Заказ» posts', async () => {
    const res = await request(buildApp())
      .post('/api/posts')
      .set(asUser(ME))
      .send({ content: 'hi', type: 'order' });
    expect(res.status).toBe(400);
  });

  it('validates poll options', async () => {
    const res = await request(buildApp())
      .post('/api/posts')
      .set(asUser(ME))
      .send({ type: 'poll', pollOptions: Array.from({ length: 11 }, (_, i) => `o${i}`) });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/posts/feed', () => {
  it('clamps limit and survives non-numeric values', async () => {
    mockPrisma.post.findMany.mockResolvedValue([]);
    const res = await request(buildApp()).get('/api/posts/feed?limit=abc&offset=xyz');
    expect(res.status).toBe(200);
    const res2 = await request(buildApp()).get('/api/posts/feed?limit=100000&cursor=');
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ items: [], nextCursor: null });
    const args = mockPrisma.post.findMany.mock.calls.at(-1)![0];
    expect(args.take).toBeLessThanOrEqual(51);
  });

  it('returns a (createdAt,id) cursor for the «new» sort', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `p${i}`, createdAt: new Date(Date.UTC(2026, 0, 3 - i)), likes: [], savedBy: [], pollVotes: [], reactions: [],
    }));
    mockPrisma.post.findMany.mockResolvedValue(rows);
    const res = await request(buildApp()).get('/api/posts/feed?limit=2&cursor=');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).toBe(`${rows[1].createdAt.toISOString()}|p1`);
  });
});

describe('likes / saves', () => {
  it('like is idempotent and own post cannot be liked', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({ authorId: OTHER, author: { firstName: 'O', lastName: 'T' } });
    mockPrisma.like.createMany.mockResolvedValue({ count: 0 });
    const res = await request(buildApp()).post('/api/posts/p1/like').set(asUser(ME));
    expect(res.status).toBe(201);
    expect(mockPrisma.like.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));

    mockPrisma.post.findUnique.mockResolvedValue({ authorId: ME, author: { firstName: 'M', lastName: 'E' } });
    const own = await request(buildApp()).post('/api/posts/p1/like').set(asUser(ME));
    expect(own.status).toBe(400);
  });

  it('save with explicit state does not toggle back', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({ id: 'p1' });
    mockPrisma.savedPost.createMany.mockResolvedValue({ count: 0 });
    const res = await request(buildApp()).post('/api/posts/p1/save').set(asUser(ME)).send({ saved: true });
    expect(res.body).toEqual({ saved: true });
    expect(mockPrisma.savedPost.deleteMany).not.toHaveBeenCalled();
  });
});

describe('comments', () => {
  it('404 for a missing post', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null);
    const res = await request(buildApp()).post('/api/posts/nope/comments').set(asUser(ME)).send({ content: 'hi' });
    expect(res.status).toBe(404);
  });

  it('400 for a parent comment from another post and for reply-to-reply', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({ authorId: OTHER });
    mockPrisma.comment.findUnique.mockResolvedValue({ id: 'c1', postId: 'other-post', parentCommentId: null, authorId: OTHER });
    const res = await request(buildApp()).post('/api/posts/p1/comments').set(asUser(ME)).send({ content: 'hi', parentCommentId: 'c1' });
    expect(res.status).toBe(400);

    mockPrisma.comment.findUnique.mockResolvedValue({ id: 'c2', postId: 'p1', parentCommentId: 'c1', authorId: OTHER });
    const res2 = await request(buildApp()).post('/api/posts/p1/comments').set(asUser(ME)).send({ content: 'hi', parentCommentId: 'c2' });
    expect(res2.status).toBe(400);
  });

  it('reply notifies parent author and post author via notify()', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({ authorId: 'post-author' });
    mockPrisma.comment.findUnique.mockResolvedValue({ id: 'c1', postId: 'p1', parentCommentId: null, authorId: OTHER });
    mockPrisma.comment.create.mockResolvedValue({ id: 'c9', content: 'hi', author: { firstName: 'Me', lastName: 'Me' } });
    const res = await request(buildApp()).post('/api/posts/p1/comments').set(asUser(ME)).send({ content: 'hi', parentCommentId: 'c1' });
    expect(res.status).toBe(201);
    const recipients = mockNotify.mock.calls.map((c) => (c[0] as any).userId).sort();
    expect(recipients).toEqual(['post-author', OTHER].sort());
  });

  it('rejects foreign comment image URLs', async () => {
    const res = await request(buildApp()).post('/api/posts/p1/comments').set(asUser(ME)).send({ imageUrl: 'https://evil.example/x.png' });
    expect(res.status).toBe(400);
  });

  it('post author may delete a comment under their post', async () => {
    mockPrisma.comment.findUnique.mockResolvedValue({ id: 'c1', postId: 'p1', authorId: OTHER, post: { authorId: ME } });
    const res = await request(buildApp()).delete('/api/posts/p1/comments/c1').set(asUser(ME));
    expect(res.status).toBe(204);
  });
});

describe('reactions / votes', () => {
  it('only whitelisted emoji', async () => {
    const res = await request(buildApp()).post('/api/posts/p1/reactions').set(asUser(ME)).send({ emoji: '<img>' });
    expect(res.status).toBe(400);
  });

  it('optionIndex must be a non-negative integer', async () => {
    const res = await request(buildApp()).post('/api/posts/p1/vote').set(asUser(ME)).send({ optionIndex: 1.5 });
    expect(res.status).toBe(400);
  });
});
