import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { ClipPlatform } from '@prisma/client';
import { detectClipPlatform } from '../lib/mediaPlatforms';
import { fetchStreamMetadata } from '../utils/streamMetadata';
import { notify } from '../utils/notify';
import { isArtistAdmin, artistAdminIds, isUniqueViolation } from '../lib/artistAccess';
import {
  parseTitleInput,
  parseCoverUrlInput,
  parseParticipantsInput,
  checkOutsiderParticipants,
  clipExternalKey,
  MAX_MEDIA_PARTICIPANTS,
} from '../lib/mediaItems';
import { guestReadLimiter } from '../middleware/rateLimiter';
import { sendPublic } from '../middleware/guest';
import { getPublicArtistClips, getPublicClip } from '../lib/publicData';

const router = Router();

const PLATFORM_ERROR = 'Ссылка должна вести на поддерживаемый сервис (ВКонтакте Видео, Rutube, YouTube, Apple Music, Яндекс Музыка)';
const DUPLICATE_ERROR = 'Этот клип уже добавлен у артиста';

// ── helpers ──────────────────────────────────────────────────────────────────

async function actorName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
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

// ── GET /api/clips/participations/pending — my pending participation inbox ─
// MUST be registered before '/:id' so Express doesn't capture the literal path.
router.get('/participations/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const participants = await prisma.clipParticipant.findMany({
      where: { userId: meId, confirmStatus: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        clip: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
            artist: { select: { id: true, name: true, avatar: true } },
          },
        },
        roles: { include: { role: { select: { name: true } } } },
      },
    });

    return res.json(
      participants.map((p) => ({
        id: p.id,
        kind: 'clip' as const,
        clip: {
          id: p.clip.id,
          title: p.clip.title,
          coverUrl: p.clip.coverUrl,
          artist: {
            id: p.clip.artist.id,
            name: p.clip.artist.name,
            avatar: p.clip.artist.avatar,
          },
        },
        roleNames: p.roles.map((r) => r.role.name),
        createdAt: p.createdAt,
      })),
    );
  } catch (err) {
    console.error('[clips] GET /participations/pending', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/clips/metadata — best-effort prefill (auth) ──────────────────
// Сервер сам определяет платформу по ссылке и ходит ТОЛЬКО на домены
// стримингов (см. utils/streamMetadata — SSRF/DoS-защита).
router.post('/metadata', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { url } = (req.body ?? {}) as { url?: unknown };
    if (typeof url !== 'string' || !url.trim() || url.length > 2000) return res.json({});
    const meta = await fetchStreamMetadata('clip', url);
    return res.json(meta);
  } catch (err) {
    console.error('[clips] POST /metadata', err);
    return res.json({}); // never block the form
  }
});

