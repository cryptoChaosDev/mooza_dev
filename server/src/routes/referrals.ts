import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

const MAX_LINKS = 20;

// Generate a short unique code (8 chars, url-safe)
function genCode(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

// GET /api/referrals/stats — total referrals count
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
  try {
    const count = await prisma.user.count({ where: { referrerId: req.userId } });
    const perMonth = 10;
    res.json({
      count,
      proMonthsEarned: Math.floor(count / perMonth),
      towardNext: count % perMonth,
      perMonth,
    });
  } catch (error) {
    console.error('Referral stats error:', error);
    res.status(500).json({ error: 'Failed to get referral stats' });
  }
});

// GET /api/referrals/links — list current user's named referral links
router.get('/links', authenticate, async (req: AuthRequest, res) => {
  try {
    const links = await prisma.referralLink.findMany({
      where: { ownerId: req.userId, hiddenAt: null } as any,
      orderBy: { createdAt: 'desc' },
    });
    res.json(links);
  } catch (error) {
    console.error('Referral links error:', error);
    res.status(500).json({ error: 'Failed to get referral links' });
  }
});

// POST /api/referrals/links — create a new named referral link
router.post('/links', authenticate, async (req: AuthRequest, res) => {
  try {
    const label = String(req.body?.label ?? '').trim();
    if (!label) return res.status(400).json({ error: 'Укажите название ссылки' });
    if (label.length > 60) return res.status(400).json({ error: 'Название слишком длинное' });

    // Лимит считаем по ВИДИМЫМ ссылкам: скрытие (как раньше удаление) освобождает слот
    const existing = await prisma.referralLink.count({ where: { ownerId: req.userId, hiddenAt: null } as any });
    if (existing >= MAX_LINKS) {
      return res.status(400).json({ error: `Максимум ${MAX_LINKS} ссылок` });
    }

    // Ensure unique code
    let code = genCode();
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.referralLink.findUnique({ where: { code } });
      if (!clash) break;
      code = genCode();
    }

    const link = await prisma.referralLink.create({
      data: { code, label, ownerId: req.userId! },
    });
    res.status(201).json(link);
  } catch (error) {
    console.error('Create referral link error:', error);
    res.status(500).json({ error: 'Failed to create referral link' });
  }
});

// PATCH /api/referrals/links/:id — rename a link
router.patch('/links/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const label = String(req.body?.label ?? '').trim();
    if (!label) return res.status(400).json({ error: 'Укажите название ссылки' });
    if (label.length > 60) return res.status(400).json({ error: 'Название слишком длинное' });

    const link = await prisma.referralLink.findUnique({ where: { id: req.params.id } });
    if (!link) return res.status(404).json({ error: 'Ссылка не найдена' });
    if (link.ownerId !== req.userId) return res.status(403).json({ error: 'Нет прав' });

    const updated = await prisma.referralLink.update({
      where: { id: req.params.id },
      data: { label },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update referral link error:', error);
    res.status(500).json({ error: 'Failed to update referral link' });
  }
});

// DELETE /api/referrals/links/:id — remove a link
// Логическое удаление: скрываем из списка, но код остаётся рабочим — жёсткое
// удаление ломало уже разосланные приглашения («Регистрация временно закрыта»).
router.delete('/links/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const link = await prisma.referralLink.findUnique({ where: { id: req.params.id } });
    if (!link) return res.status(404).json({ error: 'Ссылка не найдена' });
    if (link.ownerId !== req.userId) return res.status(403).json({ error: 'Нет прав' });

    await prisma.referralLink.update({
      where: { id: req.params.id },
      data: { hiddenAt: new Date() } as any,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Hide referral link error:', error);
    res.status(500).json({ error: 'Failed to hide referral link' });
  }
});

// POST /api/referrals/resolve — resolve a ref code to an owner (used on /register).
// The code can be a single-use ReferralLink.code OR a bare userId (legacy links). Public.
// Returns `used: true` if the single-use link has already been consumed.
router.post('/resolve', async (req, res) => {
  try {
    const code = String(req.body?.code ?? '').trim();
    if (!code) return res.json({ ownerId: null, code: null, used: false });

    const link = await prisma.referralLink.findUnique({
      where: { code },
      select: { id: true, ownerId: true, usedById: true, multiUse: true },
    });
    if (link) {
      if (!link.multiUse && link.usedById) {
        // Одноразовая ссылка уже использована — больше не валидна (кампанию не блокируем)
        return res.json({ ownerId: null, code, used: true });
      }
      await prisma.referralLink.update({
        where: { id: link.id },
        data: { clicks: { increment: 1 } },
      }).catch(() => {});
      return res.json({ ownerId: link.ownerId, code, used: false });
    }

    // Legacy: code is a raw userId (multi-use, kept for backward compatibility)
    const user = await prisma.user.findUnique({ where: { id: code }, select: { id: true } });
    return res.json({ ownerId: user?.id ?? null, code: null, used: false });
  } catch (error) {
    console.error('Resolve referral error:', error);
    res.json({ ownerId: null, code: null, used: false });
  }
});

export default router;
