import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const MEMBER_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true } },
  profession: { select: { id: true, name: true } },
  invitedBy: { select: { id: true, firstName: true, lastName: true } },
};

const GROUP_INCLUDE = {
  genres: { include: { genre: { select: { id: true, name: true } } } },
  userArtists: { include: MEMBER_INCLUDE },
  _count: { select: { followers: true } },
};

function serializeGroup(g: any) {
  return { ...g, listeners: g.listeners !== undefined ? Number(g.listeners) : undefined };
}

// ── POST /api/groups ──────────────────────────────────────────────────────────
// Create a group (type=GROUP), creator becomes owner
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { name, description, city, type = 'GROUP' } = req.body as {
      name: string; description?: string; city?: string; type?: string;
    };

    if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });

    const group = await prisma.artist.create({
      data: {
        name: name.trim(),
        description,
        city,
        type: type as any,
        status: 'DRAFT',
        submittedById: meId,
        userArtists: {
          create: { userId: meId, isOwner: true, inviteStatus: 'ACCEPTED' },
        },
      },
      include: GROUP_INCLUDE,
    });

    return res.status(201).json(serializeGroup(group));
  } catch (err) {
    console.error('[groups] POST /', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/groups/my ────────────────────────────────────────────────────────
// Groups where I'm a member (accepted) or owner
router.get('/my', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    // The profile «Артисты» rail shows EVERY artist the user created or is an
    // accepted member of — regardless of type (SOLO/GROUP/COVER_GROUP/…).
    const groups = await prisma.artist.findMany({
      where: {
        OR: [
          { submittedById: meId },
          { userArtists: { some: { userId: meId, inviteStatus: 'ACCEPTED' } } },
        ],
      },
      include: GROUP_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(groups.map(serializeGroup));
  } catch (err) {
    console.error('[groups] GET /my', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/groups/invites ───────────────────────────────────────────────────
// My pending invites
router.get('/invites', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const invites = await prisma.userArtist.findMany({
      where: { userId: meId, inviteStatus: 'PENDING' },
      include: {
        artist: { include: { userArtists: { where: { isOwner: true }, include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } } } },
        profession: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(invites.map(inv => ({
      id: inv.id,
      group: serializeGroup(inv.artist),
      profession: inv.profession,
      invitedBy: inv.invitedBy,
      createdAt: inv.createdAt,
    })));
  } catch (err) {
    console.error('[groups] GET /invites', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/groups/:id ───────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.artist.findUnique({
      where: { id: req.params.id },
      include: GROUP_INCLUDE,
    });
    if (!group) return res.status(404).json({ error: 'Не найдено' });
    return res.json(serializeGroup(group));
  } catch (err) {
    console.error('[groups] GET /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/groups/:id ─────────────────────────────────────────────────────
// Edit group info (owner only)
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const group = await prisma.artist.findUnique({ where: { id: req.params.id } });
    if (!group) return res.status(404).json({ error: 'Не найдено' });
    if (group.submittedById !== meId) return res.status(403).json({ error: 'Только владелец может редактировать' });

    const { name, description, city, type, bandLink, socialLinks } = req.body;
    const updated = await prisma.artist.update({
      where: { id: group.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(city !== undefined && { city }),
        ...(type !== undefined && { type }),
        ...(bandLink !== undefined && { bandLink }),
        ...(socialLinks !== undefined && { socialLinks }),
      },
      include: GROUP_INCLUDE,
    });
    return res.json(serializeGroup(updated));
  } catch (err) {
    console.error('[groups] PATCH /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/groups/:id/submit ───────────────────────────────────────────────
// Submit group for moderation (DRAFT → PENDING)
router.post('/:id/submit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const group = await prisma.artist.findUnique({ where: { id: req.params.id } });
    if (!group) return res.status(404).json({ error: 'Не найдено' });
    if (group.submittedById !== meId) return res.status(403).json({ error: 'Только владелец может подать на модерацию' });
    if (group.status !== 'DRAFT' && group.status !== 'REJECTED') {
      return res.status(400).json({ error: 'Группа уже отправлена или одобрена' });
    }
    const updated = await prisma.artist.update({
      where: { id: group.id },
      data: { status: 'PENDING' },
      include: GROUP_INCLUDE,
    });
    return res.json(serializeGroup(updated));
  } catch (err) {
    console.error('[groups] POST /:id/submit', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/groups/:id/invite ───────────────────────────────────────────────
// Invite a friend with a role (owner only)
router.post('/:id/invite', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { friendId, professionId } = req.body as { friendId: string; professionId: string };

    if (!friendId || !professionId) return res.status(400).json({ error: 'friendId и professionId обязательны' });

    const group = await prisma.artist.findUnique({ where: { id: req.params.id } });
    if (!group) return res.status(404).json({ error: 'Не найдено' });
    if (group.submittedById !== meId) return res.status(403).json({ error: 'Только владелец может приглашать' });

    // Check friend is actually a friend (connection exists)
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: meId, receiverId: friendId, status: 'accepted' },
          { requesterId: friendId, receiverId: meId, status: 'accepted' },
        ],
      },
    });
    if (!friendship) return res.status(400).json({ error: 'Пользователь не является другом' });

    // Check not already a member
    const existing = await prisma.userArtist.findFirst({
      where: { userId: friendId, artistId: group.id },
    });
    if (existing) return res.status(409).json({ error: 'Пользователь уже в группе или приглашён' });

    const membership = await prisma.userArtist.create({
      data: {
        userId: friendId,
        artistId: group.id,
        professionId,
        inviteStatus: 'PENDING',
        invitedById: meId,
        isOwner: false,
      },
      include: MEMBER_INCLUDE,
    });

    // Send notification
    try {
      const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
      await prisma.notification.create({
        data: {
          userId: friendId,
          actorId: meId,
          type: 'group_invite',
          title: `${me?.firstName} ${me?.lastName} приглашает в группу «${group.name}»`,
          body: `Роль: ${membership.profession?.name ?? '—'}`,
          link: `/artist/${group.id}`,
        },
      });
    } catch {}

    return res.status(201).json(membership);
  } catch (err) {
    console.error('[groups] POST /:id/invite', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/groups/invites/:membershipId/accept ────────────────────────────
router.patch('/invites/:membershipId/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const membership = await prisma.userArtist.findUnique({ where: { id: req.params.membershipId } });
    if (!membership) return res.status(404).json({ error: 'Приглашение не найдено' });
    if (membership.userId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (membership.inviteStatus !== 'PENDING') return res.status(400).json({ error: 'Приглашение уже обработано' });

    const updated = await prisma.userArtist.update({
      where: { id: membership.id },
      data: { inviteStatus: 'ACCEPTED' },
      include: MEMBER_INCLUDE,
    });

    // Notify owner + auto-create connection
    try {
      const group = await prisma.artist.findUnique({ where: { id: membership.artistId }, select: { name: true, submittedById: true } });
      const me = await prisma.user.findUnique({ where: { id: meId }, select: { firstName: true, lastName: true } });
      if (group?.submittedById) {
        await prisma.notification.create({
          data: {
            userId: group.submittedById,
            actorId: meId,
            type: 'group_invite_accepted',
            title: `${me?.firstName} ${me?.lastName} вступил(а) в группу «${group.name}»`,
            body: '',
            link: `/groups/${membership.artistId}`,
          },
        });
      }

      // Auto-create connection between inviter and new member based on member's profession
      const inviterId = membership.invitedById;
      if (inviterId && membership.professionId) {
        const existingConn = await prisma.connection.findFirst({
          where: {
            OR: [
              { requesterId: inviterId, receiverId: meId },
              { requesterId: meId, receiverId: inviterId },
            ],
          },
        });

        if (!existingConn) {
          // First try services matching the invited profession, fallback to all member's services
          let userServices = await prisma.userService.findMany({
            where: { userId: meId, professionId: membership.professionId },
            select: { serviceId: true },
          });
          if (userServices.length === 0) {
            userServices = await prisma.userService.findMany({
              where: { userId: meId },
              select: { serviceId: true },
            });
          }

          await prisma.connection.create({
            data: {
              requesterId: inviterId,
              receiverId: meId,
              status: 'ACCEPTED',
              professionId: membership.professionId,
              ...(userServices.length > 0 && {
                services: { create: userServices.map(us => ({ serviceId: us.serviceId })) },
              }),
            },
          });
        }
      }
    } catch {}

    return res.json(updated);
  } catch (err) {
    console.error('[groups] PATCH /invites/:id/accept', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/groups/invites/:membershipId/decline ───────────────────────────
router.patch('/invites/:membershipId/decline', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const membership = await prisma.userArtist.findUnique({ where: { id: req.params.membershipId } });
    if (!membership) return res.status(404).json({ error: 'Приглашение не найдено' });
    if (membership.userId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (membership.inviteStatus !== 'PENDING') return res.status(400).json({ error: 'Приглашение уже обработано' });

    await prisma.userArtist.update({
      where: { id: membership.id },
      data: { inviteStatus: 'DECLINED' },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[groups] PATCH /invites/:id/decline', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/groups/:id ────────────────────────────────────────────────────
// Delete group entirely (owner only)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const group = await prisma.artist.findUnique({ where: { id: req.params.id } });
    if (!group) return res.status(404).json({ error: 'Не найдено' });
    if (group.submittedById !== meId) return res.status(403).json({ error: 'Только владелец может удалить группу' });

    // Cascade: remove members, followers, genres, then the group itself
    await prisma.$transaction([
      prisma.userArtist.deleteMany({ where: { artistId: group.id } }),
      prisma.artistFollower.deleteMany({ where: { artistId: group.id } }),
      prisma.artistGenre.deleteMany({ where: { artistId: group.id } }),
      prisma.artist.delete({ where: { id: group.id } }),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[groups] DELETE /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/groups/:id/members/:membershipId ──────────────────────────────
// Remove member (owner only) or leave (self)
router.delete('/:id/members/:membershipId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const group = await prisma.artist.findUnique({ where: { id: req.params.id } });
    if (!group) return res.status(404).json({ error: 'Не найдено' });

    const membership = await prisma.userArtist.findUnique({ where: { id: req.params.membershipId } });
    if (!membership || membership.artistId !== group.id) return res.status(404).json({ error: 'Участник не найден' });

    // Owner can remove anyone; member can remove themselves
    if (group.submittedById !== meId && membership.userId !== meId) {
      return res.status(403).json({ error: 'Нет прав' });
    }
    if (membership.isOwner) return res.status(400).json({ error: 'Нельзя удалить владельца' });

    await prisma.userArtist.delete({ where: { id: membership.id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[groups] DELETE /:id/members/:membershipId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/groups/:id/transfer-owner ─────────────────────────────────────
// Transfer ownership to another member, then remove current owner
router.patch('/:id/transfer-owner', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const artistId = req.params.id;
    const { newOwnerMembershipId } = req.body as { newOwnerMembershipId: string };

    if (!newOwnerMembershipId) return res.status(400).json({ error: 'newOwnerMembershipId обязателен' });

    // Verify caller is the current owner
    const myMembership = await prisma.userArtist.findFirst({ where: { artistId, userId: meId, isOwner: true } });
    if (!myMembership) return res.status(403).json({ error: 'Вы не являетесь владельцем' });

    // Verify new owner is an accepted member of this artist
    const newOwnerMembership = await prisma.userArtist.findUnique({ where: { id: newOwnerMembershipId } });
    if (!newOwnerMembership || newOwnerMembership.artistId !== artistId || newOwnerMembership.inviteStatus !== 'ACCEPTED') {
      return res.status(400).json({ error: 'Некорректный участник для передачи прав' });
    }

    // Transfer ownership
    await prisma.$transaction([
      prisma.userArtist.update({ where: { id: newOwnerMembershipId }, data: { isOwner: true } }),
      prisma.artist.update({ where: { id: artistId }, data: { submittedById: newOwnerMembership.userId } }),
      prisma.userArtist.delete({ where: { id: myMembership.id } }),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[groups] PATCH /:id/transfer-owner', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/groups/:id/leave ─────────────────────────────────────────────
// Non-owner member leaves the group
router.delete('/:id/leave', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const artistId = req.params.id;

    const myMembership = await prisma.userArtist.findFirst({ where: { artistId, userId: meId } });
    if (!myMembership) return res.status(404).json({ error: 'Вы не участник' });
    if (myMembership.isOwner) return res.status(400).json({ error: 'Владелец не может покинуть без передачи прав', code: 'OWNER_MUST_TRANSFER' });

    await prisma.userArtist.delete({ where: { id: myMembership.id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[groups] DELETE /:id/leave', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
