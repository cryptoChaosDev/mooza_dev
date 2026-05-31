import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { emitToUser, notifyUser } from '../socket';
import { uploadPostMedia } from '../middleware/upload';
import { tgLog, tgEvent } from '../utils/telegram';

const router = Router();

// Upload post media (image, gif, audio)
router.post('/upload', authenticate, uploadPostMedia.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const isAudio = req.file.mimetype.startsWith('audio/');
    const url = `/uploads/posts/${req.file.filename}`;
    // Fix encoding: multer receives filename as latin1, convert to utf-8
    let originalName = req.file.originalname;
    try { originalName = Buffer.from(originalName, 'latin1').toString('utf8'); } catch {}
    res.json({ url, type: isAudio ? 'audio' : 'image', originalName });
  } catch (error) {
    console.error('Post media upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /api/posts/my-authors — list authors user can post as
router.get('/my-authors', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const user = await prisma.user.findUnique({
      where: { id: meId },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    const channel = await prisma.channel.findUnique({
      where: { ownerId: meId },
      select: { id: true, name: true, avatar: true },
    });
    const artistMemberships = await prisma.userArtist.findMany({
      where: { userId: meId, isOwner: true, inviteStatus: 'ACCEPTED' },
      include: { artist: { select: { id: true, name: true, avatar: true } } },
    });
    res.json({
      user,
      channel,
      artists: artistMemberships.map((m: any) => m.artist),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Shared post include used by /feed for both regular and pinned (team) posts.
// Kept as a factory so each query gets its own per-user `where` for likes/savedBy.
const buildFeedInclude = (userId: string | undefined) => {
  // Guest safety: Prisma treats `{ userId: undefined }` as NO filter, which would
  // return ALL likes/savedBy rows and make isLiked/isSaved wrongly true for guests.
  // Fall back to a non-matching UUID so the relations come back empty.
  const meId = userId ?? '00000000-0000-0000-0000-000000000000';
  return {
  author: {
    select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, isPremium: true, isVerified: true, isBlocked: true }
  },
  channel: { select: { id: true, name: true, avatar: true } },
  artist: { select: { id: true, name: true, avatar: true } },
  repostOf: {
    include: {
      author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, isPremium: true, isVerified: true } }
    }
  },
  likes: {
    where: { userId: meId },
    select: { id: true }
  },
  savedBy: {
    where: { userId: meId },
    select: { id: true }
  },
  comments: {
    where: { parentCommentId: null } as any,
    include: {
      author: {
        select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true }
      },
      reactions: {
        select: { id: true, emoji: true, userId: true }
      },
      replies: {
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true }
          },
          reactions: {
            select: { id: true, emoji: true, userId: true }
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    } as any,
    orderBy: { createdAt: 'asc' },
  },
  reactions: {
    select: { id: true, emoji: true, userId: true }
  },
  _count: {
    select: { likes: true, comments: true }
  }
  };
};

// System team account — its posts are pinned to the top of the feed for brand-new users.
// See server/prisma/seeds/welcome-posts.ts
const TEAM_EMAIL = 'team@moooza.ru';

// Get feed (all posts from the social network)
// Chronological only (newest first). Supports:
//   type       — post type (blog | question | poll | service | employment | …)
//   authorKind — all | resident (profile) | channel | artist | mine
//   limit/offset — pagination for infinite scroll
router.get('/feed', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const { limit = 20, offset = 0, type, authorKind, period, city, employment, artistType, genre } = req.query;
    const offsetNum = Number(offset);
    const limitNum = Number(limit);
    const kind = authorKind ? String(authorKind) : 'all';

    const include = buildFeedInclude(req.userId) as any;

    // Team welcome account — its posts are pinned for brand-new users and kept
    // out of the normal chronological stream (avoids duplicates across pages).
    const teamUser = await prisma.user.findUnique({
      where: { email: TEAM_EMAIL },
      select: { id: true },
    });
    const teamUserId = teamUser?.id ?? null;

    // Build the where clause from filters.
    const where: any = {};
    if (type && type !== 'all') where.type = String(type);
    if (kind === 'resident') { where.channelId = null; where.artistId = null; }
    else if (kind === 'channel') where.channelId = { not: null };
    else if (kind === 'artist') where.artistId = { not: null };
    else if (kind === 'mine') where.authorId = req.userId;
    else if (teamUserId) where.authorId = { not: teamUserId }; // exclude team from default/other views

    // period — date lower bound on createdAt (server-computed)
    const periodStr = period ? String(period) : 'all';
    if (periodStr && periodStr !== 'all') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (periodStr === 'today') {
        where.createdAt = { gte: startOfToday };
      } else if (periodStr === 'yesterday') {
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        where.createdAt = { gte: startOfYesterday, lt: startOfToday };
      } else {
        const since = new Date(now);
        switch (periodStr) {
          case '3days': since.setDate(since.getDate() - 3); break;
          case 'week': since.setDate(since.getDate() - 7); break;
          case 'month': since.setMonth(since.getMonth() - 1); break;
          case '3months': since.setMonth(since.getMonth() - 3); break;
          case 'year': since.setFullYear(since.getFullYear() - 1); break;
          default: break;
        }
        where.createdAt = { gte: since };
      }
    }

    // city — comma-separated list, exact match on stored names
    if (city) {
      const cityNames = String(city)
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);
      if (cityNames.length > 0) where.city = { in: cityNames };
    }

    // ── Contextual filters (E4) ──────────────────────────────────────────────
    // Employment status — filter by the post author's occupancy status
    // (shown in UI for «Резидент» author or «Апдейт занятости» type).
    if (employment && employment !== 'all') {
      where.author = { ...(where.author || {}), occupancyStatus: String(employment) };
    }
    // Artist type — only artist posts have an artist relation (shown for «Артист»).
    if (artistType && artistType !== 'all') {
      where.artist = { ...(where.artist || {}), type: String(artistType) };
    }
    // Genre — artist posts whose artist is tagged with the given genre.
    if (genre && genre !== 'all') {
      where.artist = { ...(where.artist || {}), genres: { some: { genre: { name: String(genre) } } } };
    }

    const posts = await prisma.post.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      take: limitNum,
      skip: offsetNum,
    });

    // Pin team welcome posts at the top — only on the first page of the default
    // feed (no type/author filter) and only for users with no posts of their own.
    let pinnedPosts: typeof posts = [];
    const isDefaultFeed = (!type || type === 'all') && kind === 'all';
    if (isDefaultFeed && offsetNum === 0 && req.userId && teamUserId) {
      const myPostsCount = await prisma.post.count({ where: { authorId: req.userId } });
      if (myPostsCount === 0) {
        pinnedPosts = await prisma.post.findMany({
          where: { authorId: teamUserId },
          include,
          orderBy: { createdAt: 'asc' },
          take: 7,
        });
      }
    }

    const pinnedIds = new Set(pinnedPosts.map(p => p.id));
    const combined = [
      ...pinnedPosts,
      ...posts.filter(p => !pinnedIds.has(p.id)),
    ];

    res.json(combined.map((post: any) => ({ ...post, isLiked: post.likes.length > 0, isSaved: post.savedBy.length > 0 })));
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

