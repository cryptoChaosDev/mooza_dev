import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

// Admin middleware
const requireAdmin = async (req: AuthRequest, res: Response, next: any) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
};

router.use(authenticate, requireAdmin);

// ─── FieldOfActivity ───────────────────────────────────────────────────────
router.get('/fields-of-activity', async (_req, res) => {
  const items = await prisma.fieldOfActivity.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(items);
});
router.post('/fields-of-activity', async (req, res) => {
  try {
    const item = await prisma.fieldOfActivity.create({ data: { name: req.body.name } });
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
router.put('/fields-of-activity/:id', async (req, res) => {
  try {
    const item = await prisma.fieldOfActivity.update({ where: { id: req.params.id }, data: { name: req.body.name } });
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
router.delete('/fields-of-activity/:id', async (req, res) => {
  try {
    const db = prisma as any;
    const directions = await db.direction.findMany({
      where: { fieldOfActivityId: req.params.id },
      select: { id: true },
    });
    const directionIds = directions.map((d: any) => d.id as string);
    const professions = await db.profession.findMany({
      where: { directionId: { in: directionIds } },
      select: { id: true },
    });
    const professionIds = professions.map((p: any) => p.id as string);
    await prisma.$transaction([
      prisma.userService.deleteMany({ where: { professionId: { in: professionIds } } }),
      prisma.userProfession.deleteMany({ where: { professionId: { in: professionIds } } }),
      db.profession.deleteMany({ where: { directionId: { in: directionIds } } }),
      // Services cascade-delete via FK when direction is deleted
      db.direction.deleteMany({ where: { fieldOfActivityId: req.params.id } }),
      prisma.fieldOfActivity.delete({ where: { id: req.params.id } }),
    ]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Profession ────────────────────────────────────────────────────────────
router.get('/professions', async (_req, res) => {
  const items = await prisma.profession.findMany({
    include: { direction: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(items);
});
router.post('/professions', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name required' });
    const item = await prisma.profession.create({ data: { name: req.body.name } });
    res.json(item);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/professions/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if ('directionId' in req.body) data.directionId = req.body.directionId ?? null;
    const item = await prisma.profession.update({
      where: { id: req.params.id },
      data,
      include: { direction: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/professions/:id', async (req, res) => {
  try {
    const db = prisma as any;
    await prisma.$transaction([
      prisma.userService.deleteMany({ where: { professionId: req.params.id } }),
      prisma.userProfession.deleteMany({ where: { professionId: req.params.id } }),
      db.profession.delete({ where: { id: req.params.id } }),
    ]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Service (flat reference list) ─────────────────────────────────────────
router.get('/services', async (_req, res) => {
  const items = await prisma.service.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      directions: {
        select: {
          id: true,
          name: true,
          fieldOfActivity: { select: { id: true, name: true } },
        },
      },
    },
  });
  res.json(items);
});
router.post('/services', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name required' });
    const item = await prisma.service.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } });
    res.status(201).json(item);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/services/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    const item = await prisma.service.update({ where: { id: req.params.id }, data });
    res.json(item);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/services/:id', async (req, res) => {
  try {
    await prisma.$transaction([
      prisma.userService.deleteMany({ where: { serviceId: req.params.id } }),
      prisma.service.delete({ where: { id: req.params.id } }),
    ]);
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});


// ─── Genre ─────────────────────────────────────────────────────────────────
router.get('/genres', async (_req, res) => {
  res.json(await prisma.genre.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/genres', async (req, res) => {
  try { res.json(await prisma.genre.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/genres/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.genre.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/genres/:id', async (req, res) => {
  try { await prisma.genre.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── WorkFormat ────────────────────────────────────────────────────────────
router.get('/work-formats', async (_req, res) => {
  res.json(await prisma.workFormat.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/work-formats', async (req, res) => {
  try { res.json(await prisma.workFormat.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/work-formats/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.workFormat.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/work-formats/:id', async (req, res) => {
  try { await prisma.workFormat.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── ProfessionFeature ────────────────────────────────────────────────────
router.get('/profession-features', async (_req, res) => {
  res.json(await prisma.professionFeature.findMany({ orderBy: { name: 'asc' } }));
});
router.post('/profession-features', async (req, res) => {
  try { res.json(await prisma.professionFeature.create({ data: { name: req.body.name } })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/profession-features/:id', async (req, res) => {
  try { res.json(await prisma.professionFeature.update({ where: { id: req.params.id }, data: { name: req.body.name } })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/profession-features/:id', async (req, res) => {
  try { await prisma.professionFeature.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── EmploymentType ────────────────────────────────────────────────────────
router.get('/employment-types', async (_req, res) => {
  res.json(await prisma.employmentType.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/employment-types', async (req, res) => {
  try { res.json(await prisma.employmentType.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/employment-types/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.employmentType.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/employment-types/:id', async (req, res) => {
  try { await prisma.employmentType.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── SkillLevel ────────────────────────────────────────────────────────────
router.get('/skill-levels', async (_req, res) => {
  res.json(await prisma.skillLevel.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/skill-levels', async (req, res) => {
  try { res.json(await prisma.skillLevel.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/skill-levels/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.skillLevel.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/skill-levels/:id', async (req, res) => {
  try { await prisma.skillLevel.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Availability ──────────────────────────────────────────────────────────
router.get('/availabilities', async (_req, res) => {
  res.json(await prisma.availability.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/availabilities', async (req, res) => {
  try { res.json(await prisma.availability.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/availabilities/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.availability.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/availabilities/:id', async (req, res) => {
  try { await prisma.availability.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Geography ─────────────────────────────────────────────────────────────
router.get('/geographies', async (_req, res) => {
  res.json(await prisma.geography.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/geographies', async (req, res) => {
  try { res.json(await prisma.geography.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/geographies/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    res.json(await prisma.geography.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/geographies/:id', async (req, res) => {
  try { await prisma.geography.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── PriceRange ────────────────────────────────────────────────────────────
router.get('/price-ranges', async (_req, res) => {
  res.json(await prisma.priceRange.findMany({ orderBy: { sortOrder: 'asc' } }));
});
router.post('/price-ranges', async (req, res) => {
  try {
    res.json(await prisma.priceRange.create({
      data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0, minValue: req.body.minValue, maxValue: req.body.maxValue },
    }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/price-ranges/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    if (req.body.minValue !== undefined) data.minValue = req.body.minValue;
    if (req.body.maxValue !== undefined) data.maxValue = req.body.maxValue;
    res.json(await prisma.priceRange.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/price-ranges/:id', async (req, res) => {
  try { await prisma.priceRange.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Direction ─────────────────────────────────────────────────────────────
router.get('/directions', async (_req, res) => {
  const items = await prisma.direction.findMany({
    include: {
      fieldOfActivity: { select: { id: true, name: true } },
      customFilters: { select: { id: true, name: true } },
      services: { select: { id: true, name: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(items);
});
router.post('/directions', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name required' });
    const item = await prisma.direction.create({ data: { name: req.body.name } });
    res.json(item);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/directions/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if ('fieldOfActivityId' in req.body) data.fieldOfActivityId = req.body.fieldOfActivityId ?? null;
    const item = await prisma.direction.update({
      where: { id: req.params.id },
      data,
      include: { fieldOfActivity: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
// Attach services to a direction (M2M set)
router.put('/directions/:id/services', async (req, res) => {
  try {
    const { serviceIds = [] } = req.body;
    const item = await prisma.direction.update({
      where: { id: req.params.id },
      data: { services: { set: (serviceIds as string[]).map(id => ({ id })) } },
      include: {
        fieldOfActivity: { select: { id: true, name: true } },
        services: { select: { id: true, name: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Set filters for a direction (system filter types + custom filter ids)
router.put('/directions/:id/filters', async (req, res) => {
  try {
    const { filterIds = [], filterTypes = [] } = req.body;
    const item = await prisma.direction.update({
      where: { id: req.params.id },
      data: {
        allowedFilterTypes: filterTypes as string[],
        customFilters: {
          set: (filterIds as string[]).map((id) => ({ id })),
        },
      },
      include: { customFilters: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/directions/:id', async (req, res) => {
  try {
    const db = prisma as any;
    const professions = await db.profession.findMany({
      where: { directionId: req.params.id },
      select: { id: true },
    });
    const professionIds = professions.map((p: any) => p.id as string);
    await prisma.$transaction([
      prisma.userService.deleteMany({ where: { professionId: { in: professionIds } } }),
      prisma.userProfession.deleteMany({ where: { professionId: { in: professionIds } } }),
      db.profession.deleteMany({ where: { directionId: req.params.id } }),
      // Services cascade-delete via FK (directionId ON DELETE CASCADE)
      db.direction.delete({ where: { id: req.params.id } }),
    ]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Groups (admin) ──────────────────────────────────────────────────────────
router.get('/groups', authenticate, requireAdmin, async (_req, res) => {
  try {
    const groups = await prisma.artist.findMany({
      where: { type: { in: ['GROUP', 'COVER_GROUP'] } },
      include: {
        _count: { select: { userArtists: true } },
        submittedByUser: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(groups.map(g => ({ ...g, listeners: Number(g.listeners) })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/groups', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, type = 'GROUP', city, description } = req.body;
    const group = await prisma.artist.create({
      data: { name, type, city: city || null, description: description || null },
    });
    res.status(201).json({ ...group, listeners: Number(group.listeners) });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/groups/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, type, city, description, status } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (city !== undefined) data.city = city;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    const group = await prisma.artist.update({ where: { id: req.params.id }, data });
    res.json({ ...group, listeners: Number(group.listeners) });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/groups/:id', authenticate, requireAdmin, async (req, res) => {
  try { await prisma.artist.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Artist ────────────────────────────────────────────────────────────────
router.get('/artists', async (_req, res) => {
  res.json(await prisma.artist.findMany({ orderBy: { name: 'asc' } }));
});
router.post('/artists', async (req, res) => {
  try { res.json(await prisma.artist.create({ data: { name: req.body.name } })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/artists/:id', async (req, res) => {
  try { res.json(await prisma.artist.update({ where: { id: req.params.id }, data: { name: req.body.name } })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/artists/:id', async (req, res) => {
  try { await prisma.artist.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Artist Moderation ────────────────────────────────────────────────────
// GET /admin/artists/pending — list artists awaiting moderation
router.get('/artists/pending', authenticate, requireAdmin, async (_req, res) => {
  try {
    const artists = await prisma.artist.findMany({
      where: { status: 'PENDING' },
      include: {
        submittedByUser: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        genres: { include: { genre: true } },
        _count: { select: { followers: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });
    res.json(artists.map(a => ({ ...a, listeners: Number(a.listeners), genres: a.genres.map(ag => ag.genre), followersCount: a._count.followers })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /admin/artists/verification — list approved artists with proof URL pending verification
router.get('/artists/verification', authenticate, requireAdmin, async (_req, res) => {
  try {
    const artists = await prisma.artist.findMany({
      where: { status: 'APPROVED', verificationProofUrl: { not: null } },
      include: {
        submittedByUser: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        genres: { include: { genre: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });
    res.json(artists.map(a => ({ ...a, listeners: Number(a.listeners), genres: a.genres.map(ag => ag.genre) })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /admin/artists/:id/approve — approve artist card + generate verification code
router.patch('/artists/:id/approve', authenticate, requireAdmin, async (req, res) => {
  try {
    const code = 'MOOOZA-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const artist = await prisma.artist.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        verificationCode: code,
        rejectionReason: null,
        moderatedAt: new Date(),
      },
    });
    res.json({ ...artist, listeners: Number(artist.listeners) });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// PATCH /admin/artists/:id/reject — reject with reason
router.patch('/artists/:id/reject', authenticate, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body as { reason?: string };
    const artist = await prisma.artist.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason || null,
        moderatedAt: new Date(),
      },
    });
    res.json({ ...artist, listeners: Number(artist.listeners) });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// PATCH /admin/artists/:id/verify — mark artist as VERIFIED after checking proof
router.patch('/artists/:id/verify', authenticate, requireAdmin, async (req, res) => {
  try {
    const artist = await prisma.artist.update({
      where: { id: req.params.id },
      data: { status: 'VERIFIED', moderatedAt: new Date() },
    });
    res.json({ ...artist, listeners: Number(artist.listeners) });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Employer ──────────────────────────────────────────────────────────────
router.get('/employers', async (_req, res) => {
  res.json(await prisma.employer.findMany({ orderBy: { name: 'asc' } }));
});
router.post('/employers', async (req, res) => {
  try {
    res.json(await prisma.employer.create({
      data: { name: req.body.name, inn: req.body.inn || null, ogrn: req.body.ogrn || null },
    }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/employers/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.inn !== undefined) data.inn = req.body.inn || null;
    if (req.body.ogrn !== undefined) data.ogrn = req.body.ogrn || null;
    res.json(await prisma.employer.update({ where: { id: req.params.id }, data }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/employers/:id', async (req, res) => {
  try { await prisma.employer.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Custom Filters ────────────────────────────────────────────────────────
router.get('/custom-filters', async (_req, res) => {
  const filters = await prisma.customFilter.findMany({
    include: {
      values: { orderBy: { sortOrder: 'asc' } },
      directions: {
        select: {
          id: true,
          name: true,
          fieldOfActivity: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(filters);
});
router.post('/custom-filters', async (req, res) => {
  try {
    const { name, values = [] } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const filter = await prisma.customFilter.create({
      data: {
        name,
        values: { create: (values as string[]).map((v, i) => ({ value: v, sortOrder: i })) },
      },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
    });
    res.status(201).json(filter);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/custom-filters/:id', async (req, res) => {
  try {
    const { name, values } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (values !== undefined) {
      data.values = {
        deleteMany: {},
        create: (values as string[]).map((v, i) => ({ value: v, sortOrder: i })),
      };
    }
    const filter = await prisma.customFilter.update({
      where: { id: req.params.id },
      data,
      include: { values: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json(filter);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/custom-filters/:id', async (req, res) => {
  try { await prisma.customFilter.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── User Management ──────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const search = (req.query.search as string) || '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const where = search ? {
    OR: [
      { firstName: { contains: search, mode: 'insensitive' as const } },
      { lastName: { contains: search, mode: 'insensitive' as const } },
      { nickname: { contains: search, mode: 'insensitive' as const } },
      { email: { contains: search, mode: 'insensitive' as const } },
    ],
  } : {};
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, nickname: true,
        email: true, avatar: true, isAdmin: true, isBlocked: true,
        isPremium: true, isVerified: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  res.json({ users, total, page, limit });
});

router.patch('/users/:id/block', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { isBlocked: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBlocked: !user.isBlocked },
      select: { id: true, isBlocked: true },
    });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch('/users/:id/premium', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { isPremium: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isPremium: !user.isPremium },
      select: { id: true, isPremium: true },
    });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch('/users/:id/verified', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { isVerified: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isVerified: !user.isVerified },
      select: { id: true, isVerified: true },
    });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
