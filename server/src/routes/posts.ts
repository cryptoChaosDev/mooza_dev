import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitToUser, notifyUser } from '../socket';
import { uploadPostMedia } from '../middleware/upload';
import { tgLog } from '../utils/telegram';

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

// Get feed (all posts from the social network)
router.get('/feed', authenticate, async (req: AuthRequest, res) => {
  try {
    const { limit = 20, offset = 0, type, sort } = req.query;

    const orderBy: any = sort === 'popular'
      ? [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }]
      : { createdAt: 'desc' };

    const posts = await prisma.post.findMany({
      where: (type && type !== 'all' ? { type: String(type) } : undefined) as any,
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, isPremium: true, isVerified: true, isBlocked: true }
        },
        likes: {
          where: { userId: req.userId },
          select: { id: true }
        },
        savedBy: {
          where: { userId: req.userId },
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
      },
      orderBy,
      take: Number(limit),
      skip: Number(offset),
    });

    res.json(posts.map(post => ({ ...post, isLiked: post.likes.length > 0, isSaved: post.savedBy.length > 0 })));
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

// Create post
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { content, imageUrl, audioUrl, audioName, type, employmentStatus, pollOptions, pollEndsAt } = req.body;

    const isPoll = type === 'poll';
    if (isPoll) {
      if (!Array.isArray(pollOptions) || pollOptions.filter((o: string) => o?.trim()).length < 2) {
        return res.status(400).json({ error: 'Poll requires at least 2 non-empty options' });
      }
    } else if (!content && !imageUrl && !audioUrl && !(type === 'employment' && employmentStatus)) {
      return res.status(400).json({ error: 'Post cannot be empty' });
    }

    const post = await prisma.post.create({
      data: {
        content: content || '',
        type: type || 'blog',
        imageUrl: imageUrl || null,
        audioUrl: audioUrl || null,
        audioName: audioName || null,
        authorId: req.userId!,
        ...(isPoll ? {
          pollOptions: (pollOptions as string[]).filter(o => o?.trim()).map(text => ({ text, votes: 0 })),
          pollEndsAt: pollEndsAt ? new Date(pollEndsAt) : null,
        } : {}),
      } as any,
      include: {
        author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, isPremium: true, isVerified: true, isBlocked: true } },
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
          include: {
            author: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, isPremium: true, isVerified: true } },
          },
        },
      },
    });
    res.json(saved.map(s => ({ ...s.post, savedAt: s.createdAt })));
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
        _count: {
          select: { likes: true }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Add isLiked property
    const postWithLikeStatus = {
      ...post,
      isLiked: post.likes.length > 0
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
