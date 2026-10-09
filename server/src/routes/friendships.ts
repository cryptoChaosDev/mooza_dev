import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitToUser } from '../socket';
import { tgEvent } from '../utils/telegram';
import { notify } from '../utils/notify';

const router = Router();

// Send friend request
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { receiverId } = req.body;

    if (!receiverId || typeof receiverId !== 'string') {
      return res.status(400).json({ error: 'Не указан получатель' });
    }

    if (receiverId === req.userId) {
      return res.status(400).json({ error: 'Нельзя отправить заявку самому себе' });
    }

    const receiverUser = await prisma.user.findUnique({ where: { id: receiverId }, select: { id: true, isBlocked: true } });
    if (!receiverUser) return res.status(404).json({ error: 'Пользователь не найден' });
    if (receiverUser.isBlocked) return res.status(403).json({ error: 'Пользователь заблокирован' });

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

    let friendship;
    try {
      friendship = await prisma.friendship.create({
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
    } catch (e: any) {
      // Двойной тап / параллельный запрос — уникальный ключ пары
      if (e?.code === 'P2002') return res.status(400).json({ error: 'Вы уже отправили заявку этому пользователю' });
      throw e;
    }

    // Notify receiver about new friend request (include requester info)
    const requester = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    // Defensive dedup: remove any stale friend-request notification for the same
    // pair before creating a fresh one, so a resend never stacks duplicates.
    await prisma.notification.deleteMany({
      where: { type: 'friend_request', actorId: req.userId!, userId: receiverId },
    });
    // Запись + new_notification + push (с учётом настроек) — через notify();
    // событие friend_request — для живого обновления списков заявок.
    await notify({
      userId: receiverId,
      actorId: req.userId!,
      type: 'friend_request',
      title: 'Заявка в друзья',
      body: `${requester?.firstName} ${requester?.lastName} хочет добавить вас в друзья`,
      link: `/friends/requests`,
    });
    emitToUser(receiverId, 'friend_request', { friendship, requester });

    // В лог команды — без ФИО (ПДн)
    try { tgEvent.friendRequest(); } catch {}

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

    if (friendship.status !== 'pending') {
      return res.status(409).json({ error: 'Заявка уже обработана' });
    }

    // Условная запись: параллельные accept/отмена не дадут двойных уведомлений
    const r = await prisma.friendship.updateMany({
      where: { id: req.params.id, receiverId: req.userId!, status: 'pending' },
      data: { status: 'accepted' },
    });
    if (r.count === 0) return res.status(409).json({ error: 'Заявка уже обработана' });

    const updated = await prisma.friendship.findUnique({
      where: { id: req.params.id },
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
    if (!updated) return res.status(404).json({ error: 'Friend request not found' });

    // Заявка обработана — её уведомление у меня больше не «непрочитанное»
    try {
      const cleared = await prisma.notification.updateMany({
        where: { type: 'friend_request', actorId: friendship.requesterId, userId: friendship.receiverId, read: false },
        data: { read: true },
      });
      if (cleared.count > 0) emitToUser(friendship.receiverId, 'notifications_read', { link: '/friends/requests' });
    } catch {}

    const accepter = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    // Notify the original requester (запись + сокет + push через notify)
    await notify({
      userId: updated.requester.id,
      actorId: req.userId!,
      type: 'friend_accepted',
      title: 'Вас добавили в друзья',
      body: `${accepter?.firstName} ${accepter?.lastName} принял(а) вашу заявку`,
      link: `/profile/${req.userId}`,
    });
    emitToUser(updated.requester.id, 'friend_accepted', { friendship: updated });

    // В лог команды — без ФИО (ПДн)
    try { tgEvent.friendAccept(); } catch {}
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

    // Remove the related friend-request notification(s) so a withdraw + resend
    // does not leave a stale duplicate notification on the receiver.
    const removedNotifs = await prisma.notification.deleteMany({
      where: {
        type: 'friend_request',
        actorId: friendship.requesterId,
        userId: friendship.receiverId,
      },
    });

    // deleteMany: повторный/параллельный запрос не падает в 500 (P2025)
    await prisma.friendship.deleteMany({
      where: { id: req.params.id }
    });

    // Живое обновление у второй стороны (списки заявок/друзей, бейджи)
    const otherId = friendship.requesterId === req.userId ? friendship.receiverId : friendship.requesterId;
    emitToUser(otherId, 'friendship_removed', { friendshipId: friendship.id });
    if (removedNotifs.count > 0) emitToUser(friendship.receiverId, 'notifications_read', { link: '/friends/requests' });

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
            lastSeenAt: true,
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
            lastSeenAt: true,
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