// Create post
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      content, imageUrl, audioUrl, audioName, type, employmentStatus, pollOptions, pollEndsAt, channelId, artistId,
      images, tags, genres, links, city, mentions, title, category,
    } = req.body;

    // Normalize new optional fields
    const imagesArr: string[] = Array.isArray(images) ? images.slice(0, 10) : [];
    const tagsArr: string[] = Array.isArray(tags) ? tags : [];
    const genresArr: string[] = Array.isArray(genres) ? genres : [];
    const linksArr: string[] = Array.isArray(links) ? links : [];

    const isPoll = type === 'poll';
    if (isPoll) {
      if (!Array.isArray(pollOptions) || pollOptions.filter((o: string) => o?.trim()).length < 2) {
        return res.status(400).json({ error: 'Poll requires at least 2 non-empty options' });
      }
    } else if (type === 'question') {
      if (!title?.trim() || !content?.trim()) {
        return res.status(400).json({ error: 'Вопрос требует заголовок и текст' });
      }
    } else if (!content && !imageUrl && !audioUrl && imagesArr.length === 0 && !(type === 'employment' && employmentStatus)) {
      return res.status(400).json({ error: 'Post cannot be empty' });
    }

    // E8 — service update rate limit (per-user, lite): max 1 service post / 24h.
    // TODO: per-service once serviceId is modeled
    if (type === 'service') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await prisma.post.findFirst({
        where: { authorId: req.userId!, type: 'service', createdAt: { gte: since } },
        select: { id: true },
      });
      if (recent) {
        return res.status(429).json({ error: 'Апдейт услуги можно публиковать не чаще 1 раза в 24 часа' });
      }
    }

    // Validate author choice: channelId / artistId mutually exclusive, and user must own them
    if (channelId && artistId) {
      return res.status(400).json({ error: 'Cannot post as both channel and artist' });
    }
    if (channelId) {
      const channel = await prisma.channel.findUnique({ where: { id: String(channelId) }, select: { ownerId: true } });
      if (!channel || channel.ownerId !== req.userId) {
        return res.status(403).json({ error: 'Not allowed to post as this channel' });
      }
    }
    if (artistId) {
      const membership = await prisma.userArtist.findFirst({
        where: { userId: req.userId!, artistId: String(artistId), isOwner: true, inviteStatus: 'ACCEPTED' },
      });
      if (!membership) {
        return res.status(403).json({ error: 'Not allowed to post as this artist' });
      }
    }
    // Employment posts are only from the user (not channel/artist)
    const effectiveChannelId = type === 'employment' ? null : (channelId || null);
    const effectiveArtistId = type === 'employment' ? null : (artistId || null);

    const post = await prisma.post.create({
      data: {
        content: content || '',
        type: type || 'blog',
        imageUrl: imageUrl || null,
        audioUrl: audioUrl || null,
        audioName: audioName || null,
        authorId: req.userId!,
        channelId: effectiveChannelId,
        artistId: effectiveArtistId,
        images: imagesArr,
        tags: tagsArr,
        genres: genresArr,
        links: linksArr,
        city: city ?? null,
        mentions: mentions ?? null,
        title: title ?? null,
        category: category ?? null,
        ...(isPoll ? {
          pollOptions: (pollOptions as string[]).filter(o => o?.trim()).map(text => ({ text, votes: 0 })),
          pollEndsAt: pollEndsAt ? new Date(pollEndsAt) : null,
        } : {}),
      } as any,
      include: {
        author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, isPremium: true, isVerified: true, isBlocked: true } },
        channel: { select: { id: true, name: true, avatar: true } },
        artist: { select: { id: true, name: true, avatar: true } },
      }
    });

    // If employment post — auto-update user's occupancyStatus
    if (type === 'employment' && employmentStatus && req.userId) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { occupancyStatus: employmentStatus },
      });
    }

    const author = post.author;
    const preview = (content || '').slice(0, 80) + ((content || '').length > 80 ? '…' : '');
    const media = [imageUrl && '🖼', audioUrl && '🎵'].filter(Boolean).join(' ');
    tgLog(`📝 <b>Новый пост</b>\n👤 ${author.firstName} ${author.lastName}\n${preview}${media ? '\n' + media : ''}`);
    res.status(201).json(post);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// POST /api/posts/:id/repost — repost an existing post to the feed
