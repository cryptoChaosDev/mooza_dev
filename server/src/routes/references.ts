import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

// Get all fields of activity — only those with users other than excludeUserId
router.get('/fields-of-activity', async (req, res) => {
  try {
    const { excludeUserId, all } = req.query;

    // When all=true, return every field without user-count filtering
    if (all === 'true') {
      const fields = await prisma.fieldOfActivity.findMany({ orderBy: { name: 'asc' } });
      return res.json(fields.map(f => ({ id: f.id, name: f.name, createdAt: f.createdAt, userCount: 0 })));
    }

    const usFilter = excludeUserId
      ? { some: { userId: { not: excludeUserId as string } } }
      : { some: {} };

    const fields = await prisma.fieldOfActivity.findMany({
      where: {
        directions: { some: { professions: { some: { userServices: usFilter } } } },
      },
      include: {
        directions: {
          include: {
            professions: {
              include: {
                userServices: { select: { userId: true } },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json(fields.map(f => {
      const users = new Set<string>();
      for (const d of f.directions) {
        for (const p of d.professions) {
          for (const us of p.userServices) {
            if (!excludeUserId || us.userId !== excludeUserId) users.add(us.userId);
          }
        }
      }
      return { id: f.id, name: f.name, createdAt: f.createdAt, userCount: users.size };
    }));
  } catch (error) {
    console.error('Get fields of activity error:', error);
    res.status(500).json({ error: 'Failed to get fields of activity' });
  }
});

// Get directions by field of activity — only those with users other than excludeUserId
router.get('/directions', async (req, res) => {
  try {
    const { fieldOfActivityId, excludeUserId, all } = req.query;
    const where: any = {};
    if (fieldOfActivityId) where.fieldOfActivityId = fieldOfActivityId as string;
    // When all=true, skip user filter (used for connection modal to show all directions)
    if (all !== 'true') {
      const usFilter = excludeUserId
        ? { some: { userId: { not: excludeUserId as string } } }
        : { some: {} };
      where.professions = { some: { userServices: usFilter } };
    }

    const directions = await prisma.direction.findMany({
      where,
      include: {
        professions: { select: { id: true } },
        _count: { select: { professions: true } },
        customFilters: { select: { id: true, name: true, values: { select: { id: true, value: true }, orderBy: { sortOrder: 'asc' } } } },
      },
      orderBy: { name: 'asc' },
    });

    // Count distinct users per direction via UserService (excluding self)
    const professionIds = directions.flatMap(d => d.professions.map(p => p.id));
    const userServicesData = professionIds.length > 0
      ? await prisma.userService.findMany({
          where: {
            professionId: { in: professionIds },
            ...(excludeUserId ? { userId: { not: excludeUserId as string } } : {}),
          },
          select: { professionId: true, userId: true },
        })
      : [];

    const profUserMap = new Map<string, Set<string>>();
    for (const us of userServicesData) {
      if (!profUserMap.has(us.professionId)) profUserMap.set(us.professionId, new Set());
      profUserMap.get(us.professionId)!.add(us.userId);
    }

    const dirUserMap = new Map<string, Set<string>>();
    for (const d of directions) {
      const users = new Set<string>();
      for (const p of d.professions) {
        profUserMap.get(p.id)?.forEach(uid => users.add(uid));
      }
      dirUserMap.set(d.id, users);
    }

    res.json(directions.map(d => ({
      id: d.id,
      name: d.name,
      fieldOfActivityId: d.fieldOfActivityId,
      professionCount: d._count.professions,
      userCount: dirUserMap.get(d.id)?.size ?? 0,
      allowedFilterTypes: d.allowedFilterTypes,
      customFilters: d.customFilters,
    })));
  } catch (error) {
    console.error('Get directions error:', error);
    res.status(500).json({ error: 'Failed to get directions' });
  }
});

// Get professions by direction — only those with users other than excludeUserId
router.get('/professions', async (req, res) => {
  try {
    const { directionId, search, excludeUserId } = req.query;
    const usFilter = excludeUserId
      ? { some: { userId: { not: excludeUserId as string } } }
      : { some: {} };
    const where: any = {
      userServices: usFilter,
    };
    if (directionId) where.directionId = directionId as string;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const professions = await prisma.profession.findMany({
      where,
      include: {
        direction: { select: { id: true, name: true, fieldOfActivityId: true } },
        userServices: { select: { userId: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json(professions.map(p => {
      const uniqueUsers = new Set(
        p.userServices
          .map((us: any) => us.userId)
          .filter((uid: string) => !excludeUserId || uid !== (excludeUserId as string))
      );
      return {
        id: p.id,
        name: p.name,
        directionId: p.directionId,
        direction: p.direction,
        userCount: uniqueUsers.size,
        createdAt: p.createdAt,
      };
    }));
  } catch (error) {
    console.error('Get professions error:', error);
    res.status(500).json({ error: 'Failed to get professions' });
  }
});

// Get services for a direction/profession (via M2M) or all services
router.get('/services', async (req, res) => {
  try {
    const { directionId, professionId, fieldOfActivityId } = req.query;

    if (directionId) {
      const dir = await prisma.direction.findUnique({
        where: { id: directionId as string },
        include: {
          services: { orderBy: { sortOrder: 'asc' } },
          customFilters: { select: { id: true, name: true, values: { select: { id: true, value: true }, orderBy: { sortOrder: 'asc' } } } },
        },
      });
      if (!dir) return res.json([]);
      return res.json(dir.services.map(s => ({
        id: s.id, name: s.name, sortOrder: s.sortOrder,
        allowedFilterTypes: dir.allowedFilterTypes,
        customFilters: dir.customFilters,
      })));
    }

    if (professionId) {
      const prof = await prisma.profession.findUnique({
        where: { id: professionId as string },
        select: {
          direction: {
            include: {
              services: { orderBy: { sortOrder: 'asc' } },
              customFilters: { select: { id: true, name: true, values: { select: { id: true, value: true }, orderBy: { sortOrder: 'asc' } } } },
            },
          },
        },
      });
      if (!prof?.direction?.services?.length) return res.json([]);
      return res.json(prof.direction.services.map(s => ({
        id: s.id, name: s.name, sortOrder: s.sortOrder,
        allowedFilterTypes: prof.direction!.allowedFilterTypes,
        customFilters: prof.direction!.customFilters,
      })));
    }

    if (fieldOfActivityId) {
      const dirs = await prisma.direction.findMany({
        where: { fieldOfActivityId: fieldOfActivityId as string },
        include: { services: { orderBy: { sortOrder: 'asc' } } },
      });
      const seen = new Set<string>();
      const services: any[] = [];
      for (const dir of dirs) {
        for (const s of dir.services) {
          if (!seen.has(s.id)) { seen.add(s.id); services.push({ id: s.id, name: s.name, sortOrder: s.sortOrder, allowedFilterTypes: [], customFilters: [] }); }
        }
      }
      return res.json(services.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
    }

    // All services (no filter)
    const all = await prisma.service.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    res.json(all);
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Failed to get services' });
  }
});

// Get all genres (independent)
router.get('/genres', async (_req, res) => {
  try {
    const genres = await prisma.genre.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userServices: true } } },
    });
    res.json(genres.map(g => ({ id: g.id, name: g.name, nameEn: g.nameEn, sortOrder: g.sortOrder, userCount: g._count.userServices })));
  } catch (error) {
    console.error('Get genres error:', error);
    res.status(500).json({ error: 'Failed to get genres' });
  }
});

// Get work formats
router.get('/work-formats', async (_req, res) => {
  try {
    const workFormats = await prisma.workFormat.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userServices: true } } },
    });
    res.json(workFormats.map(w => ({ id: w.id, name: w.name, nameEn: w.nameEn, sortOrder: w.sortOrder, userCount: w._count.userServices })));
  } catch (error) {
    console.error('Get work formats error:', error);
    res.status(500).json({ error: 'Failed to get work formats' });
  }
});

// Get employment types
router.get('/employment-types', async (_req, res) => {
  try {
    const employmentTypes = await prisma.employmentType.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userServices: true } } },
    });
    res.json(employmentTypes.map(e => ({ id: e.id, name: e.name, nameEn: e.nameEn, sortOrder: e.sortOrder, userCount: e._count.userServices })));
  } catch (error) {
    console.error('Get employment types error:', error);
    res.status(500).json({ error: 'Failed to get employment types' });
  }
});

