import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

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
        authorId: { in: [...friendIds, req.userId!] }
      },
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
        _count: {
          select: { likes: true, comments: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });

    res.json(posts);
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

// Create post
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { content, imageUrl } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const post = await prisma.post.create({
      data: {
        content,
        imageUrl,
        authorId: req.userId!,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          }
        }
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

    res.json(post);
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// Like post
router.post('/:id/like', authenticate, async (req: AuthRequest, res) => {
  try {
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
    await prisma.like.deleteMany({
      where: {
        userId: req.userId,
        postId: req.params.id,
      }
    });

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

    res.status(201).json(comment);
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Failed to comment' });
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
