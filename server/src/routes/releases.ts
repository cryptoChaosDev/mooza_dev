import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { StreamingPlatform } from '@prisma/client';
import { fetchStreamMetadata } from '../utils/streamMetadata';
import { notify } from '../utils/notify';

const router = Router();

const PLATFORMS: StreamingPlatform[] = ['VK', 'SPOTIFY', 'YANDEX_MUSIC', 'APPLE_MUSIC'];

// ── helpers ──────────────────────────────────────────────────────────────────

// Artist admin = confirmed UserArtist with isAdmin true. System admins do NOT get
// edit rights on artists they don't belong to.
async function isArtistAdmin(artistId: string, userId: string): Promise<boolean> {
  const ua = await prisma.userArtist.findFirst({
    where: { artistId, userId, isAdmin: true, inviteStatus: 'ACCEPTED' },
    select: { id: true },
  });
  return !!ua;
}

async function actorName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
}

// Admin recipients for a release's artist (confirmed admins, deduped).
async function adminRecipients(artistId: string): Promise<string[]> {
  const admins = await prisma.userArtist.findMany({
    where: { artistId, isAdmin: true, inviteStatus: 'ACCEPTED' },
    select: { userId: true },
  });
  return [...new Set(admins.map((a) => a.userId))];
}

function serializeParticipant(p: any) {
  return {
    id: p.id,
    userId: p.userId,
    confirmStatus: p.confirmStatus,
    user: p.user
      ? {
          id: p.user.id,
          firstName: p.user.firstName,
          lastName: p.user.lastName,
          avatar: p.user.avatar,
        }
      : null,
    roles: (p.roles ?? []).map((r: any) => ({ id: r.role.id, name: r.role.name })),
  };
}

const participantInclude = {
  user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
  roles: { include: { role: { select: { id: true, name: true } } } },
} as const;

// ── POST /api/releases/metadata — best-effort prefill (auth) ──────────────────
router.post('/metadata', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { platform, url } = req.body as { platform?: string; url?: string };
    if (!url) return res.json({});
    const meta = await fetchStreamMetadata(platform ?? '', url);
    return res.json(meta);
  } catch (err) {
    console.error('[releases] POST /metadata', err);
    return res.json({}); // never block the form
  }
});