// Get skill levels
router.get('/skill-levels', async (_req, res) => {
  try {
    const skillLevels = await prisma.skillLevel.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userServices: true } } },
    });
    res.json(skillLevels.map(s => ({ id: s.id, name: s.name, nameEn: s.nameEn, sortOrder: s.sortOrder, userCount: s._count.userServices })));
  } catch (error) {
    console.error('Get skill levels error:', error);
    res.status(500).json({ error: 'Failed to get skill levels' });
  }
});

// Get availabilities
router.get('/availabilities', async (_req, res) => {
  try {
    const availabilities = await prisma.availability.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userServices: true } } },
    });
    res.json(availabilities.map(a => ({ id: a.id, name: a.name, nameEn: a.nameEn, sortOrder: a.sortOrder, userCount: a._count.userServices })));
  } catch (error) {
    console.error('Get availabilities error:', error);
    res.status(500).json({ error: 'Failed to get availabilities' });
  }
});

// Get geographies
router.get('/geographies', async (_req, res) => {
  try {
    const geographies = await prisma.geography.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userServices: true } } },
    });
    res.json(geographies.map(g => ({ id: g.id, name: g.name, nameEn: g.nameEn, sortOrder: g.sortOrder, userCount: g._count.userServices })));
  } catch (error) {
    console.error('Get geographies error:', error);
    res.status(500).json({ error: 'Failed to get geographies' });
  }
});

