import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index';
import { waitlistLimiter } from '../middleware/rateLimiter';
import { tgEvent } from '../utils/telegram';

const router = Router();

const WAITLIST_TYPES = ['resident_waitlist', 'listener', 'customer', 'company'] as const;

const waitlistSchema = z.object({
  // Trim + lowercase before validating, so pasted spaces / caps don't break it.
  email: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.string().email('Некорректный email'),
  ),
  type: z.enum(WAITLIST_TYPES),
  // Both consents (152-ФЗ + закон о рекламе) are mandatory — the front-end gates
  // the button on them, but this is the real server-side guard.
  consentPd: z.boolean().refine((v) => v === true, { message: 'Требуется согласие на обработку персональных данных' }),
  consentMarketing: z.boolean().refine((v) => v === true, { message: 'Требуется согласие на рекламные и информационные рассылки' }),
});

// POST /api/waitlist — landing waitlist sign-up (public, closed launch).
// Upsert by email: a repeat submit is silently accepted, never duplicated.
router.post('/', waitlistLimiter, async (req, res) => {
  try {
    const data = waitlistSchema.parse(req.body);
    const entry = await prisma.waitlistEntry.upsert({
      where: { email: data.email as string },
      update: { type: data.type, consentPd: true, consentMarketing: true },
      create: { email: data.email as string, type: data.type, consentPd: true, consentMarketing: true },
    });
    // Notify the monitor bot only on the first sign-up (created == updated).
    if (entry.createdAt.getTime() === entry.updatedAt.getTime()) {
      try { tgEvent.waitlist(entry.email, entry.type); } catch {}
    }
    return res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message || 'Проверьте поля формы' });
    }
    console.error('[waitlist] POST /', err);
    return res.status(500).json({ error: 'Не удалось сохранить заявку. Попробуйте позже.' });
  }
});

export default router;
