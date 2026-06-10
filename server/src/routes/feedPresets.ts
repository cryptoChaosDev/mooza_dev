import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { limitsFor } from '../utils/pro';

const router = Router();

const NAME_MAX = 40;

/** Validate + normalize a preset name. Returns trimmed name or null if invalid. */
function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (name.length === 0 || name.length > NAME_MAX) return null;
  return name;
}

/** True if `filters` is a plain object (not null / array). */
function isFiltersObject(filters: unknown): boolean {
  return (
    typeof filters === 'object' &&
    filters !== null &&
    !Array.isArray(filters)
  );
}

/**
 * GET /api/feed-presets
 * List the caller's presets, ordered by sortOrder then createdAt.
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const presets = await prisma.feedPreset.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(presets);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/feed-presets
 * Body: { name, filters }
 * Creates a preset for the caller, enforcing the Pro-based cap.
 */
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: `Название должно быть не пустым и не длиннее ${NAME_MAX} символов` });
    }

    const filters = req.body?.filters;
    if (!isFiltersObject(filters)) {
      return res.status(400).json({ error: 'Некорректные фильтры' });
    }

    // Enforce the per-user cap (1 for free, Infinity for Pro).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPro: true, proUntil: true },
    });
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

    const cap = limitsFor(user).feedPresets;
    const count = await prisma.feedPreset.count({ where: { userId } });
    if (count >= cap) {
      return res.status(400).json({ error: 'Лимит пресетов исчерпан. Несколько пресетов доступны в Pro' });
    }

    const created = await prisma.feedPreset.create({
      data: { userId, name, filters, sortOrder: count },
    });
    res.json(created);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /api/feed-presets/:id
 * Body: { name?, filters? }
 * Updates one of the caller's presets.
 */
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await prisma.feedPreset.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: 'Пресет не найден' });
    }

    const data: Prisma.FeedPresetUpdateInput = {};

    if (req.body?.name !== undefined) {
      const name = normalizeName(req.body.name);
      if (!name) {
        return res.status(400).json({ error: `Название должно быть не пустым и не длиннее ${NAME_MAX} символов` });
      }
      data.name = name;
    }

    if (req.body?.filters !== undefined) {
      if (!isFiltersObject(req.body.filters)) {
        return res.status(400).json({ error: 'Некорректные фильтры' });
      }
      data.filters = req.body.filters;
    }

    const updated = await prisma.feedPreset.update({ where: { id }, data });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/feed-presets/:id
 * Deletes one of the caller's presets.
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await prisma.feedPreset.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: 'Пресет не найден' });
    }

    await prisma.feedPreset.delete({ where: { id } });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