router.post('/:id/repost', authenticate, async (req: AuthRequest, res) => {
  try {
    const { comment } = req.body;

    // Verify the original exists (don't allow reposting a deleted/nonexistent post)
    const original = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!original) return res.status(404).json({ error: 'Post not found' });

    const post = await prisma.post.create({
      data: {
        authorId: req.userId!,
        type: 'blog',
        content: '',
        repostOfId: req.params.id,
        repostComment: (comment?.trim() || null),
      } as any,
      include: {
        author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, isPremium: true, isVerified: true, isBlocked: true } },
        repostOf: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, isPremium: true, isVerified: true } }
          }
        },
      },
    });

    res.status(201).json(post);
  } catch (error) {
    console.error('Repost error:', error);
    res.status(500).json({ error: 'Failed to repost' });
  }
});

// POST /api/posts/:id/save — toggle save post
router.post('/:id/save', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const existing = await prisma.savedPost.findUnique({
      where: { userId_postId: { userId: meId, postId: req.params.id } },
    });
    if (existing) {
      await prisma.savedPost.delete({ where: { id: existing.id } });
      return res.json({ saved: false });
    }
    await prisma.savedPost.create({ data: { userId: meId, postId: req.params.id } });
    try {
      const saver = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
      tgEvent.postSave(`${saver?.firstName} ${saver?.lastName}`);
    } catch {}
    res.json({ saved: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/posts/saved — list saved posts of current user
router.get('/saved/list', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const saved = await prisma.savedPost.findMany({
      where: { userId: meId },
      orderBy: { createdAt: 'desc' },
      include: {
        post: {
          include: buildFeedInclude(meId) as any,
        },
      },
    });
    res.json(saved.map(s => ({
      ...s.post,
      savedAt: s.createdAt,
      isLiked: (s.post as any).likes?.length > 0,
      isSaved: true,
    })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/posts/:id/vote — vote in poll
router.post('/:id/vote', authenticate, async (req: AuthRequest, res) => {
  try {
    const meId = req.userId!;
    const { optionIndex } = req.body;
    if (typeof optionIndex !== 'number') return res.status(400).json({ error: 'optionIndex required' });

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.type !== 'poll') return res.status(404).json({ error: 'Poll not found' });
    if (post.pollEndsAt && new Date(post.pollEndsAt) < new Date()) {
      return res.status(400).json({ error: 'Poll ended' });
    }

    const existing = await prisma.pollVote.findUnique({
      where: { postId_userId: { postId: post.id, userId: meId } },
    });
    if (existing) {
      await prisma.pollVote.update({ where: { id: existing.id }, data: { optionIndex } });
    } else {
      await prisma.pollVote.create({ data: { postId: post.id, userId: meId, optionIndex } });
    }

    // Recalculate vote counts
    const votes = await prisma.pollVote.findMany({ where: { postId: post.id } });
    const options = (post.pollOptions as any[]) || [];
    const updated = options.map((opt: any, i: number) => ({
      text: opt.text,
      votes: votes.filter(v => v.optionIndex === i).length,
    }));
    await prisma.post.update({
      where: { id: post.id },
      data: { pollOptions: updated },
    });

    try {
      const voter = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
      tgEvent.pollVote(`${voter?.firstName} ${voter?.lastName}`, options[optionIndex]?.text || `#${optionIndex}`);
    } catch {}

    res.json({ ok: true, options: updated, myVote: optionIndex });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get post by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
            isPremium: true,
            isVerified: true,
            isBlocked: true,
          }
        },
        likes: {
          where: {
            userId: req.userId
          },
          select: {
            id: true
          }
        },
        comments: {
          where: { parentCommentId: null } as any,
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            },
            reactions: {
              select: { id: true, emoji: true, userId: true }
            },
            replies: {
              include: {
                author: {
                  select: { id: true, firstName: true, lastName: true, avatar: true }
                },
                reactions: {
                  select: { id: true, emoji: true, userId: true }
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          } as any,
          orderBy: { createdAt: 'asc' }
        },
        savedBy: {
          where: { userId: req.userId },
          select: { id: true }
        },
        reactions: {
          select: { id: true, emoji: true, userId: true }
        },
        channel: { select: { id: true, name: true, avatar: true } },
        artist: { select: { id: true, name: true, avatar: true } },
        _count: {
          select: { likes: true, comments: true }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Add isLiked / isSaved properties
    const postWithLikeStatus = {
      ...post,
      isLiked: post.likes.length > 0,
      isSaved: post.savedBy.length > 0,
    };

    res.json(postWithLikeStatus);
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// Like post
router.post('/:id/like', authenticate, async (req: AuthRequest, res) => {
  try {
    // Check if user has already liked this post
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId: req.userId!,
          postId: req.params.id
        }
      }
    });

    if (existingLike) {
      return res.status(400).json({ error: 'Post already liked' });
    }

    const like = await prisma.like.create({
      data: {
        userId: req.userId!,
        postId: req.params.id,
      }
    });

    try {
      const [liker, post] = await Promise.all([
        prisma.user.findUnique({ where: { id: req.userId! }, select: { firstName: true, lastName: true } }),
        prisma.post.findUnique({ where: { id: req.params.id }, include: { author: { select: { firstName: true, lastName: true } } } }),
      ]);
      tgEvent.postLike(`${liker?.firstName} ${liker?.lastName}`, `${post?.author.firstName} ${post?.author.lastName}`);
    } catch {}

    res.status(201).json(like);
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Unlike post
router.delete('/:id/like', authenticate, async (req: AuthRequest, res) => {
  try {
    const deleted = await prisma.like.deleteMany({
      where: {
        userId: req.userId,
        postId: req.params.id,
      }
    });

    // Return success even if no like was deleted (idempotent)
    res.status(204).send();
  } catch (error) {
    console.error('Unlike post error:', error);
    res.status(500).json({ error: 'Failed to unlike post' });
  }
});

// Comment on post
router.post('/:id/comments', authenticate, async (req: AuthRequest, res) => {
  try {
    const { content, parentCommentId } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      select: { authorId: true },
    });

    const comment = await (prisma.comment as any).create({
      data: {
        content,
        authorId: req.userId!,
        postId: req.params.id,
        ...(parentCommentId ? { parentCommentId } : {}),
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, avatar: true }
        }
      }
    });

    // Notify post author (unless they commented on their own post)
    if (post && post.authorId !== req.userId && !parentCommentId) {
      const notification = await prisma.notification.create({
        data: {
          userId: post.authorId,
          actorId: req.userId!,
          type: 'post_reply',
          title: 'Новый комментарий',
          body: `${comment.author.firstName} ${comment.author.lastName}: ${comment.content.length > 60 ? comment.content.slice(0, 60) + '…' : comment.content}`,
          link: `/?post=${req.params.id}`,
        },
        include: { actor: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true } } },
      });
      notifyUser(post.authorId, 'post_reply', { comment, postId: req.params.id }, {
        title: 'Новый комментарий',
        body: `${comment.author.firstName} ${comment.author.lastName}: ${comment.content.length > 60 ? comment.content.slice(0, 60) + '…' : comment.content}`,
        link: `/?post=${req.params.id}`,
      });
      emitToUser(post.authorId, 'new_notification', notification);
    }

    // Notify parent comment author if this is a reply
    if (parentCommentId) {
      const parentComment = await (prisma.comment as any).findUnique({
        where: { id: parentCommentId },
        select: { authorId: true },
      });
      if (parentComment && parentComment.authorId !== req.userId) {
        const notification = await (prisma as any).notification.create({
          data: {
            userId: parentComment.authorId,
            actorId: req.userId!,
            type: 'post_reply',
            title: 'Ответ на комментарий',
            body: `${comment.author.firstName} ${comment.author.lastName}: ${comment.content.length > 60 ? comment.content.slice(0, 60) + '…' : comment.content}`,
            link: `/?post=${req.params.id}`,
          },
          include: { actor: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true } } },
        });
        emitToUser(parentComment.authorId, 'new_notification', notification);
      }
    }

    try {
      const postAuthor = post?.authorId
        ? await prisma.user.findUnique({ where: { id: post.authorId }, select: { firstName: true, lastName: true } })
        : null;
      tgEvent.postComment(
        `${comment.author.firstName} ${comment.author.lastName}`,
        `${postAuthor?.firstName ?? '?'} ${postAuthor?.lastName ?? ''}`,
        content,
      );
    } catch {}

    res.status(201).json(comment);
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Failed to comment' });
  }
});

