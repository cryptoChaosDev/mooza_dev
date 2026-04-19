import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitToUser, notifyUser } from '../socket';

const router = Router();

// Send friend request
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: 'Не указан получатель' });
    }

    if (receiverId === req.userId) {
      return res.status(400).json({ error: 'Нельзя отправить заявку самому себе' });
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
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Вы уже друзья с этим пользователем' });
      }
      if (existing.requesterId === receiverId) {
        return res.status(400).json({ error: 'Этот пользователь уже отправил вам заявку. Проверьте вкладку «Заявки»' });
      }
      return res.status(400).json({ error: 'Вы уже отправили заявку этому пользователю' });
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

    // Notify receiver about new friend request (include requester info)
    const requester = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    // Save notification to DB
    const notification = await prisma.notification.create({
      data: {
        userId: receiverId,
        actorId: req.userId!,
        type: 'friend_request',
        title: 'Заявка в друзья',
        body: `${requester?.firstName} ${requester?.lastName} хочет добавить вас в друзья`,
        link: `/friends?tab=requests`,
      },
      include: { actor: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });

    notifyUser(receiverId, 'friend_request', { friendship, requester }, {
      title: 'Заявка в друзья',
      body: `${requester?.firstName} ${requester?.lastName} хочет добавить вас в друзья`,
      link: '/friends?tab=requests',
    });
    emitToUser(receiverId, 'new_notification', notification);

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
            isPremium: true,
            isVerified: true,
            isBlocked: true,
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

// Get sent friend requests (pending, sent by current user)
router.get('/sent', authenticate, async (req: AuthRequest, res) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: { requesterId: req.userId, status: 'pending' },
      include: {
        receiver: {
          select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true, role: true, city: true, isPremium: true, isVerified: true, isBlocked: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(requests);
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ error: 'Failed to get sent requests' });
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

    // Save notification to DB
    const accepter = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    const notification = await prisma.notification.create({
      data: {
        userId: updated.requester.id,
        actorId: req.userId!,
        type: 'friend_accepted',
        title: 'Вас добавили в друзья',
        body: `${accepter?.firstName} ${accepter?.lastName} принял(а) вашу заявку`,
        link: `/profile/${req.userId}`,
      },
      include: { actor: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });

    // Notify the original requester that their request was accepted
    notifyUser(updated.requester.id, 'friend_accepted', { friendship: updated }, {
      title: 'Вас добавили в друзья',
      body: `${accepter?.firstName} ${accepter?.lastName} принял(а) вашу заявку`,
      link: `/profile/${req.userId}`,
    });
    emitToUser(updated.requester.id, 'new_notification', notification);

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
            isPremium: true,
            isVerified: true,
            isBlocked: true,
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
            isPremium: true,
            isVerified: true,
            isBlocked: true,
          }
        }
      }
    });

    // Return { friendshipId, user } so frontend can unfriend
    const friends = friendships.map(f => ({
      friendshipId: f.id,
      user: f.requesterId === req.userId ? f.receiver : f.requester,
    }));

    res.json(friends);
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

export default router;