// Get price ranges
router.get('/price-ranges', async (_req, res) => {
  try {
    const priceRanges = await prisma.priceRange.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userServices: true } } },
    });
    res.json(priceRanges.map(p => ({
      id: p.id, name: p.name, nameEn: p.nameEn,
      minValue: p.minValue, maxValue: p.maxValue,
      sortOrder: p.sortOrder, userCount: p._count.userServices,
    })));
  } catch (error) {
    console.error('Get price ranges error:', error);
    res.status(500).json({ error: 'Failed to get price ranges' });
  }
});

// Search users by service filters
router.get('/search', async (req, res) => {
  try {
    const {
      fieldId,
      directionId,
      professionId,
      serviceId,
      genreId,
      workFormatId,
      employmentTypeId,
      skillLevelId,
      availabilityId,
      geographyId,
      priceMin,
      priceMax,
      query,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build UserService filter — profession/direction/field resolved through the relation chain
    const userServiceWhere: any = {};

    // Most specific filter wins (profession > direction > field)
    if (professionId) {
      userServiceWhere.professionId = professionId;
    } else if (directionId) {
      userServiceWhere.profession = { directionId: directionId as string };
    } else if (fieldId) {
      userServiceWhere.profession = { direction: { fieldOfActivityId: fieldId as string } };
    }

    if (serviceId) userServiceWhere.serviceId = serviceId;
    if (genreId) userServiceWhere.genres = { some: { id: genreId } };
    if (workFormatId) userServiceWhere.workFormats = { some: { id: workFormatId } };
    if (employmentTypeId) userServiceWhere.employmentTypes = { some: { id: employmentTypeId } };
    if (skillLevelId) userServiceWhere.skillLevels = { some: { id: skillLevelId } };
    if (availabilityId) userServiceWhere.availabilities = { some: { id: availabilityId } };
    if (geographyId) userServiceWhere.geographies = { some: { id: geographyId } };
    if (priceMin) userServiceWhere.priceFrom = { gte: parseInt(priceMin as string, 10) };
    if (priceMax) userServiceWhere.priceTo = { lte: parseInt(priceMax as string, 10) };

    const userWhere: any = {};
    if (Object.keys(userServiceWhere).length > 0) {
      userWhere.userServices = { some: userServiceWhere };
    }
    if (query) {
      userWhere.OR = [
        { firstName: { contains: query as string, mode: 'insensitive' } },
        { lastName: { contains: query as string, mode: 'insensitive' } },
        { nickname: { contains: query as string, mode: 'insensitive' } },
        { city: { contains: query as string, mode: 'insensitive' } },
      ];
    }

    const userSelect = {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      avatar: true,
      city: true,
      fieldOfActivity: { select: { id: true, name: true } },
      userProfessions: { select: { id: true, profession: { select: { id: true, name: true } } } },
      userServices: {
        include: {
          service: { select: { id: true, name: true } },
          genres: { select: { id: true, name: true } },
          workFormats: { select: { id: true, name: true } },
          employmentTypes: { select: { id: true, name: true } },
          skillLevels: { select: { id: true, name: true } },
          availabilities: { select: { id: true, name: true } },
          geographies: { select: { id: true, name: true } },
        },
      },
    };

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({ where: userWhere, select: userSelect, skip, take: limitNum, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where: userWhere }),
    ]);

    const dedup = <T extends { id: string }>(arr: T[]) =>
      [...new Map(arr.map(x => [x.id, x])).values()];

    const results = users.map(user => {
      const { userServices, ...userData } = user;
      return {
        id: user.id,
        user: userData,
        searchProfile: {
          services: dedup(userServices.map(us => us.service)),
          genres: dedup(userServices.flatMap(us => us.genres)),
          workFormats: dedup(userServices.flatMap(us => us.workFormats)),
          employmentTypes: dedup(userServices.flatMap(us => us.employmentTypes)),
          skillLevels: dedup(userServices.flatMap(us => us.skillLevels)),
          availabilities: dedup(userServices.flatMap(us => us.availabilities)),
          geographies: dedup(userServices.flatMap(us => us.geographies)),
        },
      };
    });

    res.json({
      results,
      pagination: { page: pageNum, limit: limitNum, totalCount, totalPages: Math.ceil(totalCount / limitNum) },
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get all reference data in one call
router.get('/all', async (_req, res) => {
  try {
    const [fields, services, genres, workFormats, employmentTypes, skillLevels, availabilities, geographies, priceRanges] = await Promise.all([
      prisma.fieldOfActivity.findMany({ orderBy: { name: 'asc' } }),
      prisma.service.findMany({
        include: { directions: { select: { id: true, name: true, fieldOfActivityId: true } } },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.genre.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.workFormat.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.employmentType.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.skillLevel.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.availability.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.geography.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.priceRange.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);

    res.json({ fields, services, genres, workFormats, employmentTypes, skillLevels, availabilities, geographies, priceRanges });
  } catch (error) {
    console.error('Get all reference data error:', error);
    res.status(500).json({ error: 'Failed to get reference data' });
  }
});

// Get all profession features
router.get('/profession-features', async (_req, res) => {
  try {
    const features = await prisma.professionFeature.findMany({ orderBy: { name: 'asc' } });
    res.json(features);
  } catch (error) {
    console.error('Get profession features error:', error);
    res.status(500).json({ error: 'Failed to get profession features' });
  }
});

// Get artists (with search, type filter, genres)
router.get('/artists', async (req, res) => {
  try {
    const { search, type } = req.query;
    const where: any = { status: 'APPROVED' };
    if (search) where.name = { contains: search as string, mode: 'insensitive' };
    if (type && type !== 'ALL') where.type = type as string;
    const artists = await prisma.artist.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 200,
      include: {
        genres: { include: { genre: { select: { id: true, name: true } } } },
      },
    });
    res.json(artists.map(a => ({ ...a, listeners: a.listeners !== undefined && a.listeners !== null ? Number(a.listeners) : a.listeners })));
  } catch (error) {
    console.error('Get artists error:', error);
    res.status(500).json({ error: 'Failed to get artists' });
  }
});

// Get employers (with search by name, inn, ogrn)
router.get('/employers', async (req, res) => {
  try {
    const { search } = req.query;
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { inn: { contains: search as string, mode: 'insensitive' } },
        { ogrn: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    const employers = await prisma.employer.findMany({ where, orderBy: { name: 'asc' }, take: 50 });
    res.json(employers);
  } catch (error) {
    console.error('Get employers error:', error);
    res.status(500).json({ error: 'Failed to get employers' });
  }
});

export default router;