// ── POST /api/clips — create (artist-admin) ────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { artistId, url } = body;

    if (typeof artistId !== 'string' || !artistId) return res.status(400).json({ error: 'artistId обязателен' });
    const title = parseTitleInput(body.title, 'Название трека обязательно');
    if (!title.ok) return res.status(400).json({ error: title.error });
    if (typeof url !== 'string' || !url.trim()) return res.status(400).json({ error: 'Ссылка обязательна' });
    if (url.length > 2000) return res.status(400).json({ error: PLATFORM_ERROR });
    // Platform is derived from the link itself — anything that isn't a real URL to a
    // supported streaming service (no phishing / arbitrary text) is rejected here.
    const detectedPlatform = detectClipPlatform(url);
    if (!detectedPlatform) return res.status(400).json({ error: PLATFORM_ERROR });

    if (!(await isArtistAdmin(artistId, meId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const cover = parseCoverUrlInput(body.coverUrl);
    if (!cover.ok) return res.status(400).json({ error: cover.error });
    const parts = await parseParticipantsInput(body.participants, 'CLIP');
    if (!parts.ok) return res.status(400).json({ error: parts.error });
    const outsiderError = await checkOutsiderParticipants(artistId, parts.value.map((p) => p.userId));
    if (outsiderError) return res.status(400).json({ error: outsiderError });

    // Ссылка ровно на альбом ЯМ — ключ дедупликации (тот же, что у синка).
    const extKey = clipExternalKey(url);

    let clip;
    try {
      clip = await prisma.clip.create({
        data: {
          artistId,
          title: title.value,
          coverUrl: cover.value,
          platform: detectedPlatform as ClipPlatform,
          url: url.trim(),
          ...(extKey ?? {}),
          participants: {
            create: parts.value.map((p) => ({
              userId: p.userId,
              confirmStatus: 'PENDING',
              roles: p.roleIds.length ? { create: p.roleIds.map((roleId) => ({ roleId })) } : undefined,
            })),
          },
        },
        include: { participants: { include: participantInclude } },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return res.status(409).json({ error: DUPLICATE_ERROR });
      throw e;
    }

    // Notify every participant to confirm their involvement.
    await Promise.all(
      clip.participants
        .filter((p) => p.userId !== meId)
        .map((p) =>
          notify({
            userId: p.userId,
            actorId: meId,
            type: 'clip_participant_invite',
            title: artist.name,
            body: `«${artist.name}» указал вас участником клипа «${clip.title}». Подтвердите своё участие.`,
            link: `/clips/${clip.id}`,
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

// ── GET /api/clips/artist/:artistId — list (tiles) ─────────────────────────
router.get('/artist/:artistId', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res: Response) => {
  try {
    // Гость: только если артист не REJECTED (иначе 404), белый список полей.
    if (!req.userId) {
      return sendPublic(res, await getPublicArtistClips(req.params.artistId), 'Артист не найден');
    }
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

// ── GET /api/clips/:id — detail ────────────────────────────────────────────
router.get('/:id', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res: Response) => {
  try {
    // Гость: артист не REJECTED, титры — только люди с согласием + «ещё N».
    if (!req.userId) {
      return sendPublic(res, await getPublicClip(req.params.id), 'Клип не найден');
    }
    const clip = await prisma.clip.findUnique({
      where: { id: req.params.id },
      include: { participants: { include: participantInclude } },
    });
    if (!clip) return res.status(404).json({ error: 'Клип не найден' });

    // PENDING participants are visible only to artist admins (and to the
    // invited user themselves — for the confirm/decline block). DECLINED — никому.
    const viewerIsAdmin = await isArtistAdmin(clip.artistId, req.userId);

    const participants = clip.participants
      .filter((p) =>
        p.confirmStatus === 'ACCEPTED' ||
        (p.confirmStatus === 'PENDING' && (viewerIsAdmin || p.userId === req.userId)))
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

// ── PATCH /api/clips/:id — edit (artist-admin) ─────────────────────────────
// Весь ввод валидируется ДО записи; изменения полей и состава участников —
// одной транзакцией (раньше невалидный участник/роль/дата давали 500 на середине
// и оставляли клип наполовину обновлённым).
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const clip = await prisma.clip.findUnique({
      where: { id: req.params.id },
      include: { participants: true, artist: { select: { id: true, name: true } } },
    });
    if (!clip) return res.status(404).json({ error: 'Клип не найден' });

    if (!(await isArtistAdmin(clip.artistId, meId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const t = parseTitleInput(body.title, 'Название трека обязательно');
      if (!t.ok) return res.status(400).json({ error: t.error });
      data.title = t.value;
    }
    if (body.coverUrl !== undefined) {
      // Неизменённую (возможно, легаси) обложку пропускаем как есть.
      if (body.coverUrl !== clip.coverUrl) {
        const c = parseCoverUrlInput(body.coverUrl);
        if (!c.ok) return res.status(400).json({ error: c.error });
        data.coverUrl = c.value;
      }
    }
    // Changing the link re-derives the platform; reject non-streaming / fake links.
    if (body.url !== undefined) {
      const url = body.url;
      if (typeof url !== 'string' || url.length > 2000) return res.status(400).json({ error: PLATFORM_ERROR });
      const detectedPlatform = detectClipPlatform(url);
      if (!detectedPlatform) return res.status(400).json({ error: PLATFORM_ERROR });
      if (url.trim() !== clip.url) {
        data.url = url.trim();
        data.platform = detectedPlatform as ClipPlatform;
        // Ключ импорта следует за ссылкой: новая ссылка на альбом ЯМ — новый ключ,
        // любая другая — элемент становится «ручным».
        const extKey = clipExternalKey(url);
        data.externalSource = extKey?.externalSource ?? null;
        data.externalId = extKey?.externalId ?? null;
      }
    }

    let desired: { userId: string; roleIds: string[] }[] | null = null;
    if (body.participants !== undefined) {
      const parts = await parseParticipantsInput(body.participants, 'CLIP');
      if (!parts.ok) return res.status(400).json({ error: parts.error });
      desired = parts.value;
    }

    // Reconcile plan. DECLINED-строки — «память» об отказе: не удаляются и не
    // создаются заново (повторно пригласить отказавшегося нельзя).
    const existingByUser = new Map(clip.participants.map((p) => [p.userId, p]));
    const toRemove: string[] = [];
    const toCreate: { userId: string; roleIds: string[] }[] = [];
    const toUpdateRoles: { participantId: string; roleIds: string[] }[] = [];
    if (desired) {
      const desiredIds = new Set(desired.map((p) => p.userId));
      for (const p of clip.participants) {
        if (p.confirmStatus !== 'DECLINED' && !desiredIds.has(p.userId)) toRemove.push(p.id);
      }
      for (const p of desired) {
        const existing = existingByUser.get(p.userId);
        if (existing?.confirmStatus === 'DECLINED') {
          return res.status(400).json({ error: 'Один из участников отказался от участия в этом клипе — повторно указать его нельзя' });
        }
        if (existing) toUpdateRoles.push({ participantId: existing.id, roleIds: p.roleIds });
        else toCreate.push(p);
      }
      const liveAfter = clip.participants.filter((p) => p.confirmStatus !== 'DECLINED').length
        - toRemove.length + toCreate.length;
      if (liveAfter > MAX_MEDIA_PARTICIPANTS) {
        return res.status(400).json({ error: `Не больше ${MAX_MEDIA_PARTICIPANTS} участников` });
      }
      const outsiderError = await checkOutsiderParticipants(clip.artistId, toCreate.map((p) => p.userId));
      if (outsiderError) return res.status(400).json({ error: outsiderError });
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length) await tx.clip.update({ where: { id: clip.id }, data });
        if (toRemove.length) await tx.clipParticipant.deleteMany({ where: { id: { in: toRemove } } });
        for (const u of toUpdateRoles) {
          await tx.clipParticipantRole.deleteMany({ where: { participantId: u.participantId } });
          if (u.roleIds.length) {
            await tx.clipParticipantRole.createMany({
              data: u.roleIds.map((roleId) => ({ participantId: u.participantId, roleId })),
              skipDuplicates: true,
            });
          }
        }
        for (const p of toCreate) {
          await tx.clipParticipant.create({
            data: {
              clipId: clip.id,
              userId: p.userId,
              confirmStatus: 'PENDING',
              roles: p.roleIds.length ? { create: p.roleIds.map((roleId) => ({ roleId })) } : undefined,
            },
          });
        }
      });
    } catch (e) {
      if (isUniqueViolation(e)) return res.status(409).json({ error: DUPLICATE_ERROR });
      throw e;
    }

    const finalTitle = (data.title as string | undefined) ?? clip.title;
    await Promise.all(
      toCreate
        .filter((p) => p.userId !== meId)
        .map((p) =>
          notify({
            userId: p.userId,
            actorId: meId,
            type: 'clip_participant_invite',
            title: clip.artist.name,
            body: `«${clip.artist.name}» указал вас участником клипа «${finalTitle}». Подтвердите своё участие.`,
            link: `/clips/${clip.id}`,
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
      participants: updated!.participants
        .filter((p) => p.confirmStatus !== 'DECLINED')
        .map(serializeParticipant),
    });
  } catch (err) {
    console.error('[clips] PATCH /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/clips/participants/:participantId/confirm — invitee ─────────
// Повторный/параллельный confirm уведомление не дублирует (смена статуса атомарна).
router.patch('/participants/:participantId/confirm', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const participant = await prisma.clipParticipant.findUnique({
      where: { id: req.params.participantId },
      include: { clip: { include: { artist: { select: { id: true, name: true } } } } },
    });
    if (!participant) return res.status(404).json({ error: 'Участие не найдено' });
    if (participant.userId !== meId) return res.status(403).json({ error: 'Нет прав' });

    const { count } = await prisma.clipParticipant.updateMany({
      where: { id: participant.id, confirmStatus: { not: 'ACCEPTED' } },
      data: { confirmStatus: 'ACCEPTED' },
    });
    if (!count) return res.json({ ok: true, alreadyConfirmed: true });

    const name = await actorName(meId);
    const recipients = (await artistAdminIds(participant.clip.artistId)).filter((id) => id !== meId);
    await Promise.all(
      recipients.map((rid) =>
        notify({
          userId: rid,
          actorId: meId,
          type: 'clip_participant_confirmed',
          title: participant.clip.artist.name,
          body: `${name} подтвердил участие в клипе «${participant.clip.title}».`,
          link: `/clips/${participant.clipId}`,
        }),
      ),
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[clips] PATCH /participants/:id/confirm', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/clips/participants/:participantId/decline — invitee ─────────
router.patch('/participants/:participantId/decline', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const participant = await prisma.clipParticipant.findUnique({
      where: { id: req.params.participantId },
      include: { clip: { include: { artist: { select: { id: true, name: true } } } } },
    });
    if (!participant) return res.status(404).json({ error: 'Участие не найдено' });
    if (participant.userId !== meId) return res.status(403).json({ error: 'Нет прав' });

    const { count } = await prisma.clipParticipant.updateMany({
      where: { id: participant.id, confirmStatus: { not: 'DECLINED' } },
      data: { confirmStatus: 'DECLINED' },
    });
    if (!count) return res.json({ ok: true, alreadyDeclined: true });

    const name = await actorName(meId);
    const recipients = (await artistAdminIds(participant.clip.artistId)).filter((id) => id !== meId);
    await Promise.all(
      recipients.map((rid) =>
        notify({
          userId: rid,
          actorId: meId,
          type: 'clip_participant_declined',
          title: participant.clip.artist.name,
          body: `${name} отклонил участие в клипе «${participant.clip.title}».`,
          link: `/clips/${participant.clipId}`,
        }),
      ),
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[clips] PATCH /participants/:id/decline', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/clips/:id — delete (artist-admin) ──────────────────────────
// Удаление импортированного клипа оставляет «надгробие» (DismissedMediaItem) —
// ночной синк Яндекс.Музыки его больше не создаёт.
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

    await prisma.$transaction(async (tx) => {
      if (clip.externalSource && clip.externalId) {
        await tx.dismissedMediaItem.upsert({
          where: {
            artistId_kind_externalSource_externalId: {
              artistId: clip.artistId,
              kind: 'clip',
              externalSource: clip.externalSource,
              externalId: clip.externalId,
            },
          },
          create: {
            artistId: clip.artistId,
            kind: 'clip',
            externalSource: clip.externalSource,
            externalId: clip.externalId,
          },
          update: {},
        });
      }
      await tx.clip.delete({ where: { id: clip.id } });
    });

    // Notify CONFIRMED participants (cascade removed the rows).
    const confirmed = clip.participants.filter((p) => p.confirmStatus === 'ACCEPTED' && p.userId !== meId);
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

    return res.json({ ok: true });
  } catch (err) {
    console.error('[clips] DELETE /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
