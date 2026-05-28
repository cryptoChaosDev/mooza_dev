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
  isPro: true,
  isVerified: true,
  genres: true,
  fieldOfActivityId: true,
  fieldOfActivity: { select: { id: true, name: true } },
  userServices: { include: userServiceInclude },
  userProfessions: {
    select: {
      id: true,
      professionId: true,
      profession: { select: { id: true, name: true } },
    },
  },
  userArtists: {
    include: { artist: { select: { id: true, name: true } } },
  },
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
  lastSeenAt: true,
  termsAgreedAt: true,
  createdAt: true,
  portfolioFiles: { select: { id: true, url: true, originalName: true, size: true, mimeType: true, createdAt: true } },
  portfolioLinks: { select: { id: true, type: true, url: true, title: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
  _count: {
    select: {
      sentRequests: { where: { status: 'accepted' } },
      receivedRequests: { where: { status: 'accepted' } },
      posts: true,
      referrals: true,
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
  isPro: true,
  isVerified: true,
  isBlocked: true,
  genres: true,
  fieldOfActivityId: true,
  fieldOfActivity: { select: { id: true, name: true } },
  userServices: { include: userServiceInclude },
  userProfessions: {
    select: {
      id: true,
      professionId: true,
      profession: { select: { id: true, name: true } },
    },
  },
  userArtists: {
    include: { artist: { select: { id: true, name: true } } },
  },
  socialLinks: true,
  lastSeenAt: true,
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
  portfolioLinks: { select: { id: true, type: true, url: true, title: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
  _count: {
    select: {
      sentRequests: { where: { status: 'accepted' } },
      receivedRequests: { where: { status: 'accepted' } },
      posts: true,
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
      fieldOfActivityId,
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

    // Delete and recreate in a transaction to prevent data loss on error
    const VALID_STATUS = new Set(['draft', 'active', 'archived', 'pending_review']);
    await prisma.$transaction(async (tx) => {
      await tx.userService.deleteMany({ where: { userId: req.userId } });
      for (const us of services) {
        const status = VALID_STATUS.has((us as any).status) ? (us as any).status : 'draft';
        await tx.userService.create({
          data: {
            userId: req.userId!,
            professionId: us.professionId,
            serviceId: us.serviceId,
            status,
            genres:          { connect: toConnect(us.genreIds) },
            workFormats:     { connect: toConnect(us.workFormatIds) },
            employmentTypes: { connect: toConnect(us.employmentTypeIds) },
            skillLevels:     { connect: toConnect(us.skillLevelIds) },
            availabilities:  { connect: toConnect(us.availabilityIds) },
            geographies:                 { connect: toConnect(us.geographyIds) },
            priceFrom:                   us.priceFrom ?? null,
            priceTo:                     us.priceTo ?? null,
            description:                 (us as any).description ?? null,
            selectedCustomFilterValues:  { connect: toConnect(us.customFilterValueIds) },
          },
        });
      }
    });

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

// ── PATCH /api/users/me/services/:serviceId ───────────────────────────────────
router.patch('/me/services/:serviceId', authenticate, async (req: AuthRequest, res) => {
  try {
    const us = await prisma.userService.findUnique({ where: { id: req.params.serviceId } });
    if (!us || us.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    const { priceFrom, priceTo, description } = req.body;
    const updated = await prisma.userService.update({
      where: { id: req.params.serviceId },
      data: {
        ...(priceFrom !== undefined ? { priceFrom: priceFrom !== '' && priceFrom != null ? Number(priceFrom) : null } : {}),
        ...(priceTo   !== undefined ? { priceTo:   priceTo   !== '' && priceTo   != null ? Number(priceTo)   : null } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
      },
      include: userServiceInclude,
    });
    return res.json(updated);
  } catch (err) {
    console.error('[users] PATCH /me/services/:serviceId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/users/me/services/:serviceId/status ───────────────────────────
router.patch('/me/services/:serviceId/status', authenticate, async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'draft', 'archived', 'pending_review'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const us = await prisma.userService.findUnique({ where: { id: req.params.serviceId } });
    if (!us || us.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    const updated = await prisma.userService.update({
      where: { id: req.params.serviceId },
      data: { status },
      include: userServiceInclude,
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/users/services/:serviceId/inquire — notify owner of interest ───
router.post('/services/:serviceId/inquire', authenticate, async (req: AuthRequest, res) => {
  try {
    const us = await prisma.userService.findUnique({
      where: { id: req.params.serviceId },
      include: { service: { select: { name: true } }, user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!us) return res.status(404).json({ error: 'Not found' });
    if (us.userId === req.userId) return res.status(400).json({ error: 'Cannot inquire own service' });
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { firstName: true, lastName: true } });
    const actorName = `${actor?.firstName ?? ''} ${actor?.lastName ?? ''}`.trim();
    await prisma.notification.create({
      data: {
        userId: us.userId,
        actorId: req.userId,
        type: 'service_inquiry',
        title: 'Интерес к услуге',
        body: `${actorName} заинтересовался услугой «${us.service.name}»`,
        link: `/services/${us.id}`,
      },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── DELETE /api/users/me/services/:serviceId ──────────────────────────────────
router.delete('/me/services/:serviceId', authenticate, async (req: AuthRequest, res) => {
  try {
    const us = await prisma.userService.findUnique({ where: { id: req.params.serviceId } });
    if (!us || us.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    await prisma.userService.delete({ where: { id: req.params.serviceId } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ─── GET /catalog — all users with filters, for catalog page ─────────────────
router.get('/catalog', authenticate, async (req: AuthRequest, res) => {
  try {
    const { query, fieldOfActivityId, directionId, professionId } = req.query;
    const where: any = { id: { not: req.userId } };

    const andClauses: any[] = [];

    if (query) {
      const words = (query as string).trim().split(/\s+/).filter(Boolean);
      const m = 'insensitive' as const;
      const wordClauses = words.map(word => ({
        OR: [
          // Identity
          { firstName: { contains: word, mode: m } },
          { lastName: { contains: word, mode: m } },
          { nickname: { contains: word, mode: m } },
          // Profile text
          { bio: { contains: word, mode: m } },
          { city: { contains: word, mode: m } },
          { country: { contains: word, mode: m } },
          // Service taxonomy
          { userServices: { some: { profession: { name: { contains: word, mode: m } } } } },
          { userServices: { some: { service: { name: { contains: word, mode: m } } } } },
          { userServices: { some: { profession: { direction: { name: { contains: word, mode: m } } } } } },
          { userServices: { some: { profession: { direction: { fieldOfActivity: { name: { contains: word, mode: m } } } } } } },
          // Service filters
          { userServices: { some: { genres: { some: { name: { contains: word, mode: m } } } } } },
          { userServices: { some: { workFormats: { some: { name: { contains: word, mode: m } } } } } },
          { userServices: { some: { employmentTypes: { some: { name: { contains: word, mode: m } } } } } },
          { userServices: { some: { skillLevels: { some: { name: { contains: word, mode: m } } } } } },
          { userServices: { some: { availabilities: { some: { name: { contains: word, mode: m } } } } } },
          { userServices: { some: { geographies: { some: { name: { contains: word, mode: m } } } } } },
          // Custom filter values
          { userServices: { some: { selectedCustomFilterValues: { some: { value: { contains: word, mode: m } } } } } },
          // Collectives
          { userArtists: { some: { artist: { name: { contains: word, mode: m } } } } },
        ],
      }));
      andClauses.push({ AND: wordClauses });
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
// ── GET /api/users/:id/services ──────────────────────────────────────────────
router.get('/:id/services', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const services = await prisma.userService.findMany({
      where: { userId: req.params.id },
      include: userServiceInclude,
      orderBy: [{ professionId: 'asc' }],
    });
    return res.json(services);
  } catch (err) {
    console.error('[users] GET /:id/services', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/users/user-service/:serviceId ────────────────────────────────────
router.get('/user-service/:serviceId', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const us = await prisma.userService.findUnique({
      where: { id: req.params.serviceId },
      include: {
        ...userServiceInclude,
        user: { select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true } },
      },
    });
    if (!us) return res.status(404).json({ error: 'Not found' });
    return res.json(us);
  } catch (err) {
    console.error('[users] GET /user-service/:serviceId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/:id', optionalAuthenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: publicUserSelect,
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let friendship: { id: string; status: string; requesterId: string } | null = null;
    if (req.userId && req.userId !== req.params.id) {
      friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { requesterId: req.userId, receiverId: req.params.id },
            { requesterId: req.params.id, receiverId: req.userId },
          ],
        },
        select: { id: true, status: true, requesterId: true },
      });
    }

    const friendshipStatus = !friendship
      ? 'none'
      : friendship.status === 'accepted'
        ? 'accepted'
        : friendship.requesterId === req.userId
          ? 'pending_sent'
          : 'pending_received';

    const dealsCount = await prisma.deal.count({
      where: {
        status: 'COMPLETED',
        OR: [{ customerId: req.params.id }, { executorId: req.params.id }],
      },
    });

    res.json({
      ...user,
      isFriend: friendshipStatus === 'accepted',
      friendshipId: friendship?.id ?? null,
      friendshipStatus,
      dealsCount,
    });
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
      data: { userId: req.userId!, url: fileUrl, originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), size: req.file.size, mimeType: req.file.mimetype },
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

// Add portfolio link (audio / video)
router.post('/me/portfolio/links', authenticate, async (req: AuthRequest, res) => {
  try {
    const { type, url, title = '' } = req.body;
    if (!type || !url) return res.status(400).json({ error: 'type and url required' });
    if (!['audio', 'video'].includes(type)) return res.status(400).json({ error: 'type must be audio or video' });
    const count = await prisma.portfolioLink.count({ where: { userId: req.userId!, type } });
    if (count >= 5) return res.status(400).json({ error: `Max 5 ${type} links allowed` });
    const link = await prisma.portfolioLink.create({
      data: { userId: req.userId!, type, url, title },
      select: { id: true, type: true, url: true, title: true, createdAt: true },
    });
    res.json(link);
  } catch (error) {
    console.error('Portfolio link add error:', error);
    res.status(500).json({ error: 'Failed to add portfolio link' });
  }
});

// Delete portfolio link
router.delete('/me/portfolio/links/:linkId', authenticate, async (req: AuthRequest, res) => {
  try {
    const link = await prisma.portfolioLink.findFirst({ where: { id: req.params.linkId, userId: req.userId! } });
    if (!link) return res.status(404).json({ error: 'Link not found' });
    await prisma.portfolioLink.delete({ where: { id: req.params.linkId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Portfolio link delete error:', error);
    res.status(500).json({ error: 'Failed to delete portfolio link' });
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
