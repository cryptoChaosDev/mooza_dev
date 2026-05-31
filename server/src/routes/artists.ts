import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { uploadArtistAvatar, uploadArtistBanner } from '../middleware/upload';
import { Prisma, ArtistType } from '@prisma/client';
import crypto from 'crypto';
import { tgEvent } from '../utils/telegram';

const router = Router();

// BigInt → Number for JSON serialization (listeners field)
function serializeArtist(artist: any) {
  return {
    ...artist,
    listeners: artist.listeners !== undefined ? Number(artist.listeners) : undefined,
  };
}

// Helper: check if user is a member of the artist
async function isMember(artistId: string, userId: string): Promise<boolean> {
  return !!(await prisma.userArtist.findFirst({ where: { artistId, userId } }));
}

// ── GET /api/artists/suggest?q= ─────────────────────────────────────────────
router.get('/suggest', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) return res.json([]);

    const artists = await prisma.artist.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        status: 'DRAFT',
        submittedById: null,
      },
      include: {
        genres: { include: { genre: { select: { id: true, name: true } } } },
      },
      take: 8,
      orderBy: { name: 'asc' },
    });

    res.json(artists.map(a => ({
      id: a.id,
      name: a.name,
      thumb: a.avatar,
      genres: a.genres.map((ag: any) => ({ id: ag.genre.id, name: ag.genre.name })),
    })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to suggest artists' });
  }
});

// ── GET /api/artists/following ──────────────────────────────────────────────
router.get('/following', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const follows = await prisma.artistFollower.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { artist: { include: { _count: { select: { followers: true } } } } },
    });

    const artists = follows.map((f) => ({
      id: f.artist.id,
      name: f.artist.name,
      avatar: f.artist.avatar,
      city: f.artist.city,
      type: f.artist.type,
      listeners: Number(f.artist.listeners),
      followersCount: f.artist._count.followers,
      followedAt: f.createdAt,
    }));

    return res.json(artists);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch followed artists' });
  }
});

