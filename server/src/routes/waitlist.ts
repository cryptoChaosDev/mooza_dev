import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index';
import { waitlistLimiter } from '../middleware/rateLimiter';
import { tgEvent } from '../utils/telegram';
import { WAITLIST_TYPES, markWaitlistRegistered, sendWaitlistConfirmationOnce, maybeAutoInviteWaitlistEntry } from '../lib/waitlist';

const router = Router();

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
//  • email уже зарегистрирован → заявку не создаём, { ok, alreadyRegistered } (клиент
//    предложит войти); старую заявку с этим email отмечаем «Зарегистрировался».
//  • первая заявка → письмо «Заявка принята»; повторная отправка формы — письмо
//    не чаще раза в 24 ч (lib/waitlist), и только пока заявку не пригласили.
router.post('/', waitlistLimiter, async (req, res) => {
  try {
    const data = waitlistSchema.parse(req.body);
    const email = data.email as string;

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      await markWaitlistRegistered({ userId: user.id, email });
      return res.json({ ok: true, alreadyRegistered: true });
    }

    const fields = { type: data.type, consentPd: true, consentMarketing: data.consentMarketing };
    let created = false;
    let entry = await prisma.waitlistEntry.findUnique({ where: { email } });
    if (entry) {
      entry = await prisma.waitlistEntry.update({ where: { email }, data: fields });
    } else {
      try {
        entry = await prisma.waitlistEntry.create({ data: { email, ...fields } });
        created = true;
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e;
        // Параллельная отправка той же формы успела создать заявку.
        entry = await prisma.waitlistEntry.update({ where: { email }, data: fields });
      }
    }

    // Notify the monitor bot only on the first sign-up.
    // Без email: в мониторинговый чат уходят только событие, тип и счётчик (ПДн не логируем).
    if (created) {
      try {
        const total = await prisma.waitlistEntry.count();
        tgEvent.waitlist(entry.type, total);
      } catch {}
    }

    // Временный авто-режим: сразу приглашаем (письмо со ссылкой + ссылка в ответе,
    // чтобы человек мог зарегистрироваться не дожидаясь письма). Регистрация всё
    // равно подтверждает владение email кодом.
    if (entry.status === 'new') {
      try {
        const inviteUrl = await maybeAutoInviteWaitlistEntry(entry);
        if (inviteUrl) return res.json({ ok: true, invited: true, inviteUrl });
      } catch (autoErr) {
        console.error('[waitlist] auto-invite failed:', autoErr);
      }
    }

    // «Заявка принята» — транзакционное письмо, не зависит от consentMarketing.
    // Best-effort: ошибка письма не ломает ответ формы.
    if (entry.status === 'new') {
      try {
        await sendWaitlistConfirmationOnce(entry);
      } catch (mailErr) {
        console.error('[waitlist] confirmation claim failed:', mailErr);
      }
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
