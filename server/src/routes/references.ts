import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

// Get all fields of activity with user counts
router.get('/fields-of-activity', async (_req, res) => {
  try {
    const fields = await prisma.fieldOfActivity.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });
    
    // Format response to include userCount
    const formattedFields = fields.map(field => ({
      id: field.id,
      name: field.name,
      createdAt: field.createdAt,
      userCount: field._count.users,
    }));
    
    res.json(formattedFields);
  } catch (error) {
    console.error('Get fields of activity error:', error);
    res.status(500).json({ error: 'Failed to get fields of activity' });
  }
});

// Get professions by field of activity
router.get('/professions', async (req, res) => {
  try {
    const { fieldOfActivityId, search } = req.query;

    const where: any = {};
    if (fieldOfActivityId) {
      where.fieldOfActivityId = fieldOfActivityId as string;
    }
    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    const professions = await prisma.profession.findMany({
      where,
      include: {
        fieldOfActivity: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(professions);
  } catch (error) {
    console.error('Get professions error:', error);
    res.status(500).json({ error: 'Failed to get professions' });
  }
});

// ============ NEW MULTI-LEVEL SEARCH ENDPOINTS ============

// Get services filtered by profession
router.get('/services', async (req, res) => {
  try {
    const { professionId, fieldOfActivityId } = req.query;

    const where: any = {};
    
    if (professionId) {
      where.professionId = professionId as string;
    } else if (fieldOfActivityId) {
      // If fieldOfActivityId is provided, get services for all professions in that field
      const professions = await prisma.profession.findMany({
        where: { fieldOfActivityId: fieldOfActivityId as string },
        select: { id: true },
      });
      where.professionId = { in: professions.map(p => p.id) };
    }

    const services = await prisma.service.findMany({
      where,
      include: {
        profession: { select: { id: true, name: true } },
        _count: { select: { users: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Format response
    const formattedServices = services.map(service => ({
      id: service.id,
      name: service.name,
      nameEn: service.nameEn,
      professionId: service.professionId,
      professionName: service.profession.name,
      sortOrder: service.sortOrder,
      userCount: service._count.users,
    }));

    res.json(formattedServices);
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Failed to get services' });
  }
});

// Get genres filtered by service
router.get('/genres', async (req, res) => {
  try {
    const { serviceId } = req.query;

    const where: any = {};
    if (serviceId) {
      where.serviceId = serviceId as string;
    }

    const genres = await prisma.genre.findMany({
      where,
      include: {
        service: { select: { id: true, name: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Format response
    const formattedGenres = genres.map(genre => ({
      id: genre.id,
      name: genre.name,
      nameEn: genre.nameEn,
      serviceId: genre.serviceId,
      serviceName: genre.service?.name,
      userCount: genre._count.users,
    }));

    res.json(formattedGenres);
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
      include: {
        _count: { select: { users: true } },
      },
    });

    // Format response
    const formattedWorkFormats = workFormats.map(wf => ({
      id: wf.id,
      name: wf.name,
      nameEn: wf.nameEn,
      sortOrder: wf.sortOrder,
      userCount: wf._count.users,
    }));

    res.json(formattedWorkFormats);
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
      include: {
        _count: { select: { users: true } },
      },
    });

    // Format response
    const formattedEmploymentTypes = employmentTypes.map(et => ({
      id: et.id,
      name: et.name,
      nameEn: et.nameEn,
      sortOrder: et.sortOrder,
      userCount: et._count.users,
    }));

    res.json(formattedEmploymentTypes);
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
      include: {
        _count: { select: { users: true } },
      },
    });

    // Format response
    const formattedSkillLevels = skillLevels.map(sl => ({
      id: sl.id,
      name: sl.name,
      nameEn: sl.nameEn,
      sortOrder: sl.sortOrder,
      userCount: sl._count.users,
    }));

    res.json(formattedSkillLevels);
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
      include: {
        _count: { select: { users: true } },
      },
    });

    // Format response
    const formattedAvailabilities = availabilities.map(a => ({
      id: a.id,
      name: a.name,
      nameEn: a.nameEn,
      sortOrder: a.sortOrder,
      userCount: a._count.users,
    }));

    res.json(formattedAvailabilities);
  } catch (error) {
    console.error('Get availabilities error:', error);
    res.status(500).json({ error: 'Failed to get availabilities' });
  }
});

// Combined search endpoint
router.get('/search', async (req, res) => {
  try {
    const {
      fieldId,
      professionId,
      serviceId,
      genreId,
      workFormatId,
      employmentTypeId,
      skillLevelId,
      availabilityId,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause for UserSearchProfile
    const where: any = {};

    if (serviceId) where.serviceId = serviceId;
    if (genreId) where.genreId = genreId;
    if (workFormatId) where.workFormatId = workFormatId;
    if (employmentTypeId) where.employmentTypeId = employmentTypeId;
    if (skillLevelId) where.skillLevelId = skillLevelId;
    if (availabilityId) where.availabilityId = availabilityId;

    // Get user search profiles with filters
    const [userProfiles, totalCount] = await Promise.all([
      prisma.userSearchProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              nickname: true,
              avatar: true,
              city: true,
              fieldOfActivity: { select: { id: true, name: true } },
            },
          },
          service: { select: { id: true, name: true } },
          genre: { select: { id: true, name: true } },
          workFormat: { select: { id: true, name: true } },
          employmentType: { select: { id: true, name: true } },
          skillLevel: { select: { id: true, name: true } },
          availability: { select: { id: true, name: true } },
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.userSearchProfile.count({ where }),
    ]);

    // Get facet counts for each level
    const [fieldFacets, professionFacets, serviceFacets, genreFacets] = await Promise.all([
      // Field facets - get unique user IDs and their field of activity
      fieldId ? Promise.resolve([]) : prisma.userSearchProfile.findMany({
        where,
        select: { user: { select: { fieldOfActivityId: true } } },
        distinct: ['userId'],
      }).then(profiles => {
        const fieldIds = [...new Set(profiles.map(p => p.user?.fieldOfActivityId).filter(Boolean))];
        return prisma.fieldOfActivity.findMany({
          where: { id: { in: fieldIds as string[] } },
          include: { _count: { select: { users: true } } },
        }).then(fields => fields.map(f => ({ id: f.id, name: f.name, count: f._count.users })));
      }),
      // Profession facets - group by serviceId and get profession info
      prisma.userSearchProfile.findMany({
        where,
        select: { serviceId: true },
        distinct: ['serviceId'],
      }).then(profiles => {
        const serviceIds = profiles.map(p => p.serviceId).filter(Boolean);
        return prisma.service.findMany({
          where: { id: { in: serviceIds as string[] } },
          include: { profession: { select: { id: true, name: true, fieldOfActivity: { select: { id: true, name: true } } } } },
        }).then(async services => {
          // Get counts for each service
          const counts = await prisma.userSearchProfile.groupBy({
            by: ['serviceId'],
            where: { serviceId: { in: serviceIds as string[] } },
            _count: true,
          });
          return services.map(s => ({
            id: s.id,
            name: s.name,
            professionId: s.profession.id,
            professionName: s.profession.name,
            fieldOfActivityId: s.profession.fieldOfActivity.id,
            fieldOfActivityName: s.profession.fieldOfActivity.name,
            count: counts.find(c => c.serviceId === s.id)?._count || 0,
          }));
        });
      }),
      // Service facets
      prisma.userSearchProfile.groupBy({
        by: ['serviceId'],
        where,
        _count: true,
      }).then(facets => facets.map(f => ({ id: f.serviceId, count: f._count }))),
      // Genre facets
      prisma.userSearchProfile.groupBy({
        by: ['genreId'],
        where,
        _count: true,
      }).then(facets => facets.map(f => ({ id: f.genreId, count: f._count }))),
    ]);

    // Format results
    const results = userProfiles.map(profile => ({
      id: profile.id,
      user: profile.user,
      searchProfile: {
        service: profile.service,
        genre: profile.genre,
        workFormat: profile.workFormat,
        employmentType: profile.employmentType,
        skillLevel: profile.skillLevel,
        availability: profile.availability,
        pricePerHour: profile.pricePerHour,
        pricePerEvent: profile.pricePerEvent,
      },
    }));

    res.json({
      results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
      facets: {
        fields: fieldFacets,
        professions: professionFacets,
        services: serviceFacets,
        genres: genreFacets,
      },
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get all reference data in one call
router.get('/all', async (_req, res) => {
  try {
    const [services, genres, workFormats, employmentTypes, skillLevels, availabilities] = await Promise.all([
      prisma.service.findMany({
        include: { profession: { select: { id: true, name: true } } },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.genre.findMany({
        include: { service: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.workFormat.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.employmentType.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.skillLevel.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.availability.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);

    res.json({
      services,
      genres,
      workFormats,
      employmentTypes,
      skillLevels,
      availabilities,
    });
  } catch (error) {
    console.error('Get all reference data error:', error);
    res.status(500).json({ error: 'Failed to get reference data' });
  }
});

// Get all profession features
router.get('/profession-features', async (_req, res) => {
  try {
    const features = await prisma.professionFeature.findMany({
      orderBy: { name: 'asc' },
    });
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
    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    const artists = await prisma.artist.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 50,
    });
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

    const employers = await prisma.employer.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 50,
    });
    res.json(employers);
  } catch (error) {
    console.error('Get employers error:', error);
    res.status(500).json({ error: 'Failed to get employers' });
  }
});

export default router;
