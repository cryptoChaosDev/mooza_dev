import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

// Легаси «Группы» (/api/groups). Артист и группа — одна сущность, всё
// управление живёт в /api/artists с правами через UserArtist (isOwner/isAdmin).
//
// Старые мутирующие ручки (create/patch/submit/invite/accept/decline/delete/
// remove member/transfer-owner/leave) удалены: права в них выдавались по
// Artist.submittedById (перезаписывался при подаче на верификацию и не менялся
// при передаче владения) — бывший владелец или любой подавший админ мог удалить/
// переименовать верифицированного артиста и исключать участников, а
// /invites/:id/accept подтверждал собственную заявку в обход одобрения.
// Живой клиент использует только GET /my (рейл «Артисты» в профиле).

const router = Router();

// ── GET /api/groups/my ────────────────────────────────────────────────────────
// Every artist the user is a CONFIRMED member of (owner included) — regardless
// of type (SOLO/GROUP/COVER_GROUP/…). Публичные поля карточки + только своя
// строка участия (роль на плитке); служебные поля верификации не отдаём.
router.get('/my', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const groups = await prisma.artist.findMany({
      where: { userArtists: { some: { userId: meId, inviteStatus: 'ACCEPTED' } } },
      select: {
        id: true,
        slug: true,
        name: true,
        type: true,
        city: true,
        avatar: true,
        status: true,
        activityStatus: true,
        updatedAt: true,
        userArtists: {
          where: { userId: meId, inviteStatus: 'ACCEPTED' },
          select: {
            id: true,
            isOwner: true,
            isAdmin: true,
            participationStatus: true,
            user: { select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true } },
            profession: { select: { id: true, name: true } },
            roles: { select: { role: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(groups);
  } catch (err) {
    console.error('[groups] GET /my', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