// Edit post
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.authorId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    const { content, imageUrl, audioUrl, audioName } = req.body;
    const updated = await prisma.post.update({
      where: { id: req.params.id },
      data: {
        ...(content !== undefined && { content }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
        ...(audioUrl !== undefined && { audioUrl: audioUrl || null }),
        ...(audioName !== undefined && { audioName: audioName || null }),
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, isPremium: true, isVerified: true, isBlocked: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Edit post error:', error);
    res.status(500).json({ error: 'Failed to edit post' });
  }
});

// Edit comment
router.put('/:postId/comments/:commentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.postId !== req.params.postId) return res.status(400).json({ error: 'Comment does not belong to this post' });
    if (comment.authorId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    const updated = await prisma.comment.update({
      where: { id: req.params.commentId },
      data: { content: content.trim() },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Edit comment error:', error);
    res.status(500).json({ error: 'Failed to edit comment' });
  }
});

// Delete comment
router.delete('/:postId/comments/:commentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: req.params.commentId },
      include: { post: { select: { authorId: true } } }
    });

    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.postId !== req.params.postId) return res.status(400).json({ error: 'Comment does not belong to this post' });

    // Only comment author can delete their comment
    if (comment.authorId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.comment.delete({ where: { id: req.params.commentId } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// React to post (add or change reaction)
router.post('/:id/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

    const reaction = await prisma.postReaction.upsert({
      where: { userId_postId: { userId: req.userId!, postId: req.params.id } },
      update: { emoji },
      create: { emoji, userId: req.userId!, postId: req.params.id },
    });

    try {
      const reactor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { firstName: true, lastName: true } });
      tgEvent.postReaction(`${reactor?.firstName} ${reactor?.lastName}`, emoji);
    } catch {}

    res.json(reaction);
  } catch (error) {
    console.error('Post reaction error:', error);
    res.status(500).json({ error: 'Failed to react' });
  }
});