// ── GET /api/artists/:id ─────────────────────────────────────────────────────
router.get('/:id', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.userId;

    const artist = await prisma.artist.findUnique({
      where: { id },
      include: {
        genres: { include: { genre: true } },
        _count: { select: { followers: true } },
        followers: currentUserId
          ? { where: { userId: currentUserId }, select: { userId: true } }
          : { take: 0, select: { userId: true } },
        userArtists: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true },
            },
            profession: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!artist) {
      return res.status(404).json({ error: 'Артист не найден' });
    }

    const { genres, _count, followers, userArtists, ...rest } = artist;

    return res.json(serializeArtist({
      ...rest,
      genres: genres.map((ag) => ag.genre),
      followersCount: _count.followers,
      isFollowed: currentUserId ? followers.some((f) => f.userId === currentUserId) : false,
      members: userArtists.map((ua: any) => ({
        membershipId: ua.id,
        id: ua.user.id,
        firstName: ua.user.firstName,
        lastName: ua.user.lastName,
        avatar: ua.user.avatar,
        nickname: ua.user.nickname,
        profession: ua.profession ?? null,
        isOwner: ua.isOwner,
        inviteStatus: ua.inviteStatus,
      })),
    }));
  } catch (err) {
    console.error('[artists] GET /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/artists ────────────────────────────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      name,
      type,
      city,
      tourReady,
      description,
      socialLinks,
      bandLink,
      listeners,
      genreIds,
    } = req.body as {
      name: string;
      type?: string;
      city?: string;
      tourReady?: string;
      description?: string;
      socialLinks?: Record<string, string>;
      bandLink?: string;
      listeners?: number;
      genreIds?: string[];
    };

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Имя артиста обязательно' });
    }

    const artist = await prisma.artist.create({
      data: {
        name: name.trim(),
        type: type as ArtistType | undefined ?? undefined,
        city,
        tourReady,
        description,
        socialLinks: socialLinks ?? undefined,
        bandLink,
        listeners: listeners ?? 0,
        genres: genreIds?.length
          ? { create: genreIds.map((gId) => ({ genreId: gId })) }
          : undefined,
        userArtists: {
          create: { userId, isOwner: true },
        },
      },
      include: {
        genres: { include: { genre: true } },
        _count: { select: { followers: true } },
        userArtists: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true },
            },
          },
        },
      },
    });

    try {
      const creator = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      tgEvent.artist('создан', artist.name, `${creator?.firstName} ${creator?.lastName}`);
    } catch {}

    return res.status(201).json(serializeArtist({
      ...artist,
      genres: artist.genres.map((ag) => ag.genre),
      followersCount: artist._count.followers,
      isFollowed: false,
      members: artist.userArtists.map((ua) => ({
        id: ua.user.id,
        firstName: ua.user.firstName,
        lastName: ua.user.lastName,
        avatar: ua.user.avatar,
        nickname: ua.user.nickname,
      })),
    }));
  } catch (err) {
    console.error('[artists] POST /', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PUT /api/artists/:id ─────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    if (!(await isMember(id, userId))) {
      return res.status(403).json({ error: 'Нет прав для редактирования' });
    }

    const {
      name,
      type,
      city,
      tourReady,
      description,
      socialLinks,
      bandLink,
      listeners,
      genreIds,
    } = req.body as {
      name?: string;
      type?: string;
      city?: string;
      tourReady?: string;
      description?: string;
      socialLinks?: Record<string, string>;
      bandLink?: string;
      listeners?: number;
      genreIds?: string[];
    };

    const updateData: Prisma.ArtistUpdateInput = {};
    if (name !== undefined) updateData.name = name.trim();
    if (type !== undefined) updateData.type = type as ArtistType;
    if (city !== undefined) updateData.city = city;
    if (tourReady !== undefined) updateData.tourReady = tourReady;
    if (description !== undefined) updateData.description = description;
    if (socialLinks !== undefined) updateData.socialLinks = socialLinks;
    if (bandLink !== undefined) updateData.bandLink = bandLink;
    if (listeners !== undefined) updateData.listeners = listeners;

    if (genreIds !== undefined) {
      updateData.genres = {
        deleteMany: {},
        create: genreIds.map((gId) => ({ genreId: gId })),
      };
    }

    const artist = await prisma.artist.update({
      where: { id },
      data: updateData,
      include: {
        genres: { include: { genre: true } },
        _count: { select: { followers: true } },
        followers: { where: { userId }, select: { userId: true } },
        userArtists: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true },
            },
          },
        },
      },
    });

    return res.json(serializeArtist({
      ...artist,
      genres: artist.genres.map((ag) => ag.genre),
      followersCount: artist._count.followers,
      isFollowed: artist.followers.some((f) => f.userId === userId),
      members: artist.userArtists.map((ua) => ({
        id: ua.user.id,
        firstName: ua.user.firstName,
        lastName: ua.user.lastName,
        avatar: ua.user.avatar,
        nickname: ua.user.nickname,
      })),
    }));
  } catch (err) {
    console.error('[artists] PUT /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/artists/:id/avatar ─────────────────────────────────────────────
router.post(
  '/:id/avatar',
  authenticate,
  uploadArtistAvatar.single('avatar'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      if (!(await isMember(id, userId))) {
        return res.status(403).json({ error: 'Нет прав' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
      }

      const avatarPath = `/uploads/artists/avatars/${req.file.filename}`;
      const updated = await prisma.artist.update({
        where: { id },
        data: { avatar: avatarPath },
        select: { id: true, avatar: true },
      });

      return res.json(updated);
    } catch (err) {
      console.error('[artists] POST /:id/avatar', err);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  },
);

// ── POST /api/artists/:id/banner ─────────────────────────────────────────────
router.post(
  '/:id/banner',
  authenticate,
  uploadArtistBanner.single('banner'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      if (!(await isMember(id, userId))) {
        return res.status(403).json({ error: 'Нет прав' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
      }

      const bannerPath = `/uploads/artists/banners/${req.file.filename}`;
      const updated = await prisma.artist.update({
        where: { id },
        data: { banner: bannerPath },
        select: { id: true, banner: true },
      });

      return res.json(updated);
    } catch (err) {
      console.error('[artists] POST /:id/banner', err);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  },
);

// ── POST /api/artists/:id/follow ─────────────────────────────────────────────
router.post('/:id/follow', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    await prisma.artistFollower.upsert({
      where: { userId_artistId: { userId, artistId: id } },
      create: { userId, artistId: id },
      update: {},
    });

    return res.json({ followed: true });
  } catch (err) {
    console.error('[artists] POST /:id/follow', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/artists/:id/follow ───────────────────────────────────────────
router.delete('/:id/follow', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    await prisma.artistFollower.deleteMany({
      where: { userId, artistId: id },
    });

    return res.json({ followed: false });
  } catch (err) {
    console.error('[artists] DELETE /:id/follow', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/:id/submit ────────────────────────────────────────────
// Member submits artist card for admin moderation
router.patch('/:id/submit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    if (!(await isMember(id, userId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const artist = await prisma.artist.findUnique({ where: { id } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    if (!['DRAFT', 'REJECTED'].includes(artist.status)) {
      return res.status(400).json({ error: 'Карточка уже отправлена на модерацию' });
    }

    const updated = await prisma.artist.update({
      where: { id },
      data: { status: 'PENDING', submittedById: userId, rejectionReason: null },
    });

    return res.json(serializeArtist(updated));
  } catch (err) {
    console.error('[artists] PATCH /:id/submit', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/:id/submit-proof ─────────────────────────────────────
// Member submits verification proof URL (link to post with the code)
router.patch('/:id/submit-proof', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { proofUrl } = req.body as { proofUrl: string };

    if (!(await isMember(id, userId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    if (!proofUrl || !proofUrl.trim()) {
      return res.status(400).json({ error: 'proofUrl обязателен' });
    }

    const artist = await prisma.artist.findUnique({ where: { id } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    if (artist.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Карточка должна быть одобрена перед верификацией' });
    }

    if (!artist.verificationCode) {
      return res.status(400).json({ error: 'Код верификации ещё не выдан' });
    }

    const updated = await prisma.artist.update({
      where: { id },
      data: { verificationProofUrl: proofUrl.trim() },
    });

    return res.json(serializeArtist(updated));
  } catch (err) {
    console.error('[artists] PATCH /:id/submit-proof', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/artists/:id/join-request — request to join as member ──────────
router.post('/:id/join-request', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const artistId = req.params.id;
    const { professionIds } = req.body as { professionIds: string[] };
    if (!professionIds?.length) return res.status(400).json({ error: 'Профессия обязательна' });

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const actorName = `${actor?.firstName ?? ''} ${actor?.lastName ?? ''}`.trim();

    const memberships: any[] = [];
    for (const professionId of professionIds) {
      const existing = await prisma.userArtist.findUnique({
        where: { userId_artistId_professionId: { userId, artistId, professionId } },
      });
      if (existing) continue;
      const profession = await prisma.profession.findUnique({ where: { id: professionId }, select: { name: true } });
      const membership = await prisma.userArtist.create({
        data: { userId, artistId, professionId, inviteStatus: 'PENDING', isOwner: false },
      });
      memberships.push({ membership, roleName: profession?.name ?? '' });
    }

    if (!memberships.length) return res.status(400).json({ error: 'Запрос уже отправлен' });

    const roleNames = memberships.map(m => m.roleName).filter(Boolean).join(', ');
    // Notify the artist owner
    const ownerMembership = await prisma.userArtist.findFirst({
      where: { artistId, isOwner: true },
      select: { userId: true },
    });
    const notifyIds: string[] = ownerMembership ? [ownerMembership.userId] : [];
    // Also notify system admins if no owner found
    if (!notifyIds.length) {
      const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
      notifyIds.push(...admins.map(a => a.id));
    }
    await Promise.all(notifyIds.map(recipientId =>
      prisma.notification.create({
        data: {
          userId: recipientId, actorId: userId, type: 'artist_join_request',
          title: 'Запрос на участие',
          body: `${actorName} запрашивает роль «${roleNames}» в «${artist.name}»`,
          link: `/artist/${artistId}`,
        },
      })
    ));

    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/artists/:id/memberships/pending — pending join requests for artist ─
router.get('/:id/memberships/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const artistId = req.params.id;
    const isOwner = await prisma.userArtist.findFirst({ where: { artistId, userId: req.userId!, isOwner: true } });
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { isAdmin: true } });
    if (!isOwner && !me?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const memberships = await prisma.userArtist.findMany({
      where: { artistId, inviteStatus: 'PENDING' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        profession: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(memberships);
  } catch {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Helper: check if current user can manage membership (artist owner or system admin)
async function canManageMembership(membershipId: string, userId: string): Promise<{ ua: any; allowed: boolean }> {
  const ua = await prisma.userArtist.findUnique({
    where: { id: membershipId },
    include: { artist: { select: { name: true } }, profession: { select: { name: true } } },
  });
  if (!ua) return { ua: null, allowed: false };
  const isArtistOwner = await prisma.userArtist.findFirst({ where: { artistId: ua.artistId, userId, isOwner: true } });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return { ua, allowed: !!(isArtistOwner || me?.isAdmin) };
}

// ── PATCH /api/artists/memberships/:id/approve ───────────────────────────────
router.patch('/memberships/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { ua, allowed } = await canManageMembership(req.params.id, req.userId!);
    if (!ua) return res.status(404).json({ error: 'Not found' });
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    await prisma.userArtist.update({ where: { id: req.params.id }, data: { inviteStatus: 'ACCEPTED' } });
    await prisma.notification.create({
      data: {
        userId: ua.userId, actorId: req.userId, type: 'artist_join_approved',
        title: 'Участие подтверждено',
        body: `Ваш запрос на роль «${ua.profession?.name ?? ''}» в «${ua.artist.name}» подтверждён!`,
        link: `/profile/${ua.userId}`,
      },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/memberships/:id/reject ────────────────────────────────
router.patch('/memberships/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { ua, allowed } = await canManageMembership(req.params.id, req.userId!);
    if (!ua) return res.status(404).json({ error: 'Not found' });
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    await prisma.userArtist.delete({ where: { id: req.params.id } });
    await prisma.notification.create({
      data: {
        userId: ua.userId, actorId: req.userId, type: 'artist_join_rejected',
        title: 'Запрос отклонён',
        body: `Ваш запрос на роль «${ua.profession?.name ?? ''}» в «${ua.artist.name}» отклонён.`,
        link: `/profile/${ua.userId}`,
      },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/artists/:id/invite-link — generate invite link for unregistered user
router.post('/:id/invite-link', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const artistId = req.params.id;
    const { professionId } = req.body;

    // Check current user is owner/admin of artist
    const myMembership = await prisma.userArtist.findFirst({
      where: { artistId, userId: meId, isOwner: true, inviteStatus: 'ACCEPTED' },
    });
    const me = await prisma.user.findUnique({ where: { id: meId }, select: { isAdmin: true } });
    if (!myMembership && !me?.isAdmin) {
      return res.status(403).json({ error: 'Only artist owner can invite' });
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
    if (!artist) return res.status(404).json({ error: 'Artist not found' });

    // Generate unique token using artistId + professionId + timestamp (base64)
    const payload = Buffer.from(JSON.stringify({
      artistId, artistName: artist.name, professionId: professionId || null,
      ts: Date.now(),
    })).toString('base64url');

    const link = `https://moooza.ru/register?artistInvite=${payload}`;
    res.json({ link, token: payload });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
