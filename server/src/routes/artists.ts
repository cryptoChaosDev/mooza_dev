import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { uploadArtistAvatar, uploadArtistBanner } from '../middleware/upload';
import { Prisma, ArtistType } from '@prisma/client';
import crypto from 'crypto';

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
          create: { userId },
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

    return res.json(updated);
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

    return res.json(updated);
  } catch (err) {
    console.error('[artists] PATCH /:id/submit-proof', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
