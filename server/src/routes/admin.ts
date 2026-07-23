import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { notify, notifyMany } from '../utils/notify';
import { yoNorm } from '../utils/search';
import { grantProMonth, isProActive } from '../utils/pro';

const router = Router();

// Admin middleware
const requireAdmin = async (req: AuthRequest, res: Response, next: any) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
};

router.use(authenticate, requireAdmin);

// Ручной прогон синка Яндекс.Музыки (тот же код, что ночной джоб) — для проверки.
router.post('/ym-sync', async (_req, res) => {
  try {
    const { runYandexMusicSync } = await import('../utils/yandexMusicSync');
    // Фоном — обход с паузами может занять минуты; ответ сразу.
    runYandexMusicSync().catch(() => {});
    res.json({ started: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Waitlist (landing sign-ups) ─────────────────────────────────────────────
router.get('/waitlist', async (req, res) => {
  try {
    const { type } = req.query as { type?: string };
    const items = await prisma.waitlistEntry.findMany({
      where: type ? { type } : {},
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Запросы на добавление профессии (Модерация) ─────────────────────────────
router.get('/profession-requests', async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const items = await (prisma as any).professionRequest.findMany({
      where: status ? { status } : {},
      include: { user: { select: { id: true, firstName: true, lastName: true, nickname: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(items);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH { status: 'done' | 'rejected', addToCatalog?: boolean }
// addToCatalog=true — сразу создать профессию в справочнике (если её ещё нет)
router.patch('/profession-requests/:id', async (req, res) => {
  try {
    const { status, addToCatalog } = req.body as { status?: string; addToCatalog?: boolean };
    if (!status || !['done', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'status: done | rejected | pending' });
    }
    const reqRow = await (prisma as any).professionRequest.findUnique({ where: { id: req.params.id } });
    if (!reqRow) return res.status(404).json({ error: 'Not found' });

    let createdProfession: any = null;
    if (status === 'done' && addToCatalog) {
      const name = reqRow.profession.trim();
      const exists = await prisma.profession.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (!exists) createdProfession = await prisma.profession.create({ data: { name } });
    }

    const updated = await (prisma as any).professionRequest.update({
      where: { id: req.params.id },
      data: { status, resolvedAt: status === 'pending' ? null : new Date() },
    });

    // Сообщим автору запроса о результате — через notify(): колокольчик,
    // сокет и push, а не только тихая запись в БД.
    if (status !== 'pending') {
      await notify({
        userId: reqRow.userId,
        type: 'support',
        title: status === 'done' ? '✅ Профессия добавлена' : 'Запрос по профессии рассмотрен',
        body: status === 'done'
          ? `«${reqRow.profession}» появилась в каталоге — выберите её в своём профиле.`
          : `«${reqRow.profession}» пока не добавили. Спасибо за предложение!`,
        link: status === 'done' ? '/professions/new' : '/profile',
      });
    }

    res.json({ ...updated, createdProfession });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── FieldOfActivity ───────────────────────────────────────────────────────
router.get('/fields-of-activity', async (_req, res) => {
  const items = await prisma.fieldOfActivity.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(items);
});
router.post('/fields-of-activity', async (req, res) => {
  try {
    const item = await prisma.fieldOfActivity.create({ data: { name: req.body.name } });
    res.status(201).json(item);
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

    // Если профессию добавили напрямую (мимо очереди запросов) — закрыть
    // зависшие pending-запросы с этим названием и уведомить их авторов
    // (кейс «Бузукист»: профессия появилась, а запрос остался висеть).
    const pending = await (prisma as any).professionRequest.findMany({
      where: { status: 'pending', profession: { equals: item.name.trim(), mode: 'insensitive' } },
    });
    for (const pr of pending) {
      await (prisma as any).professionRequest.update({
        where: { id: pr.id },
        data: { status: 'done', resolvedAt: new Date() },
      });
      await notify({
        userId: pr.userId,
        type: 'support',
        title: '✅ Профессия добавлена',
        body: `«${pr.profession}» появилась в каталоге — выберите её в своём профиле.`,
        link: '/professions/new',
      });
    }

    res.status(201).json(item);
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
      section: { select: { id: true, name: true } },
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
  try { res.status(201).json(await prisma.genre.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
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
  try { res.status(201).json(await prisma.workFormat.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
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
  try { res.status(201).json(await prisma.professionFeature.create({ data: { name: req.body.name } })); }
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
  try { res.status(201).json(await prisma.employmentType.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
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
  try { res.status(201).json(await prisma.skillLevel.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
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
  try { res.status(201).json(await prisma.availability.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
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
  try { res.status(201).json(await prisma.geography.create({ data: { name: req.body.name, sortOrder: req.body.sortOrder ?? 0 } })); }
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
    res.status(201).json(await prisma.priceRange.create({
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
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(items);
});
router.post('/directions', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name required' });
    const item = await prisma.direction.create({ data: { name: req.body.name, allowedFilterTypes: [] } });
    res.status(201).json(item);
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
// Attach services to a direction (M2M removed — endpoint is now a no-op stub)
router.put('/directions/:id/services', async (req, res) => {
  try {
    const item = await prisma.direction.findUnique({
      where: { id: req.params.id },
      include: { fieldOfActivity: { select: { id: true, name: true } } },
    });
    res.json(item ?? {});
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
  try { res.status(201).json(await prisma.artist.create({ data: { name: req.body.name } })); }
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
// For a set of artists, find OTHER artists sharing the same normalized name —
// the duplicate-name signal the moderator needs when approving a verification.
// Returns a map artistId → [{ id, name, verified }].
async function duplicatesByArtist(
  artists: { id: string; nameNorm: string | null }[],
): Promise<Map<string, { id: string; name: string; verified: boolean }[]>> {
  const map = new Map<string, { id: string; name: string; verified: boolean }[]>();
  const norms = [...new Set(artists.map(a => a.nameNorm).filter((n): n is string => !!n))];
  if (!norms.length) return map;
  const same = await prisma.artist.findMany({
    where: { nameNorm: { in: norms } },
    select: { id: true, name: true, nameNorm: true, status: true },
  });
  for (const a of artists) {
    if (!a.nameNorm) continue;
    const dups = same
      .filter(s => s.nameNorm === a.nameNorm && s.id !== a.id)
      .map(s => ({ id: s.id, name: s.name, verified: s.status === 'VERIFIED' }));
    if (dups.length) map.set(a.id, dups);
  }
  return map;
}

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
    const dupMap = await duplicatesByArtist(artists);
    res.json(artists.map(a => ({ ...a, listeners: Number(a.listeners), genres: a.genres.map(ag => ag.genre), followersCount: a._count.followers, duplicates: dupMap.get(a.id) || [] })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /admin/artists/verification — list PENDING artists with proof URL awaiting verification
router.get('/artists/verification', authenticate, requireAdmin, async (_req, res) => {
  try {
    const artists = await prisma.artist.findMany({
      where: { status: 'PENDING', verificationProofUrl: { not: null } },
      include: {
        submittedByUser: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        genres: { include: { genre: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });
    const dupMap = await duplicatesByArtist(artists);
    res.json(artists.map(a => ({ ...a, listeners: Number(a.listeners), genres: a.genres.map(ag => ag.genre), duplicates: dupMap.get(a.id) || [] })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Helper: recipients to notify about an artist moderation result (owner, submitter, fallback admins).
async function artistNotifyRecipients(artistId: string, submittedById: string | null): Promise<string[]> {
  const ids = new Set<string>();
  const owner = await prisma.userArtist.findFirst({ where: { artistId, isOwner: true }, select: { userId: true } });
  if (owner) ids.add(owner.userId);
  if (submittedById) ids.add(submittedById);
  return [...ids];
}

// PATCH /admin/artists/:id/reject — reject with reason
router.patch('/artists/:id/reject', authenticate, requireAdmin, async (req: AuthRequest, res) => {
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

    const recipients = await artistNotifyRecipients(artist.id, artist.submittedById);
    const reasonText = reason ? ` Причина: ${reason}.` : '';
    await notifyMany(recipients, {
      actorId: req.userId, type: 'artist_rejected',
      title: 'Заявка отклонена',
      body: `Заявка на верификацию «${artist.name}» отклонена.${reasonText} Исправьте данные и отправьте повторно.`,
      link: `/artist/${artist.id}`,
    });

    res.json({ ...artist, listeners: Number(artist.listeners) });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// PATCH /admin/artists/:id/verify — mark artist as VERIFIED after checking proof
router.patch('/artists/:id/verify', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const artist = await prisma.artist.update({
      where: { id: req.params.id },
      data: { status: 'VERIFIED', moderatedAt: new Date() },
    });

    const recipients = await artistNotifyRecipients(artist.id, artist.submittedById);
    await notifyMany(recipients, {
      actorId: req.userId, type: 'artist_verified',
      title: 'Артист верифицирован',
      body: `Артист «${artist.name}» успешно верифицирован и добавлен в каталог`,
      link: `/artist/${artist.id}`,
    });

    res.json({ ...artist, listeners: Number(artist.listeners) });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
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
// ── POST /admin/users — create user ──────────────────────────────────────────
router.post('/users', async (req, res) => {
  try {
    const { email, password, firstName, lastName, nickname, phone, city, country, bio, isAdmin } = req.body;
    if (!firstName?.trim() || !lastName?.trim()) return res.status(400).json({ error: 'Имя и фамилия обязательны' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    if (!email?.trim()) return res.status(400).json({ error: 'Email обязателен' });

    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'Email уже занят' });

    if (nickname?.trim()) {
      const nclash = await prisma.user.findFirst({ where: { nicknameNorm: yoNorm(nickname.trim()) }, select: { id: true } });
      if (nclash) return res.status(409).json({ error: 'Этот никнейм уже занят' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        password: hashed,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname?.trim() || null,
        phone: phone?.trim() || null,
        city: city?.trim() || null,
        country: country?.trim() || null,
        bio: bio?.trim() || null,
        isAdmin: !!isAdmin,
      },
      select: {
        id: true, firstName: true, lastName: true, nickname: true,
        email: true, avatar: true, isAdmin: true, isBlocked: true,
        isPremium: true, isVerified: true, isPro: true, proUntil: true, createdAt: true,
        city: true, country: true, bio: true, phone: true,
      },
    });
    res.status(201).json(user);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ── PATCH /admin/users/:id — edit user card ───────────────────────────────────
router.patch('/users/:id', async (req, res) => {
  try {
    const { firstName, lastName, nickname, email, phone, city, country, bio, password, isAdmin } = req.body;
    const data: Record<string, any> = {};
    if (firstName !== undefined) data.firstName = firstName.trim();
    if (lastName !== undefined) data.lastName = lastName.trim();
    if (nickname !== undefined) {
      const nk = (nickname ?? '').trim();
      if (nk) {
        const nclash = await prisma.user.findFirst({ where: { nicknameNorm: yoNorm(nk), NOT: { id: req.params.id } }, select: { id: true } });
        if (nclash) return res.status(409).json({ error: 'Этот никнейм уже занят' });
      }
      data.nickname = nk || null;
    }
    if (email !== undefined) data.email = email.trim().toLowerCase() || null;
    if (phone !== undefined) data.phone = phone.trim() || null;
    if (city !== undefined) data.city = city.trim() || null;
    if (country !== undefined) data.country = country.trim() || null;
    if (bio !== undefined) data.bio = bio.trim() || null;
    if (isAdmin !== undefined) data.isAdmin = !!isAdmin;
    if (password && password.length >= 6) data.password = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true, firstName: true, lastName: true, nickname: true,
        email: true, avatar: true, isAdmin: true, isBlocked: true,
        isPremium: true, isVerified: true, isPro: true, proUntil: true, createdAt: true,
        city: true, country: true, bio: true, phone: true,
      },
    });
    res.json(user);
  } catch (e: any) {
    // TOCTOU on nickname: a concurrent change can pass the pre-check and trip the
    // DB unique index — return a clean 409 rather than leaking the raw DB error.
    if (e?.code === 'P2002') {
      const target = String(e?.meta?.target ?? '');
      if (target.toLowerCase().includes('nickname')) return res.status(409).json({ error: 'Этот никнейм уже занят' });
      return res.status(409).json({ error: 'Значение уже занято' });
    }
    res.status(400).json({ error: e.message });
  }
});

router.get('/users', async (req, res) => {
  const search = (req.query.search as string) || '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const sq = yoNorm(search);
  const where = search ? {
    OR: [
      { firstNameNorm: { contains: sq } },
      { lastNameNorm: { contains: sq } },
      { nicknameNorm: { contains: sq } },
      { emailNorm: { contains: sq } },
    ],
  } : {};
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, nickname: true,
        email: true, avatar: true, isAdmin: true, isBlocked: true,
        isPremium: true, isVerified: true, isPro: true, proUntil: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  res.json({ users, total, page, limit });
});

router.patch('/users/:id/verify-email', async (req, res) => {
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { emailVerified: true, emailVerificationCode: null, emailVerificationExpires: null },
      select: { id: true, email: true, emailVerified: true },
    });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
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

// Toggle effective Pro. Active (manual flag OR unexpired subscription) → fully
// revoke (clears both isPro and the timed proUntil, so a mistakenly accepted
// donation can be annulled). Inactive → grant permanent manual Pro.
router.patch('/users/:id/pro', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { isPro: true, proUntil: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const active = user.isPro || (user.proUntil ? new Date(user.proUntil).getTime() > Date.now() : false);
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: active ? { isPro: false, proUntil: null } : { isPro: true },
      select: { id: true, isPro: true, proUntil: true },
    });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Cascade deletes are handled by Prisma FK onDelete: Cascade rules.
    // submittedById on Artist uses onDelete: SetNull — groups they created remain but unlinked.
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ── User Service Moderation ───────────────────────────────────────────────────

router.get('/user-services/pending', async (_req, res) => {
  try {
    const services = await prisma.userService.findMany({
      where: { status: 'pending_review' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        service: { select: { name: true } },
        profession: { select: { name: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });
    res.json(services);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch('/user-services/:id/approve', async (req, res) => {
  try {
    const us = await prisma.userService.update({
      where: { id: req.params.id },
      data: { status: 'active' },
      select: { id: true, userId: true, service: { select: { name: true } } },
    });
    try {
      const notif = await prisma.notification.create({
        data: {
          userId: us.userId,
          type: 'service_approved_ready_to_post',
          title: 'Услуга опубликована',
          body: `Ваша услуга «${us.service.name}» прошла модерацию и теперь видна в каталоге`,
          link: `/services/${us.id}?showPostDialog=1`,
        },
      });
      const { emitToUser } = await import('../socket');
      emitToUser(us.userId, 'new_notification', notif);
    } catch {}
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch('/user-services/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body as { reason?: string };
    const us = await prisma.userService.update({
      where: { id: req.params.id },
      data: { status: 'draft' },
      select: { id: true, userId: true, service: { select: { name: true } } },
    });
    try {
      const notif = await prisma.notification.create({
        data: {
          userId: us.userId,
          type: 'service_rejected',
          title: 'Услуга не прошла модерацию',
          body: reason ? `«${us.service.name}»: ${reason}` : `Услуга «${us.service.name}» возвращена в черновики`,
          link: `/services/${us.id}`,
        },
      });
      const { emitToUser } = await import('../socket');
      emitToUser(us.userId, 'new_notification', notif);
    } catch {}
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Pro Donations ───────────────────────────────────────────────────────────
const donationUserSelect = {
  id: true, firstName: true, lastName: true, nickname: true,
  email: true, proUntil: true, isPro: true,
} as const;

const withIsPro = <T extends { user: { isPro: boolean; proUntil: Date | null } }>(row: T) => ({
  ...row,
  user: { ...row.user, isPro: isProActive(row.user) },
});

// GET /admin/donations — list donation codes (newest first), optional ?status= filter.
// Pending (non-ACTIVATED) rows are surfaced first so the team sees them at a glance.
router.get('/donations', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const where = status ? { status: status as any } : {};
    const donations = await prisma.donationCode.findMany({
      where,
      include: { user: { select: donationUserSelect } },
      orderBy: { createdAt: 'desc' },
    });
    // Surface pending (non-ACTIVATED) rows first; keep newest-first within each group.
    const sorted = [...donations].sort((a, b) => {
      const ax = a.status === 'ACTIVATED' ? 1 : 0;
      const bx = b.status === 'ACTIVATED' ? 1 : 0;
      return ax - bx; // stable sort preserves the createdAt-desc order within groups
    });
    res.json(sorted.map(withIsPro));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /admin/donations/:id/activate — grant a Pro month and mark the code ACTIVATED.
router.post('/donations/:id/activate', async (req, res) => {
  try {
    const donation = await prisma.donationCode.findUnique({ where: { id: req.params.id } });
    if (!donation) return res.status(404).json({ error: 'Донат не найден' });
    if (donation.status === 'ACTIVATED') return res.status(400).json({ error: 'Донат уже активирован' });

    await grantProMonth(donation.userId, 'donation');

    const { amount, note } = req.body as { amount?: number; note?: string };
    const data: any = { status: 'ACTIVATED', activatedAt: new Date() };
    if (amount !== undefined) data.amount = amount === null ? null : Number(amount);
    if (note !== undefined) data.note = note || null;

    const updated = await prisma.donationCode.update({
      where: { id: donation.id },
      data,
      include: { user: { select: donationUserSelect } },
    });
    res.json(withIsPro(updated));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// POST /admin/users/:id/grant-pro-month — manual fallback for the "forgot the code" case.
router.post('/users/:id/grant-pro-month', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const proUntil = await grantProMonth(user.id, 'admin');
    res.json({ proUntil });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ── Site Settings ──────────────────────────────────────────────────────────────
import { updateSiteSettings } from './site-settings';

router.put('/site-settings', async (req, res) => {
  try {
    await updateSiteSettings(req.body as Record<string, string>);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
