import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

// Get all fields of activity
router.get('/fields-of-activity', async (_req, res) => {
  try {
    const fields = await prisma.fieldOfActivity.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(fields);
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
