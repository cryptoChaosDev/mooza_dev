import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { upload, uploadBanner, uploadPortfolio } from '../middleware/upload';
import path from 'path';
import fs from 'fs';

const router = Router();

const userServiceInclude = {
  profession: {
    select: {
      id: true,
      name: true,
      directionId: true,
      direction: {
        select: {
          id: true,
          name: true,
          allowedFilterTypes: true,
          customFilters: {
            select: {
              id: true,
              name: true,
              values: { select: { id: true, value: true }, orderBy: { sortOrder: 'asc' } },
            },
          },
          fieldOfActivity: { select: { id: true, name: true } },
        },
      },
    },
  },
  service: {
    select: {
      id: true,
      name: true,
    },
  },
  genres:          { select: { id: true, name: true } },
  workFormats:     { select: { id: true, name: true } },
  employmentTypes: { select: { id: true, name: true } },
  skillLevels:     { select: { id: true, name: true } },
  availabilities:  { select: { id: true, name: true } },
  geographies:     { select: { id: true, name: true } },
  selectedCustomFilterValues: { select: { id: true, filterId: true, value: true } },
} as const;

const userSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatar: true,
  bannerImage: true,
  bio: true,
  country: true,
  city: true,
  role: true,
  isAdmin: true,
  isBlocked: true,
  isPremium: true,
  isVerified: true,
  genres: true,
  fieldOfActivityId: true,
  fieldOfActivity: { select: { id: true, name: true } },
  userServices: { include: userServiceInclude },
  userArtists: {
    include: { artist: { select: { id: true, name: true } } },
  },
  employerId: true,
  employer: { select: { id: true, name: true, inn: true, ogrn: true } },
  socialLinks: true,
  channel: {
    select: {
      id: true,
      name: true,
      description: true,
      avatar: true,
      _count: { select: { subscriptions: true, posts: true } },
    },
  },
  termsAgreedAt: true,
  createdAt: true,
  portfolioFiles: { select: { id: true, url: true, originalName: true, size: true, mimeType: true, createdAt: true } },
  _count: {
    select: {
      sentRequests: { where: { status: 'accepted' } },
      receivedRequests: { where: { status: 'accepted' } },
    }
  },
} as const;

// Public profile select — no email/phone/isAdmin
const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatar: true,
  bannerImage: true,
  bio: true,
  country: true,
  city: true,
  role: true,
  isPremium: true,
  isVerified: true,
  isBlocked: true,
  genres: true,
  fieldOfActivityId: true,
  fieldOfActivity: { select: { id: true, name: true } },
  userServices: { include: userServiceInclude },
  userArtists: {
    include: { artist: { select: { id: true, name: true } } },
  },
  employerId: true,
  employer: { select: { id: true, name: true } },
  socialLinks: true,
  channel: {
    select: {
      id: true,
      name: true,
      description: true,
      avatar: true,
      _count: { select: { subscriptions: true, posts: true } },
    },
  },
  createdAt: true,
  portfolioFiles: { select: { id: true, url: true, originalName: true, size: true, mimeType: true, createdAt: true } },
  _count: {
    select: {
      sentRequests: { where: { status: 'accepted' } },
      receivedRequests: { where: { status: 'accepted' } },
    }
  },
} as const;

// Public: resolve user by nickname or UUID — no auth required
router.get('/handle/:handle', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const { handle } = req.params;
    // Try nickname first (strip leading @ if present)
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { nickname: { equals: cleanHandle, mode: 'insensitive' } },
          { id: cleanHandle },
        ],
      },
      select: publicUserSelect,
    });

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (error) {
    console.error('Get by handle error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

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

// Upload banner image
router.post('/me/banner', authenticate, uploadBanner.single('banner'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { bannerImage: true }
    });

    if (currentUser?.bannerImage) {
      const oldPath = path.join(process.cwd(), 'uploads', 'covers', path.basename(currentUser.bannerImage));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const bannerUrl = `/uploads/covers/${req.file.filename}`;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { bannerImage: bannerUrl },
      select: userSelect,
    });

    res.json(user);
  } catch (error) {
    console.error('Upload banner error:', error);
    res.status(500).json({ error: 'Failed to upload banner' });
  }
});

