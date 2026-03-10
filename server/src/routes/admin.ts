import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

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
  const items = await prisma.fieldOfActivity.findMany({ orderBy: { name: 'asc' } });
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
    await prisma.fieldOfActivity.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Profession ────────────────────────────────────────────────────────────
router.get('/professions', async (_req, res) => {
  const items = await prisma.profession.findMany({
    include: { fieldOfActivity: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(items);
});
router.post('/professions', async (req, res) => {
  try {
    const item = await prisma.profession.create({
      data: { name: req.body.name, fieldOfActivityId: req.body.fieldOfActivityId },
      include: { fieldOfActivity: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
router.put('/professions/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.fieldOfActivityId !== undefined) data.fieldOfActivityId = req.body.fieldOfActivityId;
    const item = await prisma.profession.update({
      where: { id: req.params.id },
      data,
      include: { fieldOfActivity: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
router.delete('/professions/:id', async (req, res) => {
  try {
    await prisma.profession.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Service ───────────────────────────────────────────────────────────────
router.get('/services', async (_req, res) => {
  const items = await prisma.service.findMany({
    include: { profession: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(items);
});
router.post('/services', async (req, res) => {
  try {
    const item = await prisma.service.create({
      data: { name: req.body.name, professionId: req.body.professionId, sortOrder: req.body.sortOrder ?? 0 },
      include: { profession: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
router.put('/services/:id', async (req, res) => {
  try {
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.professionId !== undefined) data.professionId = req.body.professionId;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    const item = await prisma.service.update({
      where: { id: req.params.id },
      data,
      include: { profession: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
router.delete('/services/:id', async (req, res) => {
  try {
    await prisma.service.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
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

export default router;
