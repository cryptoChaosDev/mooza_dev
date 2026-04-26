import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

const DEFAULTS: Record<string, string> = {
  loginEnabled: 'true',
  registrationEnabled: 'true',
};

// Ensure defaults exist, return as plain object
async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.siteSetting.findMany();
  const result: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}

// GET /api/site-settings — public
router.get('/', async (_req, res) => {
  try {
    res.json(await getSettings());
  } catch (error) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/site-settings — admin only (called via admin routes)
export async function updateSiteSettings(updates: Record<string, string>) {
  for (const [key, value] of Object.entries(updates)) {
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

export default router;