// Update current user
router.put('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      firstName, lastName, nickname, bio, country, city, role, genres,
      socialLinks,
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
    if (socialLinks !== undefined) updateData.socialLinks = socialLinks;
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

// Update user services (profession → service → filter axes)
router.put('/me/services', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const services: Array<{
      professionId: string;
      serviceId: string;
      genreIds?: string[];
      workFormatIds?: string[];
      employmentTypeIds?: string[];
      skillLevelIds?: string[];
      availabilityIds?: string[];
      geographyIds?: string[];
      priceFrom?: number;
      priceTo?: number;
      customFilterValueIds?: string[];
    }> = req.body;

    if (!Array.isArray(services)) {
      return res.status(400).json({ error: 'Body must be an array of service entries' });
    }

    const toConnect = (ids: string[] = []) => ids.map((id) => ({ id }));

    // Delete all existing user services and recreate
    await prisma.userService.deleteMany({ where: { userId: req.userId } });

    for (const us of services) {
      await prisma.userService.create({
        data: {
          userId: req.userId!,
          professionId: us.professionId,
          serviceId: us.serviceId,
          genres:          { connect: toConnect(us.genreIds) },
          workFormats:     { connect: toConnect(us.workFormatIds) },
          employmentTypes: { connect: toConnect(us.employmentTypeIds) },
          skillLevels:     { connect: toConnect(us.skillLevelIds) },
          availabilities:  { connect: toConnect(us.availabilityIds) },
          geographies:                 { connect: toConnect(us.geographyIds) },
          priceFrom:                   us.priceFrom ?? null,
          priceTo:                     us.priceTo ?? null,
          selectedCustomFilterValues:  { connect: toConnect(us.customFilterValueIds) },
        },
      });
    }

    // Return updated user services
    const userServices = await prisma.userService.findMany({
      where: { userId: req.userId },
      include: userServiceInclude,
    });

    res.json(userServices);
  } catch (error) {
    console.error('Update user services error:', error);
    res.status(500).json({ error: 'Failed to update user services' });
  }
});

// ─── GET /catalog — all users with filters, for catalog page ─────────────────
router.get('/catalog', authenticate, async (req: AuthRequest, res) => {
  try {
    const { query, fieldOfActivityId, directionId, professionId } = req.query;
    const where: any = { id: { not: req.userId } };

    const andClauses: any[] = [];

    if (query) {
      andClauses.push({
        OR: [
          { firstName: { contains: query as string, mode: 'insensitive' } },
          { lastName: { contains: query as string, mode: 'insensitive' } },
          { nickname: { contains: query as string, mode: 'insensitive' } },
        ],
      });
    }

    // Apply only the most specific filter available (most→least specific: profession > direction > field)
    // Users store their profession via UserService (not UserProfession which is empty).
    if (professionId) {
      andClauses.push({ userServices: { some: { professionId: professionId as string } } });
    } else if (directionId) {
      andClauses.push({ userServices: { some: { profession: { directionId: directionId as string } } } });
    } else if (fieldOfActivityId) {
      // Match via UserService → profession → direction → fieldOfActivity
      andClauses.push({
        userServices: { some: { profession: { direction: { fieldOfActivityId: fieldOfActivityId as string } } } },
      });
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        avatar: true,
        city: true,
        isPremium: true,
        isVerified: true,
        isBlocked: true,
        fieldOfActivity: { select: { id: true, name: true } },
        userServices: {
          select: { profession: { select: { id: true, name: true } } },
          distinct: ['professionId'],
        },
        portfolioFiles: {
          select: { id: true, url: true, mimeType: true, originalName: true },
          take: 6,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            sentConnections: { where: { status: 'ACCEPTED' } },
            receivedConnections: { where: { status: 'ACCEPTED' } },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
    });

    res.json(users);
  } catch (error) {
    console.error('[catalog] GET /catalog error:', error);
    res.status(500).json({ error: 'Failed to get catalog' });
  }
});

// Search users
router.get('/search', authenticate, async (req: AuthRequest, res) => {
  try {
    const { query, role, city, genre, fieldOfActivityId } = req.query;

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

    if (fieldOfActivityId) {
      where.fieldOfActivityId = fieldOfActivityId as string;
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
        isPremium: true,
        isVerified: true,
        isBlocked: true,
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

// Get user by ID — public (no sensitive fields)
router.get('/:id', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: publicUserSelect,
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

// Upload portfolio file
router.post('/me/portfolio', authenticate, uploadPortfolio.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const count = await prisma.portfolioFile.count({ where: { userId: req.userId! } });
    if (count >= 5) return res.status(400).json({ error: 'Max 5 portfolio files allowed' });
    const fileUrl = `/uploads/portfolio/${req.file.filename}`;
    const pf = await prisma.portfolioFile.create({
      data: { userId: req.userId!, url: fileUrl, originalName: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype },
    });
    res.json(pf);
  } catch (error) {
    console.error('Portfolio upload error:', error);
    res.status(500).json({ error: 'Failed to upload portfolio file' });
  }
});

// Delete portfolio file
router.delete('/me/portfolio/:fileId', authenticate, async (req: AuthRequest, res) => {
  try {
    const pf = await prisma.portfolioFile.findFirst({ where: { id: req.params.fileId, userId: req.userId } });
    if (!pf) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(process.cwd(), 'uploads', 'portfolio', path.basename(pf.url));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.portfolioFile.delete({ where: { id: req.params.fileId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Portfolio delete error:', error);
    res.status(500).json({ error: 'Failed to delete portfolio file' });
  }
});

// Agree to terms and privacy policy
router.post('/me/agree-terms', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { termsAgreedAt: new Date() },
      select: userSelect,
    });
    res.json(user);
  } catch (error) {
    console.error('Agree terms error:', error);
    res.status(500).json({ error: 'Failed to record agreement' });
  }
});

export default router;