// ── POST /api/releases — create (artist-admin) ────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { artistId, platform, url, title, coverUrl, releaseDate, participants } = req.body as {
      artistId?: string;
      platform?: string;
      url?: string;
      title?: string;
      coverUrl?: string;
      releaseDate?: string;
      participants?: { userId: string; roleIds?: string[] }[];
    };

    if (!artistId) return res.status(400).json({ error: 'artistId обязателен' });
    if (!title || !title.trim()) return res.status(400).json({ error: 'Название обязательно' });
    if (!url || !url.trim()) return res.status(400).json({ error: 'Ссылка обязательна' });
    if (!platform || !PLATFORMS.includes(platform as StreamingPlatform)) {
      return res.status(400).json({ error: 'Неверная платформа' });
    }

    if (!(await isArtistAdmin(artistId, meId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const cleanParticipants = Array.isArray(participants)
      ? participants.filter((p) => p && typeof p.userId === 'string')
      : [];

    const release = await prisma.release.create({
      data: {
        artistId,
        title: title.trim(),
        coverUrl: coverUrl?.trim() || null,
        releaseDate: releaseDate ? new Date(releaseDate) : null,
        platform: platform as StreamingPlatform,
        url: url.trim(),
        participants: {
          create: cleanParticipants.map((p) => ({
            userId: p.userId,
            confirmStatus: 'PENDING',
            roles: Array.isArray(p.roleIds) && p.roleIds.length
              ? { create: p.roleIds.filter((r) => typeof r === 'string').map((roleId) => ({ roleId })) }
              : undefined,
          })),
        },
      },
      include: { participants: { include: participantInclude } },
    });

    // Notify every participant to confirm their involvement.
    await Promise.all(
      release.participants.map((p) =>
        notify({
          userId: p.userId,
          actorId: meId,
          type: 'release_participant_invite',
          title: artist.name,
          body: `«${artist.name}» указал вас участником релиза «${release.title}». Подтвердите своё участие.`,
          link: `/artist/${artistId}`,
        }),
      ),
    );

    return res.status(201).json({
      id: release.id,
      artistId: release.artistId,
      title: release.title,
      coverUrl: release.coverUrl,
      releaseDate: release.releaseDate,
      platform: release.platform,
      url: release.url,
      participants: release.participants.map(serializeParticipant),
    });
  } catch (err) {
    console.error('[releases] POST /', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/releases/artist/:artistId — list (tiles) ─────────────────────────
router.get('/artist/:artistId', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const releases = await prisma.release.findMany({
      where: { artistId: req.params.artistId },
      orderBy: [{ releaseDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, title: true, coverUrl: true, platform: true, url: true, releaseDate: true },
    });
    return res.json(releases);
  } catch (err) {
    console.error('[releases] GET /artist/:artistId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/releases/:id — detail ────────────────────────────────────────────
router.get('/:id', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const release = await prisma.release.findUnique({
      where: { id: req.params.id },
      include: { participants: { include: participantInclude } },
    });
    if (!release) return res.status(404).json({ error: 'Релиз не найден' });

    // PENDING participants are visible only to artist admins.
    let viewerIsAdmin = false;
    if (req.userId) viewerIsAdmin = await isArtistAdmin(release.artistId, req.userId);

    const participants = release.participants
      .filter((p) => viewerIsAdmin || p.confirmStatus === 'ACCEPTED')
      .map(serializeParticipant);

    return res.json({
      id: release.id,
      artistId: release.artistId,
      title: release.title,
      coverUrl: release.coverUrl,
      releaseDate: release.releaseDate,
      platform: release.platform,
      url: release.url,
      createdAt: release.createdAt,
      viewerIsAdmin,
      participants,
    });
  } catch (err) {
    console.error('[releases] GET /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/releases/:id — edit (artist-admin) ─────────────────────────────
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { title, coverUrl, releaseDate, url, platform, participants } = req.body as {
      title?: string;
      coverUrl?: string | null;
      releaseDate?: string | null;
      url?: string;
      platform?: string;
      participants?: { userId: string; roleIds?: string[] }[];
    };

    const release = await prisma.release.findUnique({
      where: { id: req.params.id },
      include: { participants: true, artist: { select: { id: true, name: true } } },
    });
    if (!release) return res.status(404).json({ error: 'Релиз не найден' });

    if (!(await isArtistAdmin(release.artistId, meId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    if (platform !== undefined && !PLATFORMS.includes(platform as StreamingPlatform)) {
      return res.status(400).json({ error: 'Неверная платформа' });
    }

    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (coverUrl !== undefined) data.coverUrl = coverUrl ? coverUrl.trim() : null;
    if (releaseDate !== undefined) data.releaseDate = releaseDate ? new Date(releaseDate) : null;
    if (url !== undefined) data.url = url.trim();
    if (platform !== undefined) data.platform = platform as StreamingPlatform;

    await prisma.release.update({ where: { id: release.id }, data });

    // Reconcile participants if provided.
    let newlyAdded: string[] = [];
    if (Array.isArray(participants)) {
      const clean = participants.filter((p) => p && typeof p.userId === 'string');
      const desiredUserIds = new Set(clean.map((p) => p.userId));
      const existingByUser = new Map(release.participants.map((p) => [p.userId, p]));

      // Remove participants no longer present (no notification on removal).
      const toRemove = release.participants.filter((p) => !desiredUserIds.has(p.userId));
      if (toRemove.length) {
        await prisma.releaseParticipant.deleteMany({
          where: { id: { in: toRemove.map((p) => p.id) } },
        });
      }

      for (const p of clean) {
        const roleIds = Array.isArray(p.roleIds) ? p.roleIds.filter((r) => typeof r === 'string') : [];
        const existing = existingByUser.get(p.userId);
        if (existing) {
          // Replace roles for existing participant.
          await prisma.$transaction([
            prisma.releaseParticipantRole.deleteMany({ where: { participantId: existing.id } }),
            ...(roleIds.length
              ? [prisma.releaseParticipantRole.createMany({
                  data: roleIds.map((roleId) => ({ participantId: existing.id, roleId })),
                  skipDuplicates: true,
                })]
              : []),
          ]);
        } else {
          // New participant → create (PENDING) + notify.
          await prisma.releaseParticipant.create({
            data: {
              releaseId: release.id,
              userId: p.userId,
              confirmStatus: 'PENDING',
              roles: roleIds.length ? { create: roleIds.map((roleId) => ({ roleId })) } : undefined,
            },
          });
          newlyAdded.push(p.userId);
        }
      }
    }

    const finalTitle = data.title ?? release.title;
    await Promise.all(
      newlyAdded.map((userId) =>
        notify({
          userId,
          actorId: meId,
          type: 'release_participant_invite',
          title: release.artist.name,
          body: `«${release.artist.name}» указал вас участником релиза «${finalTitle}». Подтвердите своё участие.`,
          link: `/artist/${release.artistId}`,
        }),
      ),
    );

    const updated = await prisma.release.findUnique({
      where: { id: release.id },
      include: { participants: { include: participantInclude } },
    });

    return res.json({
      id: updated!.id,
      artistId: updated!.artistId,
      title: updated!.title,
      coverUrl: updated!.coverUrl,
      releaseDate: updated!.releaseDate,
      platform: updated!.platform,
      url: updated!.url,
      participants: updated!.participants.map(serializeParticipant),
    });
  } catch (err) {
    console.error('[releases] PATCH /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/releases/participants/:participantId/confirm — invitee ─────────
router.patch('/participants/:participantId/confirm', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const participant = await prisma.releaseParticipant.findUnique({
      where: { id: req.params.participantId },
      include: { release: { include: { artist: { select: { id: true, name: true } } } } },
    });
    if (!participant) return res.status(404).json({ error: 'Участие не найдено' });
    if (participant.userId !== meId) return res.status(403).json({ error: 'Нет прав' });

    await prisma.releaseParticipant.update({
      where: { id: participant.id },
      data: { confirmStatus: 'ACCEPTED' },
    });

    const name = await actorName(meId);
    const recipients = (await adminRecipients(participant.release.artistId)).filter((id) => id !== meId);
    await Promise.all(
      recipients.map((rid) =>
        notify({
          userId: rid,
          actorId: meId,
          type: 'release_participant_confirmed',
          title: participant.release.artist.name,
          body: `${name} подтвердил участие в релизе «${participant.release.title}».`,
          link: `/artist/${participant.release.artistId}`,
        }),
      ),
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[releases] PATCH /participants/:id/confirm', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/releases/participants/:participantId/decline — invitee ─────────
router.patch('/participants/:participantId/decline', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const participant = await prisma.releaseParticipant.findUnique({
      where: { id: req.params.participantId },
      include: { release: { include: { artist: { select: { id: true, name: true } } } } },
    });
    if (!participant) return res.status(404).json({ error: 'Участие не найдено' });
    if (participant.userId !== meId) return res.status(403).json({ error: 'Нет прав' });

    await prisma.releaseParticipant.update({
      where: { id: participant.id },
      data: { confirmStatus: 'DECLINED' },
    });

    const name = await actorName(meId);
    const recipients = (await adminRecipients(participant.release.artistId)).filter((id) => id !== meId);
    await Promise.all(
      recipients.map((rid) =>
        notify({
          userId: rid,
          actorId: meId,
          type: 'release_participant_declined',
          title: participant.release.artist.name,
          body: `${name} отклонил участие в релизе «${participant.release.title}».`,
          link: `/artist/${participant.release.artistId}`,
        }),
      ),
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[releases] PATCH /participants/:id/decline', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/releases/:id — delete (artist-admin) ──────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const release = await prisma.release.findUnique({
      where: { id: req.params.id },
      include: { participants: true, artist: { select: { id: true, name: true } } },
    });
    if (!release) return res.status(404).json({ error: 'Релиз не найден' });

    if (!(await isArtistAdmin(release.artistId, meId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    // Notify CONFIRMED participants before deletion (cascade removes the rows).
    const confirmed = release.participants.filter((p) => p.confirmStatus === 'ACCEPTED');
    await Promise.all(
      confirmed.map((p) =>
        notify({
          userId: p.userId,
          actorId: meId,
          type: 'release_deleted',
          title: release.artist.name,
          body: `Релиз «${release.title}» артиста «${release.artist.name}» был удалён.`,
          link: `/artist/${release.artistId}`,
        }),
      ),
    );

    await prisma.release.delete({ where: { id: release.id } });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[releases] DELETE /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
