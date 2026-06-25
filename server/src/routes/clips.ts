import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { ClipPlatform } from '@prisma/client';
import { fetchStreamMetadata } from '../utils/streamMetadata';
import { notify } from '../utils/notify';

const router = Router();

const PLATFORMS: ClipPlatform[] = ['VK_VIDEO', 'RUTUBE', 'YOUTUBE'];

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

// ── POST /api/clips/metadata — best-effort prefill (auth) ─────────────────────
router.post('/metadata', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { platform, url } = req.body as { platform?: string; url?: string };
    if (!url) return res.json({});
    const meta = await fetchStreamMetadata(platform ?? '', url);
    return res.json(meta);
  } catch (err) {
    console.error('[clips] POST /metadata', err);
    return res.json({});
  }
});

// ── POST /api/clips — create (artist-admin) ───────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { artistId, platform, url, title, coverUrl, participants } = req.body as {
      artistId?: string;
      platform?: string;
      url?: string;
      title?: string; // название трека
      coverUrl?: string;
      participants?: { userId: string; roleIds?: string[] }[];
    };

    if (!artistId) return res.status(400).json({ error: 'artistId обязателен' });
    if (!title || !title.trim()) return res.status(400).json({ error: 'Название трека обязательно' });
    if (!url || !url.trim()) return res.status(400).json({ error: 'Ссылка обязательна' });
    if (!platform || !PLATFORMS.includes(platform as ClipPlatform)) {
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

    const clip = await prisma.clip.create({
      data: {
        artistId,
        title: title.trim(),
        coverUrl: coverUrl?.trim() || null,
        platform: platform as ClipPlatform,
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

    await Promise.all(
      clip.participants.map((p) =>
        notify({
          userId: p.userId,
          actorId: meId,
          type: 'clip_participant_invite',
          title: artist.name,
          body: `«${artist.name}» указал вас участником клипа «${clip.title}». Подтвердите своё участие.`,
          link: `/artist/${artistId}`,
        }),
      ),
    );

    return res.status(201).json({
      id: clip.id,
      artistId: clip.artistId,
      title: clip.title,
      coverUrl: clip.coverUrl,
      platform: clip.platform,
      url: clip.url,
      participants: clip.participants.map(serializeParticipant),
    });
  } catch (err) {
    console.error('[clips] POST /', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/clips/artist/:artistId — list (tiles) ────────────────────────────
router.get('/artist/:artistId', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const clips = await prisma.clip.findMany({
      where: { artistId: req.params.artistId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, coverUrl: true, platform: true, url: true },
    });
    return res.json(clips);
  } catch (err) {
    console.error('[clips] GET /artist/:artistId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/clips/:id — detail ───────────────────────────────────────────────
router.get('/:id', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const clip = await prisma.clip.findUnique({
      where: { id: req.params.id },
      include: { participants: { include: participantInclude } },
    });
    if (!clip) return res.status(404).json({ error: 'Клип не найден' });

    let viewerIsAdmin = false;
    if (req.userId) viewerIsAdmin = await isArtistAdmin(clip.artistId, req.userId);

    const participants = clip.participants
      .filter((p) => viewerIsAdmin || p.confirmStatus === 'ACCEPTED')
      .map(serializeParticipant);

    return res.json({
      id: clip.id,
      artistId: clip.artistId,
      title: clip.title,
      coverUrl: clip.coverUrl,
      platform: clip.platform,
      url: clip.url,
      createdAt: clip.createdAt,
      viewerIsAdmin,
      participants,
    });
  } catch (err) {
    console.error('[clips] GET /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/clips/:id — edit (artist-admin) ────────────────────────────────
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { title, coverUrl, url, platform, participants } = req.body as {
      title?: string;
      coverUrl?: string | null;
      url?: string;
      platform?: string;
      participants?: { userId: string; roleIds?: string[] }[];
    };

    const clip = await prisma.clip.findUnique({
      where: { id: req.params.id },
      include: { participants: true, artist: { select: { id: true, name: true } } },
    });
    if (!clip) return res.status(404).json({ error: 'Клип не найден' });

    if (!(await isArtistAdmin(clip.artistId, meId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    if (platform !== undefined && !PLATFORMS.includes(platform as ClipPlatform)) {
      return res.status(400).json({ error: 'Неверная платформа' });
    }

    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (coverUrl !== undefined) data.coverUrl = coverUrl ? coverUrl.trim() : null;
    if (url !== undefined) data.url = url.trim();
    if (platform !== undefined) data.platform = platform as ClipPlatform;

    await prisma.clip.update({ where: { id: clip.id }, data });

    let newlyAdded: string[] = [];
    if (Array.isArray(participants)) {
      const clean = participants.filter((p) => p && typeof p.userId === 'string');
      const desiredUserIds = new Set(clean.map((p) => p.userId));
      const existingByUser = new Map(clip.participants.map((p) => [p.userId, p]));

      const toRemove = clip.participants.filter((p) => !desiredUserIds.has(p.userId));
      if (toRemove.length) {
        await prisma.clipParticipant.deleteMany({
          where: { id: { in: toRemove.map((p) => p.id) } },
        });
      }

      for (const p of clean) {
        const roleIds = Array.isArray(p.roleIds) ? p.roleIds.filter((r) => typeof r === 'string') : [];
        const existing = existingByUser.get(p.userId);
        if (existing) {
          await prisma.$transaction([
            prisma.clipParticipantRole.deleteMany({ where: { participantId: existing.id } }),
            ...(roleIds.length
              ? [prisma.clipParticipantRole.createMany({
                  data: roleIds.map((roleId) => ({ participantId: existing.id, roleId })),
                  skipDuplicates: true,
                })]
              : []),
          ]);
        } else {
          await prisma.clipParticipant.create({
            data: {
              clipId: clip.id,
              userId: p.userId,
              confirmStatus: 'PENDING',
              roles: roleIds.length ? { create: roleIds.map((roleId) => ({ roleId })) } : undefined,
            },
          });
          newlyAdded.push(p.userId);
        }
      }
    }

    const finalTitle = data.title ?? clip.title;
    await Promise.all(
      newlyAdded.map((userId) =>
        notify({
          userId,
          actorId: meId,
          type: 'clip_participant_invite',
          title: clip.artist.name,
          body: `«${clip.artist.name}» указал вас участником клипа «${finalTitle}». Подтвердите своё участие.`,
          link: `/artist/${clip.artistId}`,
        }),
      ),
    );

    const updated = await prisma.clip.findUnique({
      where: { id: clip.id },
      include: { participants: { include: participantInclude } },
    });

    return res.json({
      id: updated!.id,
      artistId: updated!.artistId,
      title: updated!.title,
      coverUrl: updated!.coverUrl,
      platform: updated!.platform,
      url: updated!.url,
      participants: updated!.participants.map(serializeParticipant),
    });
  } catch (err) {
    console.error('[clips] PATCH /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/clips/participants/:participantId/confirm — invitee ────────────
router.patch('/participants/:participantId/confirm', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const participant = await prisma.clipParticipant.findUnique({
      where: { id: req.params.participantId },
      include: { clip: { include: { artist: { select: { id: true, name: true } } } } },
    });
    if (!participant) return res.status(404).json({ error: 'Участие не найдено' });
    if (participant.userId !== meId) return res.status(403).json({ error: 'Нет прав' });

    await prisma.clipParticipant.update({
      where: { id: participant.id },
      data: { confirmStatus: 'ACCEPTED' },
    });

    const name = await actorName(meId);
    const recipients = (await adminRecipients(participant.clip.artistId)).filter((id) => id !== meId);
    await Promise.all(
      recipients.map((rid) =>
        notify({
          userId: rid,
          actorId: meId,
          type: 'clip_participant_confirmed',
          title: participant.clip.artist.name,
          body: `${name} подтвердил участие в клипе «${participant.clip.title}».`,
          link: `/artist/${participant.clip.artistId}`,
        }),
      ),
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[clips] PATCH /participants/:id/confirm', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/clips/participants/:participantId/decline — invitee ────────────
router.patch('/participants/:participantId/decline', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const participant = await prisma.clipParticipant.findUnique({
      where: { id: req.params.participantId },
      include: { clip: { include: { artist: { select: { id: true, name: true } } } } },
    });
    if (!participant) return res.status(404).json({ error: 'Участие не найдено' });
    if (participant.userId !== meId) return res.status(403).json({ error: 'Нет прав' });

    await prisma.clipParticipant.update({
      where: { id: participant.id },
      data: { confirmStatus: 'DECLINED' },
    });

    const name = await actorName(meId);
    const recipients = (await adminRecipients(participant.clip.artistId)).filter((id) => id !== meId);
    await Promise.all(
      recipients.map((rid) =>
        notify({
          userId: rid,
          actorId: meId,
          type: 'clip_participant_declined',
          title: participant.clip.artist.name,
          body: `${name} отклонил участие в клипе «${participant.clip.title}».`,
          link: `/artist/${participant.clip.artistId}`,
        }),
      ),
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[clips] PATCH /participants/:id/decline', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/clips/:id — delete (artist-admin) ─────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const clip = await prisma.clip.findUnique({
      where: { id: req.params.id },
      include: { participants: true, artist: { select: { id: true, name: true } } },
    });
    if (!clip) return res.status(404).json({ error: 'Клип не найден' });

    if (!(await isArtistAdmin(clip.artistId, meId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const confirmed = clip.participants.filter((p) => p.confirmStatus === 'ACCEPTED');
    await Promise.all(
      confirmed.map((p) =>
        notify({
          userId: p.userId,
          actorId: meId,
          type: 'clip_deleted',
          title: clip.artist.name,
          body: `Клип «${clip.title}» артиста «${clip.artist.name}» был удалён.`,
          link: `/artist/${clip.artistId}`,
        }),
      ),
    );

    await prisma.clip.delete({ where: { id: clip.id } });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[clips] DELETE /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
