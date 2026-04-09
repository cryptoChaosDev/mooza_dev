import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadChannelAvatar } from '../middleware/upload';

const router = Router();

// Shared post include factory
function postInclude(userId: string) {
  return {
    author: { select: { id: true, firstName: true, lastName: true, avatar: true, role: true } },
    channel: { select: { id: true, name: true, avatar: true, ownerId: true } },
    likes: { where: { userId }, select: { id: true } },
    comments: {
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        reactions: { select: { id: true, emoji: true, userId: true } },
      },
      orderBy: { createdAt: 'asc' as const },
    },
    reactions: { select: { id: true, emoji: true, userId: true } },
    _count: { select: { likes: true, comments: true } },
  };
}

// GET /channels/feed — posts from subscribed channels + own channel (combined)
router.get('/feed', authenticate, async (req: AuthRequest, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const myChannel = await prisma.channel.findUnique({
      where: { ownerId: req.userId! },
      select: { id: true },
    });

    const subs = await prisma.channelSubscription.findMany({
      where: { userId: req.userId! },
      select: { channelId: true },
    });

    const channelIds = subs.map(s => s.channelId);
    if (myChannel) channelIds.push(myChannel.id);

    if (channelIds.length === 0) return res.json([]);

    const posts = await prisma.post.findMany({
      where: { channelId: { in: channelIds } },
      include: postInclude(req.userId!),
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });

    res.json(posts.map(p => ({ ...p, isLiked: p.likes.length > 0 })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get channel feed' });
  }
});

// GET /channels/feed/mine — only own channel posts
router.get('/feed/mine', authenticate, async (req: AuthRequest, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const myChannel = await prisma.channel.findUnique({
      where: { ownerId: req.userId! },
      select: { id: true },
    });
    if (!myChannel) return res.json([]);
    const posts = await prisma.post.findMany({
      where: { channelId: myChannel.id },
      include: postInclude(req.userId!),
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });
    res.json(posts.map(p => ({ ...p, isLiked: p.likes.length > 0 })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to get own channel feed' });
  }
});

// GET /channels/feed/subscribed — only subscribed channels posts
router.get('/feed/subscribed', authenticate, async (req: AuthRequest, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const subs = await prisma.channelSubscription.findMany({
      where: { userId: req.userId! },
      select: { channelId: true },
    });
    if (subs.length === 0) return res.json([]);
    const channelIds = subs.map(s => s.channelId);
    const posts = await prisma.post.findMany({
      where: { channelId: { in: channelIds } },
      include: postInclude(req.userId!),
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });
    res.json(posts.map(p => ({ ...p, isLiked: p.likes.length > 0 })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to get subscribed feed' });
  }
});

// GET /channels/subscriptions — list channels user is subscribed to
router.get('/subscriptions', authenticate, async (req: AuthRequest, res) => {
  try {
    const subs = await prisma.channelSubscription.findMany({
      where: { userId: req.userId! },
      include: {
        channel: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
            _count: { select: { subscriptions: true, posts: true } },
          },
        },
      },
    });
    res.json(subs.map(s => s.channel));
  } catch (e) {
    res.status(500).json({ error: 'Failed to get subscriptions' });
  }
});

// GET /channels/my — current user's channel
router.get('/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { ownerId: req.userId! },
      include: { _count: { select: { subscriptions: true, posts: true } } },
    });
    res.json(channel ?? null);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get channel' });
  }
});

// POST /channels — create channel (one per user)
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });

    const existing = await prisma.channel.findUnique({ where: { ownerId: req.userId! } });
    if (existing) return res.status(400).json({ error: 'Канал уже существует' });

    const channel = await prisma.channel.create({
      data: { name: name.trim(), description: description?.trim() || null, ownerId: req.userId! },
      include: { _count: { select: { subscriptions: true, posts: true } } },
    });
    res.status(201).json(channel);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// PUT /channels/my — update channel
router.put('/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;
    const channel = await prisma.channel.update({
      where: { ownerId: req.userId! },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
      },
      include: { _count: { select: { subscriptions: true, posts: true } } },
    });
    res.json(channel);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// DELETE /channels/my — delete channel
router.delete('/my', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.channel.delete({ where: { ownerId: req.userId! } });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// POST /channels/my/avatar — upload channel avatar
router.post('/my/avatar', authenticate, uploadChannelAvatar.single('avatar'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const url = `/uploads/channels/${req.file.filename}`;
    const channel = await prisma.channel.update({
      where: { ownerId: req.userId! },
      data: { avatar: url },
      include: { _count: { select: { subscriptions: true, posts: true } } },
    });
    res.json(channel);
  } catch (e) {
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// GET /channels/:id — get channel by ID (with subscription status)
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        _count: { select: { subscriptions: true, posts: true } },
      },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });

    const isSubscribed = !!(await prisma.channelSubscription.findUnique({
      where: { channelId_userId: { channelId: req.params.id, userId: req.userId! } },
    }));

    res.json({ ...channel, isSubscribed });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get channel' });
  }
});

// POST /channels/:id/subscribe
router.post('/:id/subscribe', authenticate, async (req: AuthRequest, res) => {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.id } });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });
    if (channel.ownerId === req.userId) return res.status(400).json({ error: 'Нельзя подписаться на свой канал' });

    await prisma.channelSubscription.upsert({
      where: { channelId_userId: { channelId: req.params.id, userId: req.userId! } },
      update: {},
      create: { channelId: req.params.id, userId: req.userId! },
    });
    res.json({ subscribed: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// DELETE /channels/:id/subscribe
router.delete('/:id/subscribe', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.channelSubscription.deleteMany({
      where: { channelId: req.params.id, userId: req.userId! },
    });
    res.json({ subscribed: false });
  } catch (e) {
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

export default router;
