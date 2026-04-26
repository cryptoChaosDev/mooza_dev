import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/stats', authenticate, async (req: AuthRequest, res) => {
  try {
    const count = await prisma.user.count({
      where: { referrerId: req.userId },
    });
    res.json({ count });
  } catch (error) {
    console.error('Referral stats error:', error);
    res.status(500).json({ error: 'Failed to get referral stats' });
  }
});

export default router;
