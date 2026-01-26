import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Send friend request
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: 'Receiver ID is required' });
    }

    if (receiverId === req.userId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // Check if request already exists
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.userId, receiverId },
          { requesterId: receiverId, receiverId: req.userId }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Friend request already exists' });
    }

    const friendship = await prisma.friendship.create({
      data: {
        requesterId: req.userId!,
        receiverId,
        status: 'pending',
      },
      include: {
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          }
        }
      }
    });

    res.status(201).json(friendship);
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Get friend requests (received)
router.get('/requests', authenticate, async (req: AuthRequest, res) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: {
        receiverId: req.userId,
        status: 'pending'
      },
      include: {
        requester: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
            city: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ error: 'Failed to get requests' });
  }
});

// Accept friend request
router.put('/:id/accept', authenticate, async (req: AuthRequest, res) => {
  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id: req.params.id }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendship.receiverId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updated = await prisma.friendship.update({
      where: { id: req.params.id },
      data: { status: 'accepted' },
      include: {
        requester: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          }
        }
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// Reject friend request
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id: req.params.id }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendship.receiverId !== req.userId && friendship.requesterId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.friendship.delete({
      where: { id: req.params.id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete friendship error:', error);
    res.status(500).json({ error: 'Failed to delete friendship' });
  }
});

// Get friends
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: req.userId, status: 'accepted' },
          { receiverId: req.userId, status: 'accepted' }
        ]
      },
      include: {
        requester: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
            city: true,
          }
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
            city: true,
          }
        }
      }
    });

    // Map to get the friend (not the current user)
    const friends = friendships.map(f => {
      return f.requesterId === req.userId ? f.receiver : f.requester;
    });

    res.json(friends);
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

export default router;
