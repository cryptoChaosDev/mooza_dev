import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

// Get all fields of activity with user counts
router.get('/fields-of-activity', async (_req, res) => {
  try {
    const fields = await prisma.fieldOfActivity.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    res.json(fields.map(f => ({ id: f.id, name: f.name, createdAt: f.createdAt, userCount: f._count.users })));
  } catch (error) {
    console.error('Get fields of activity error:', error);
    res.status(500).json({ error: 'Failed to get fields of activity' });
  }
});

// Get directions by field of activity
router.get('/directions', async (req, res) => {
  try {
    const { fieldOfActivityId } = req.query;
    const where: any = {};
    if (fieldOfActivityId) where.fieldOfActivityId = fieldOfActivityId as string;

    const directions = await prisma.direction.findMany({
      where,
      include: { _count: { select: { professions: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(directions.map(d => ({
      id: d.id,
      name: d.name,
      fieldOfActivityId: d.fieldOfActivityId,
      professionCount: d._count.professions,
    })));
  } catch (error) {
    console.error('Get directions error:', error);
    res.status(500).json({ error: 'Failed to get directions' });
  }
});

// Get professions by direction
router.get('/professions', async (req, res) => {
  try {
    const { directionId, search } = req.query;
    const where: any = {};
    if (directionId) where.directionId = directionId as string;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const professions = await prisma.profession.findMany({
      where,
      include: { direction: { select: { id: true, name: true, fieldOfActivityId: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(professions);
  } catch (error) {
    console.error('Get professions error:', error);
    res.status(500).json({ error: 'Failed to get professions' });
  }
});

// Get services filtered by profession or field of activity
router.get('/services', async (req, res) => {
  try {
    const { professionId, fieldOfActivityId } = req.query;
    const where: any = {};

    if (professionId) {
      where.professionId = professionId as string;
    } else if (fieldOfActivityId) {
      const professions = await prisma.profession.findMany({
        where: { direction: { fieldOfActivityId: fieldOfActivityId as string } },
        select: { id: true },
      });
      where.professionId = { in: professions.map(p => p.id) };
    }

    const services = await prisma.service.findMany({
      where,
      include: {
        profession: {
          select: {
            id: true,
            name: true,
            direction: {
              select: {
                allowedFilterTypes: true,
                customFilters: {
                  select: {
                    id: true, name: true,
                    values: { select: { id: true, value: true }, orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
            },
          },
        },
        _count: { select: { userServices: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    res.json(services.map(s => ({
      id: s.id,
      name: s.name,
      nameEn: s.nameEn,
      professionId: s.professionId,
      professionName: s.profession.name,
      sortOrder: s.sortOrder,
      userCount: s._count.userServices,
      allowedFilterTypes: s.profession.direction.allowedFilterTypes,
      customFilters: s.profession.direction.customFilters,
    })));
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

    const userServiceWhere: any = {};
    if (serviceId) userServiceWhere.serviceId = serviceId;
    if (professionId) userServiceWhere.professionId = professionId;
    if (genreId) userServiceWhere.genres = { some: { id: genreId } };
    if (workFormatId) userServiceWhere.workFormats = { some: { id: workFormatId } };
    if (employmentTypeId) userServiceWhere.employmentTypes = { some: { id: employmentTypeId } };
    if (skillLevelId) userServiceWhere.skillLevels = { some: { id: skillLevelId } };
    if (availabilityId) userServiceWhere.availabilities = { some: { id: availabilityId } };
    if (geographyId) userServiceWhere.geographies = { some: { id: geographyId } };
    if (priceMin) userServiceWhere.priceFrom = { gte: parseInt(priceMin as string, 10) };
    if (priceMax) userServiceWhere.priceTo = { lte: parseInt(priceMax as string, 10) };

    const userWhere: any = {};
    if (fieldId) userWhere.fieldOfActivityId = fieldId;
    if (directionId) {
      const profsByDir = await prisma.profession.findMany({
        where: { directionId: directionId as string },
        select: { id: true },
      });
      const dirFilter = { professionId: { in: profsByDir.map(p => p.id) } };
      userWhere.userServices = userWhere.userServices
        ? { some: { ...userWhere.userServices.some, ...dirFilter } }
        : { some: dirFilter };
    }
    if (Object.keys(userServiceWhere).length > 0) {
      userWhere.userServices = { some: userServiceWhere };
    }
    if (query) {
      userWhere.OR = [
        { firstName: { contains: query as string, mode: 'insensitive' } },
        { lastName: { contains: query as string, mode: 'insensitive' } },
        { nickname: { contains: query as string, mode: 'insensitive' } },
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
        include: { profession: { select: { id: true, name: true, directionId: true } } },
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

// Get artists (with search)
router.get('/artists', async (req, res) => {
  try {
    const { search } = req.query;
    const where: any = {};
    if (search) where.name = { contains: search as string, mode: 'insensitive' };
    const artists = await prisma.artist.findMany({ where, orderBy: { name: 'asc' }, take: 50 });
    res.json(artists);
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
