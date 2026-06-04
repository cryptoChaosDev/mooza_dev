import { Router } from 'express';
import { prisma } from '../index';
import { yoNorm } from '../utils/search';

const router = Router();

// Get all fields of activity — only those with users other than excludeUserId
router.get('/fields-of-activity', async (req, res) => {
  try {
    const { excludeUserId, all } = req.query;

    // When all=true, return only catalog groups (fields with catalog professions)
    if (all === 'true') {
      const fields = await prisma.fieldOfActivity.findMany({
        where: {
          directions: {
            some: { professions: { some: { customFilters: { some: {} } } } },
          },
        },
        orderBy: { name: 'asc' },
      });
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
    if (all === 'true') {
      // Only catalog directions (those with catalog professions)
      where.professions = { some: { customFilters: { some: {} } } };
    } else {
      // Default: only directions with actual users
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
      label: 'Раздел',
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
    const { directionId, search, excludeUserId, all } = req.query;
    const where: any = {};
    if (all === 'true') {
      // Only catalog professions (those with custom filters from catalog import)
      where.customFilters = { some: {} };
    } else {
      // Default: only professions with actual users
      where.userServices = excludeUserId
        ? { some: { userId: { not: excludeUserId as string } } }
        : { some: {} };
    }
    if (directionId) where.directionId = directionId as string;
    if (search) where.nameNorm = { contains: yoNorm(search as string) };

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

// Search services with full path: field → direction → profession → service
router.get('/services/search', async (req, res) => {
  try {
    const q = (req.query.q as string)?.trim();
    if (!q || q.length < 1) return res.json([]);

    // Search ONLY catalog professions (those with custom filters from muza_catalog import)
    const professions = await prisma.profession.findMany({
      where: {
        nameNorm: { contains: yoNorm(q) },
        customFilters: { some: {} },
      },
      include: {
        direction: {
          include: {
            fieldOfActivity: { select: { id: true, name: true } },
          },
        },
      },
      take: 30,
      orderBy: { name: 'asc' },
    });

    const results = await Promise.all(professions.map(async (p: any) => {
      // Find the corresponding service by name (Service is now standalone, no direction M2M)
      const service = await prisma.service.findFirst({
        where: { name: p.name },
        select: { id: true },
      });
      return {
        serviceId: service?.id ?? '',
        serviceName: p.name,
        professionId: p.id,
        professionName: p.name,
        directionId: p.direction?.id ?? '',
        directionName: p.direction?.name ?? '',
        fieldOfActivityId: p.direction?.fieldOfActivity?.id ?? '',
        fieldOfActivityName: p.direction?.fieldOfActivity?.name ?? '',
        allowedFilterTypes: [],
        customFilters: [],
      };
    }));

    res.json(results);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Get services — Service is now standalone (no direction M2M)
// Lookup by directionId/professionId/fieldOfActivityId resolves via profession names
router.get('/services', async (req, res) => {
  try {
    const { directionId, professionId, fieldOfActivityId } = req.query;

    if (directionId) {
      // Get catalog profession names in this direction, find matching services
      const catalogProfs = await prisma.profession.findMany({
        where: { directionId: directionId as string, customFilters: { some: {} } },
        select: { name: true },
      });
      const dir = await prisma.direction.findUnique({
        where: { id: directionId as string },
        select: {
          allowedFilterTypes: true,
          customFilters: { select: { id: true, name: true, values: { select: { id: true, value: true }, orderBy: { sortOrder: 'asc' } } } },
        },
      });
      if (!dir) return res.json([]);
      const catalogNames = catalogProfs.map((p: any) => p.name);
      const services = catalogNames.length > 0
        ? await prisma.service.findMany({
            where: { name: { in: catalogNames } },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          })
        : [];
      return res.json(services.map((s: any) => ({
        id: s.id, name: s.name, sortOrder: s.sortOrder,
        allowedFilterTypes: dir.allowedFilterTypes,
        customFilters: dir.customFilters,
      })));
    }

    if (professionId) {
      const prof = await prisma.profession.findUnique({
        where: { id: professionId as string },
        select: {
          name: true,
          direction: {
            select: {
              allowedFilterTypes: true,
              customFilters: { select: { id: true, name: true, values: { select: { id: true, value: true }, orderBy: { sortOrder: 'asc' } } } },
            },
          },
        },
      });
      if (!prof) return res.json([]);
      const service = await prisma.service.findFirst({ where: { name: prof.name } });
      if (!service) return res.json([]);
      return res.json([{
        id: service.id, name: service.name, sortOrder: service.sortOrder,
        allowedFilterTypes: prof.direction?.allowedFilterTypes ?? [],
        customFilters: prof.direction?.customFilters ?? [],
      }]);
    }

    if (fieldOfActivityId) {
      // Directions in this field → professions → service names
      const dirs = await prisma.direction.findMany({
        where: { fieldOfActivityId: fieldOfActivityId as string },
        select: { id: true },
      });
      const dirIds = dirs.map((d: any) => d.id);
      const profs = await prisma.profession.findMany({
        where: { directionId: { in: dirIds }, customFilters: { some: {} } },
        select: { name: true },
      });
      const names = [...new Set(profs.map((p: any) => p.name))];
      const services = names.length > 0
        ? await prisma.service.findMany({
            where: { name: { in: names } },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          })
        : [];
      return res.json(services.map((s: any) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder, allowedFilterTypes: [], customFilters: [] })));
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
    const priceRanges = await (prisma.priceRange.findMany as any)({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userServices: true } } },
    }) as any[];
    res.json(priceRanges.map((p: any) => ({
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

    // Custom filter value ids (comma-separated)
    const cfvIds = String(req.query.customFilterValueIds || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Build UserService filter (service-level constraints + legacy independent filters)
    const userServiceWhere: any = {};
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
    const andClauses: any[] = [];

    // Profession is first-class: match via userProfessions.
    // When cfvIds are given with a professionId, require a matching UserProfession row
    // that also carries at least one of those selected filter values.
    if (professionId) {
      userWhere.userProfessions = {
        some: {
          professionId,
          ...(cfvIds.length ? { selectedCustomFilterValues: { some: { id: { in: cfvIds } } } } : {}),
        },
      };
    } else if (cfvIds.length && serviceId) {
      // cfvIds apply to the service when a serviceId is present (and no professionId).
      userServiceWhere.selectedCustomFilterValues = { some: { id: { in: cfvIds } } };
    } else if (cfvIds.length) {
      // Only cfvIds given (no professionId/serviceId): match users having EITHER a
      // UserProfession OR a UserService carrying one of those selected filter values.
      andClauses.push({
        OR: [
          { userProfessions: { some: { selectedCustomFilterValues: { some: { id: { in: cfvIds } } } } } },
          { userServices: { some: { selectedCustomFilterValues: { some: { id: { in: cfvIds } } } } } },
        ],
      });
    }

    if (Object.keys(userServiceWhere).length > 0) {
      userWhere.userServices = { some: userServiceWhere };
    }

    if (query) {
      const q = yoNorm(query as string);
      andClauses.push({
        OR: [
          { firstNameNorm: { contains: q } },
          { lastNameNorm: { contains: q } },
          { nicknameNorm: { contains: q } },
          { cityNorm: { contains: q } },
        ],
      });
    }

    if (andClauses.length > 0) {
      userWhere.AND = andClauses;
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
      const { userServices, userProfessions, ...userData } = user;
      return {
        id: user.id,
        user: userData,
        searchProfile: {
          professions: dedup(userProfessions.map(up => up.profession)),
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

// ─── Service-card search ──────────────────────────────────────────────────────
// Finds individual SERVICE OFFERINGS (UserService), not people. The main "Услуги"
// search returns one card per user's service offering.
//   serviceId        — exact service
//   sectionId        — any service in that catalog section
//   customFilterValueIds — comma-separated CustomFilterValue ids (offering must have them)
//   query            — matches the provider's name/city or the service name
//   location         — comma-separated city names; offering provider must be in one of them
//   priceMin/priceMax — numeric price range (rub); overlaps the offering's [priceFrom, priceTo]
//   sort             — date (default, newest first) | price_asc | price_desc | rating
router.get('/service-search', async (req, res) => {
  try {
    const { serviceId, sectionId, customFilterValueIds, query, location, priceMin, priceMax, sort, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;
    const cfvIds = String(customFilterValueIds || '').split(',').map(s => s.trim()).filter(Boolean);
    const cities = String(location || '').split(',').map(s => s.trim()).filter(Boolean).map(c => yoNorm(c));
    const priceMinNum = priceMin != null && priceMin !== '' ? parseInt(priceMin as string, 10) : null;
    const priceMaxNum = priceMax != null && priceMax !== '' ? parseInt(priceMax as string, 10) : null;
    const sortMode = ['date', 'price_asc', 'price_desc', 'rating'].includes(String(sort)) ? String(sort) : 'date';

    // Show every created/submitted offering — only hide unfinished drafts and archived ones.
    const where: any = { status: { notIn: ['draft', 'archived'] } };
    if (serviceId) where.serviceId = String(serviceId);
    if (sectionId) where.service = { sectionId: String(sectionId) };
    if (cfvIds.length) where.selectedCustomFilterValues = { some: { id: { in: cfvIds } } };
    if (cities.length) where.user = { cityNorm: { in: cities } };
    // Price range: keep offerings whose advertised range overlaps [priceMinNum, priceMaxNum].
    if (priceMinNum != null && !Number.isNaN(priceMinNum)) {
      // Drop offerings that are entirely cheaper than the requested minimum.
      where.OR = [{ priceTo: null }, { priceTo: { gte: priceMinNum } }, { priceFrom: { gte: priceMinNum } }];
    }
    if (priceMaxNum != null && !Number.isNaN(priceMaxNum)) {
      // Drop offerings that are entirely more expensive than the requested maximum.
      where.AND = [
        ...(where.AND ?? []),
        { OR: [{ priceFrom: null }, { priceFrom: { lte: priceMaxNum } }, { priceTo: { lte: priceMaxNum } }] },
      ];
    }
    if (query) {
      const q = yoNorm(String(query));
      const queryOr = [
        { user: { firstNameNorm: { contains: q } } },
        { user: { lastNameNorm: { contains: q } } },
        { user: { cityNorm: { contains: q } } },
        { service: { nameNorm: { contains: q } } },
        { nameNorm: { contains: q } },
      ];
      // If a price-min OR already exists, AND the two OR groups together.
      if (where.OR) {
        where.AND = [...(where.AND ?? []), { OR: where.OR }, { OR: queryOr }];
        delete where.OR;
      } else {
        where.OR = queryOr;
      }
    }

    const select = {
      id: true,
      name: true,
      priceFrom: true,
      priceTo: true,
      priceItems: true,
      description: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true, avatar: true, city: true, isPremium: true, isVerified: true } },
      service: { select: { id: true, name: true, section: { select: { id: true, name: true } } } },
      profession: { select: { id: true, name: true } },
      selectedCustomFilterValues: { select: { id: true, value: true, filter: { select: { id: true, name: true } } } },
    } as const;

    const totalCount = await prisma.userService.count({ where });

    // Compute provider ratings; needed both for "rating" sort and for display.
    const attachRatings = async (rows: any[]) => {
      const userIds = [...new Set(rows.map(i => i.user?.id).filter(Boolean) as string[])];
      const ratings = userIds.length
        ? await prisma.review.groupBy({
            by: ['targetId'],
            where: { targetId: { in: userIds } },
            _avg: { rating: true },
            _count: { _all: true },
          })
        : [];
      const ratingByUser = new Map(ratings.map(r => [r.targetId, { avg: r._avg.rating, count: r._count._all }]));
      return rows.map(i => ({
        ...i,
        user: i.user ? { ...i.user, rating: ratingByUser.get(i.user.id) ?? null } : i.user,
      }));
    };

    let results: any[];
    if (sortMode === 'rating') {
      // Rating is computed post-query, so DB-side ordering isn't possible. Fetch all
      // matching rows (capped), attach ratings, sort by avg rating, then paginate.
      const all = await prisma.userService.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500, select });
      const withRatings = await attachRatings(all);
      withRatings.sort((a, b) => {
        const ra = a.user?.rating?.count > 0 ? Number(a.user.rating.avg) : -1;
        const rb = b.user?.rating?.count > 0 ? Number(b.user.rating.avg) : -1;
        return rb - ra;
      });
      results = withRatings.slice(skip, skip + limitNum);
    } else {
      const orderBy =
        sortMode === 'price_asc' ? [{ priceFrom: { sort: 'asc', nulls: 'last' } as any }, { createdAt: 'desc' as const }]
        : sortMode === 'price_desc' ? [{ priceFrom: { sort: 'desc', nulls: 'last' } as any }, { createdAt: 'desc' as const }]
        : [{ createdAt: 'desc' as const }];
      const items = await prisma.userService.findMany({ where, skip, take: limitNum, orderBy, select });
      results = await attachRatings(items);
    }

    res.json({
      results,
      pagination: { page: pageNum, limit: limitNum, totalCount, totalPages: Math.ceil(totalCount / limitNum) },
    });
  } catch (error) {
    console.error('Service search error:', error);
    res.status(500).json({ error: 'Service search failed' });
  }
});

// GET /api/references/service-cities — distinct provider cities for the location filter.
//   q — optional case/ё-insensitive substring to autocomplete over.
// → [{ name }]  (only cities that have at least one non-draft service offering)
router.get('/service-cities', async (req, res) => {
  try {
    const { q } = req.query;
    const rows = await prisma.userService.findMany({
      where: { status: { notIn: ['draft', 'archived'] }, user: { city: { not: null } } },
      select: { user: { select: { city: true, cityNorm: true } } },
      distinct: ['userId'],
      take: 2000,
    });
    const qn = q ? yoNorm(String(q)) : '';
    const seen = new Set<string>();
    const cities: string[] = [];
    for (const r of rows) {
      const city = r.user?.city?.trim();
      const norm = r.user?.cityNorm ?? (city ? yoNorm(city) : '');
      if (!city || seen.has(norm)) continue;
      if (qn && !norm.includes(qn)) continue;
      seen.add(norm);
      cities.push(city);
    }
    cities.sort((a, b) => a.localeCompare(b, 'ru'));
    res.json(cities.slice(0, 50).map(name => ({ name })));
  } catch (e: any) {
    console.error('Get service cities error:', e);
    res.status(500).json({ error: 'Failed to get cities' });
  }
});

// Get all reference data in one call
router.get('/all', async (_req, res) => {
  try {
    const [fields, services, genres, workFormats, employmentTypes, skillLevels, availabilities, geographies, priceRanges, professions] = await Promise.all([
      prisma.fieldOfActivity.findMany({ orderBy: { name: 'asc' } }),
      prisma.service.findMany({
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.genre.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.workFormat.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.employmentType.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.skillLevel.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.availability.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.geography.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.priceRange.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.profession.findMany({ orderBy: { name: 'asc' } }),
    ]);

    res.json({ fields, services, genres, workFormats, employmentTypes, skillLevels, availabilities, geographies, priceRanges, professions });
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
    const where: any = { status: 'VERIFIED' };
    if (search) where.nameNorm = { contains: yoNorm(search as string) };
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


// GET /api/references/professions/:id/filters — custom filters for a profession
// → [{ id, name, values: [{ id, value, sortOrder }] }]
router.get('/professions/:id/filters', async (req, res) => {
  try {
    const filters = await prisma.customFilter.findMany({
      where: { professionId: req.params.id },
      select: {
        id: true,
        name: true,
        values: {
          select: { id: true, value: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(filters);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/references/sections — all sections with their services (catalog cards)
// → [{ id, name, sortOrder, services: [{ id, name, sortOrder }] }]
router.get('/sections', async (_req, res) => {
  try {
    const sections = await prisma.section.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        services: {
          select: { id: true, name: true, sortOrder: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    res.json(sections);
  } catch (e: any) {
    console.error('Get sections error:', e);
    res.status(500).json({ error: 'Failed to get sections' });
  }
});

// GET /api/references/services/:id — service detail (section, professions, own filters)
// → { id, name, sectionId, sectionName, professions: [{ id, name }],
//     filters: [{ id, name, values: [{ id, value, sortOrder }] }] }
router.get('/services/:id', async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        sectionId: true,
        section: { select: { name: true } },
        serviceProfessions: {
          select: { profession: { select: { id: true, name: true } } },
        },
        customFilters: {
          select: {
            id: true,
            name: true,
            values: {
              select: { id: true, value: true, sortOrder: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json({
      id: service.id,
      name: service.name,
      sectionId: service.sectionId,
      sectionName: service.section?.name ?? null,
      professions: service.serviceProfessions.map((sp) => sp.profession),
      filters: service.customFilters,
    });
  } catch (e: any) {
    console.error('Get service detail error:', e);
    res.status(500).json({ error: 'Failed to get service' });
  }
});

// GET /api/references/services/:id/filters — a service's own custom filters
// → [{ id, name, values: [{ id, value, sortOrder }] }]
router.get('/services/:id/filters', async (req, res) => {
  try {
    const filters = await prisma.customFilter.findMany({
      where: { serviceId: req.params.id },
      select: {
        id: true,
        name: true,
        values: {
          select: { id: true, value: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(filters);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
