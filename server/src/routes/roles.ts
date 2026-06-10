import { Router } from 'express';
import { prisma } from '../index';
import { RoleContext } from '@prisma/client';

const router = Router();

// Map lowercase query value → RoleContext enum.
const CONTEXT_MAP: Record<string, RoleContext> = {
  collective: 'COLLECTIVE',
  release: 'RELEASE',
  clip: 'CLIP',
};

// GET /api/roles?context=collective|release|clip
// Returns roles grouped by category, preserving category + role order (sortOrder).
//   → [{ category: string, roles: [{ id, name }] }]
router.get('/', async (req, res) => {
  try {
    const raw = String(req.query.context || 'collective').toLowerCase();
    const context = CONTEXT_MAP[raw];
    if (!context) {
      return res.status(400).json({ error: 'Unknown context. Use collective | release | clip.' });
    }

    const roles = await prisma.role.findMany({
      where: { context },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, name: true, category: true, sortOrder: true },
    });

    // Group by category while preserving first-seen order. Categories are encountered
    // in the order produced by orderBy (category asc, then sortOrder asc), so we track
    // the minimum sortOrder per category to restore the intended catalog ordering.
    const groups = new Map<string, { id: string; name: string }[]>();
    const minSort = new Map<string, number>();
    for (const r of roles) {
      if (!groups.has(r.category)) {
        groups.set(r.category, []);
        minSort.set(r.category, r.sortOrder);
      } else {
        minSort.set(r.category, Math.min(minSort.get(r.category)!, r.sortOrder));
      }
      groups.get(r.category)!.push({ id: r.id, name: r.name });
    }

    const result = [...groups.entries()]
      .sort((a, b) => (minSort.get(a[0])! - minSort.get(b[0])!))
      .map(([category, list]) => ({ category, roles: list }));

    res.json(result);
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to get roles' });
  }
});

export default router;
