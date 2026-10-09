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
  // PD consent (152-FZ) is mandatory — the real server-side guard. Marketing consent is
  // optional: advertising law forbids making it a condition (privacy policy, 4.1).
  consentPd: z.boolean().refine((v) => v === true, { message: 'Требуется согласие на обработку персональных данных' }),
  consentMarketing: z.boolean().optional().default(false),
});

// POST /api/waitlist — landing waitlist sign-up (public, closed launch).
// Upsert by email: a repeat submit is silently accepted, never duplicated.
router.post('/', waitlistLimiter, async (req, res) => {
  try {
    const data = waitlistSchema.parse(req.body);
    const entry = await prisma.waitlistEntry.upsert({
      where: { email: data.email as string },
      update: { type: data.type, consentPd: true, consentMarketing: data.consentMarketing },
      create: { email: data.email as string, type: data.type, consentPd: true, consentMarketing: data.consentMarketing },
    });
    // Notify the monitor bot only on the first sign-up (created == updated).
    // Без email: в мониторинговый чат уходят только событие, тип и счётчик (ПДн не логируем).
    if (entry.createdAt.getTime() === entry.updatedAt.getTime()) {
      try {
        const total = await prisma.waitlistEntry.count();
        tgEvent.waitlist(entry.type, total);
      } catch {}
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
