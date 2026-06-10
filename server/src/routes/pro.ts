import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { genDonationCode } from '../utils/pro';

const router = Router();

// ─── User-facing donation endpoints ──────────────────────────────────────────
// All routes below require an authenticated user.

/**
 * POST /api/pro/donation/start
 * Deactivate any existing active codes for the caller, then mint a fresh one.
 * Returns the new code plus the CloudTips donation URL (from env).
 */
router.post('/donation/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Supersede previous active codes.
    await prisma.donationCode.updateMany({
      where: { userId, active: true },
      data: { active: false },
    });

    // Create a new code, retrying on the (rare) unique-collision.
    let created = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const code = genDonationCode();
      try {
        created = await prisma.donationCode.create({
          data: { userId, code, status: 'CREATED', active: true },
          select: { code: true },
        });
      } catch (e) {
        // P2002 = unique constraint failed → regenerate and retry.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }

    if (!created) return res.status(500).json({ error: 'Не удалось сгенерировать код, попробуйте ещё раз' });

    res.json({ code: created.code, cloudTipsUrl: process.env.CLOUDTIPS_URL || '' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/pro/donation/current
 * Return the caller's current active donation code, or { code: null }.
 */
router.get('/donation/current', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const current = await prisma.donationCode.findFirst({
      where: { userId, active: true },
      orderBy: { createdAt: 'desc' },
      select: { code: true, status: true, createdAt: true },
    });
    if (!current) return res.json({ code: null });
    res.json(current);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
