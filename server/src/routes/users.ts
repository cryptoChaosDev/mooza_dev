import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import path from 'path';
import fs from 'fs';

const router = Router();

const userSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatar: true,
  bio: true,
  country: true,
  city: true,
  role: true,
  genres: true,
  fieldOfActivityId: true,
  fieldOfActivity: { select: { id: true, name: true } },
  userProfessions: {
    include: {
      profession: {
        include: { fieldOfActivity: { select: { id: true, name: true } } },
      },
    },
  },
  userArtists: {
    include: { artist: { select: { id: true, name: true } } },
  },
  employerId: true,
  employer: { select: { id: true, name: true, inn: true, ogrn: true } },
  vkLink: true,
  youtubeLink: true,
  telegramLink: true,
  createdAt: true,
} as const;

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: userSelect,
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Upload avatar
router.post('/me/avatar', authenticate, upload.single('avatar'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get current user to delete old avatar
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { avatar: true }
    });

    // Delete old avatar file if exists
    if (currentUser?.avatar) {
      const oldAvatarPath = path.join(process.cwd(), 'uploads', 'avatars', path.basename(currentUser.avatar));
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    // Update user with new avatar URL
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { avatar: avatarUrl },
      select: userSelect,
    });

    res.json(user);
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Update current user
router.put('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      firstName, lastName, nickname, bio, country, city, role, genres,
      vkLink, youtubeLink, telegramLink,
      fieldOfActivityId, employerId,
      userProfessions, artistIds,
    } = req.body;

    // Update basic fields
    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (nickname !== undefined) updateData.nickname = nickname;
    if (bio !== undefined) updateData.bio = bio;
    if (country !== undefined) updateData.country = country;
    if (city !== undefined) updateData.city = city;
    if (role !== undefined) updateData.role = role;
    if (genres !== undefined) updateData.genres = genres;
    if (vkLink !== undefined) updateData.vkLink = vkLink;
    if (youtubeLink !== undefined) updateData.youtubeLink = youtubeLink;
    if (telegramLink !== undefined) updateData.telegramLink = telegramLink;
    if (fieldOfActivityId !== undefined) updateData.fieldOfActivityId = fieldOfActivityId || null;
    if (employerId !== undefined) updateData.employerId = employerId || null;

    // Handle userProfessions: delete old, create new
    if (userProfessions !== undefined) {
      await prisma.userProfession.deleteMany({ where: { userId: req.userId } });
      if (userProfessions.length > 0) {
        updateData.userProfessions = {
          create: userProfessions.map((up: { professionId: string; features?: string[] }) => ({
            professionId: up.professionId,
            features: up.features || [],
          })),
        };
      }
    }

    // Handle artists: delete old, create new
    if (artistIds !== undefined) {
      await prisma.userArtist.deleteMany({ where: { userId: req.userId } });
      if (artistIds.length > 0) {
        updateData.userArtists = {
          create: artistIds.map((artistId: string) => ({ artistId })),
        };
      }
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: userSelect,
    });

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Search users
router.get('/search', authenticate, async (req: AuthRequest, res) => {
  try {
    const { query, role, city, genre } = req.query;

    const where: any = {
      id: { not: req.userId },
    };

    if (query) {
      where.OR = [
        { firstName: { contains: query as string, mode: 'insensitive' } },
        { lastName: { contains: query as string, mode: 'insensitive' } },
        { nickname: { contains: query as string, mode: 'insensitive' } },
        { bio: { contains: query as string, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (city) {
      where.city = { contains: city as string, mode: 'insensitive' };
    }

    if (genre) {
      where.genres = { has: genre as string };
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        avatar: true,
        bio: true,
        country: true,
        city: true,
        role: true,
        genres: true,
        fieldOfActivity: { select: { id: true, name: true } },
        userProfessions: {
          include: {
            profession: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' }
      ],
      take: 50,
    });

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        ...userSelect,
        _count: {
          select: {
            posts: true,
            sentRequests: { where: { status: 'accepted' } },
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