// Remove reaction from post
router.delete('/:id/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.postReaction.deleteMany({
      where: { userId: req.userId!, postId: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Remove post reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// React to comment
router.post('/:postId/comments/:commentId/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

    const reaction = await prisma.commentReaction.upsert({
      where: { userId_commentId: { userId: req.userId!, commentId: req.params.commentId } },
      update: { emoji },
      create: { emoji, userId: req.userId!, commentId: req.params.commentId },
    });

    res.json(reaction);
  } catch (error) {
    console.error('Comment reaction error:', error);
    res.status(500).json({ error: 'Failed to react' });
  }
});

// Remove reaction from comment
router.delete('/:postId/comments/:commentId/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.commentReaction.deleteMany({
      where: { userId: req.userId!, commentId: req.params.commentId },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Remove comment reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// Delete post
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.authorId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // E5 — mark reposts of this post so the frontend can render a "Пост удалён"
    // placeholder. onDelete SetNull will null their repostOfId on delete below.
    await prisma.post.updateMany({
      where: { repostOfId: req.params.id },
      data: { repostDeleted: true },
    });

    // Remove stale notifications referencing this post before deleting it
    await prisma.notification.deleteMany({
      where: { link: { contains: post.id } },
    });

    await prisma.post.delete({
      where: { id: req.params.id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

export default router;
