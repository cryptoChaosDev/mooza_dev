import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitToUser, notifyUser } from '../socket';
import { uploadPostMedia } from '../middleware/upload';

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

// Get feed (posts from friends and own posts)
router.get('/feed', authenticate, async (req: AuthRequest, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    // Get user's friends
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: req.userId, status: 'accepted' },
          { receiverId: req.userId, status: 'accepted' }
        ]
      },
      select: { requesterId: true, receiverId: true }
    });

    const friendIds = friendships.map(f =>
      f.requesterId === req.userId ? f.receiverId : f.requesterId
    );

    const posts = await prisma.post.findMany({
      where: {
        authorId: { in: [...friendIds, req.userId!] },
        channelId: null,
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, avatar: true, role: true }
        },
        channel: {
          select: { id: true, name: true, avatar: true, ownerId: true }
        },
        likes: {
          where: { userId: req.userId },
          select: { id: true }
        },
        comments: {
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            },
            reactions: {
              select: { id: true, emoji: true, userId: true }
            }
          },
          orderBy: { createdAt: 'asc' },
        },
        reactions: {
          select: { id: true, emoji: true, userId: true }
        },
        _count: {
          select: { likes: true, comments: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });

    // Add isLiked property to each post
    const postsWithLikeStatus = posts.map(post => ({
      ...post,
      isLiked: post.likes.length > 0
    }));

    res.json(postsWithLikeStatus);
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

// Create post
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { content, imageUrl, audioUrl, audioName, channelId } = req.body;

    if (!content && !imageUrl && !audioUrl) {
      return res.status(400).json({ error: 'Post cannot be empty' });
    }

    // If channelId provided, verify user owns that channel
    if (channelId) {
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel || channel.ownerId !== req.userId) {
        return res.status(403).json({ error: 'Нет доступа к этому каналу' });
      }
    }

    const post = await prisma.post.create({
      data: {
        content: content || '',
        imageUrl: imageUrl || null,
        audioUrl: audioUrl || null,
        audioName: audioName || null,
        authorId: req.userId!,
        channelId: channelId || null,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatar: true, role: true } },
        channel: { select: { id: true, name: true, avatar: true, ownerId: true } },
      }
    });

    res.status(201).json(post);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
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
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              }
            }
          },
          orderBy: { createdAt: 'desc' }
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
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      select: { authorId: true },
    });

    const comment = await prisma.comment.create({
      data: {
        content,
        authorId: req.userId!,
        postId: req.params.id,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          }
        }
      }
    });

    // Notify post author (unless they commented on their own post)
    if (post && post.authorId !== req.userId) {
      const notification = await prisma.notification.create({
        data: {
          userId: post.authorId,
          actorId: req.userId!,
          type: 'post_reply',
          title: 'Новый комментарий',
          body: `${comment.author.firstName} ${comment.author.lastName}: ${comment.content.length > 60 ? comment.content.slice(0, 60) + '…' : comment.content}`,
          link: `/`,
        },
        include: { actor: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      });
      notifyUser(post.authorId, 'post_reply', { comment, postId: req.params.id }, {
        title: 'Новый комментарий',
        body: `${comment.author.firstName} ${comment.author.lastName}: ${comment.content.length > 60 ? comment.content.slice(0, 60) + '…' : comment.content}`,
        link: '/',
      });
      emitToUser(post.authorId, 'new_notification', notification);
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
        author: { select: { id: true, firstName: true, lastName: true, avatar: true, role: true } },
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
        author: { select: { id: true, firstName: true, lastName: true, avatar: true } },
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
