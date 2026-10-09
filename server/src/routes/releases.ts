import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { StreamingPlatform } from '@prisma/client';
import { detectReleasePlatform } from '../lib/mediaPlatforms';
import { fetchStreamMetadata } from '../utils/streamMetadata';
import { notify } from '../utils/notify';
import { isArtistAdmin, artistAdminIds, isUniqueViolation } from '../lib/artistAccess';
import {
  parseTitleInput,
  parseCoverUrlInput,
  parseReleaseDateInput,
  parseParticipantsInput,
  checkOutsiderParticipants,
  releaseExternalKey,
  MAX_MEDIA_PARTICIPANTS,
} from '../lib/mediaItems';

const router = Router();

const PLATFORM_ERROR = 'Ссылка должна вести на поддерживаемый стриминг-сервис (VK, Spotify, Яндекс Музыка, Apple Music)';
const DUPLICATE_ERROR = 'Этот релиз уже добавлен у артиста';

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

// ── GET /api/releases/participations/pending — my pending participation inbox ─
// MUST be registered before '/:id' so Express doesn't capture the literal path.
router.get('/participations/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const participants = await prisma.releaseParticipant.findMany({
      where: { userId: meId, confirmStatus: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        release: {
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
        kind: 'release' as const,
        release: {
          id: p.release.id,
          title: p.release.title,
          coverUrl: p.release.coverUrl,
          artist: {
            id: p.release.artist.id,
            name: p.release.artist.name,
            avatar: p.release.artist.avatar,
          },
        },
        roleNames: p.roles.map((r) => r.role.name),
        createdAt: p.createdAt,
      })),
    );
  } catch (err) {
    console.error('[releases] GET /participations/pending', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/releases/metadata — best-effort prefill (auth) ──────────────────
// Сервер сам определяет платформу по ссылке и ходит ТОЛЬКО на домены
// стримингов (см. utils/streamMetadata — SSRF/DoS-защита).
router.post('/metadata', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { url } = (req.body ?? {}) as { url?: unknown };
    if (typeof url !== 'string' || !url.trim() || url.length > 2000) return res.json({});
    const meta = await fetchStreamMetadata('release', url);
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { artistId, url } = body;

    if (typeof artistId !== 'string' || !artistId) return res.status(400).json({ error: 'artistId обязателен' });
    const title = parseTitleInput(body.title, 'Название обязательно');
    if (!title.ok) return res.status(400).json({ error: title.error });
    if (typeof url !== 'string' || !url.trim()) return res.status(400).json({ error: 'Ссылка обязательна' });
    if (url.length > 2000) return res.status(400).json({ error: PLATFORM_ERROR });
    // Platform is derived from the link itself — anything that isn't a real URL to a
    // supported streaming service (no phishing / arbitrary text) is rejected here.
    const detectedPlatform = detectReleasePlatform(url);
    if (!detectedPlatform) return res.status(400).json({ error: PLATFORM_ERROR });

    if (!(await isArtistAdmin(artistId, meId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const cover = parseCoverUrlInput(body.coverUrl);
    if (!cover.ok) return res.status(400).json({ error: cover.error });
    const date = parseReleaseDateInput(body.releaseDate);
    if (!date.ok) return res.status(400).json({ error: date.error });
    const parts = await parseParticipantsInput(body.participants, 'RELEASE');
    if (!parts.ok) return res.status(400).json({ error: parts.error });
    const outsiderError = await checkOutsiderParticipants(artistId, parts.value.map((p) => p.userId));
    if (outsiderError) return res.status(400).json({ error: outsiderError });

    // Ссылка ровно на альбом ЯМ — ключ дедупликации (тот же, что у синка).
    const extKey = releaseExternalKey(url);

    let release;
    try {
      release = await prisma.release.create({
        data: {
          artistId,
          title: title.value,
          coverUrl: cover.value,
          releaseDate: date.value,
          platform: detectedPlatform as StreamingPlatform,
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
      release.participants
        .filter((p) => p.userId !== meId)
        .map((p) =>
          notify({
            userId: p.userId,
            actorId: meId,
            type: 'release_participant_invite',
            title: artist.name,
            body: `«${artist.name}» указал вас участником релиза «${release.title}». Подтвердите своё участие.`,
            link: `/releases/${release.id}`,
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
      // Свежие сверху; релизы без даты — в конце (по умолчанию Postgres ставит
      // NULL первыми при DESC).
      orderBy: [{ releaseDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
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

    // PENDING participants are visible only to artist admins (and to the
    // invited user themselves — for the confirm/decline block). DECLINED — никому.
    const viewerIsAdmin = await isArtistAdmin(release.artistId, req.userId);

    const participants = release.participants
      .filter((p) =>
        p.confirmStatus === 'ACCEPTED' ||
        (p.confirmStatus === 'PENDING' && (viewerIsAdmin || p.userId === req.userId)))
      .map(serializeParticipant);

    return res.json({
      id: release.id,
      artistId: release.artistId,
      title: release.title,
      coverUrl: release.coverUrl,
      releaseDate: release.releaseDate,
      platform: release.platform,
      url: release.url,
      releaseType: release.releaseType,
      label: release.label,
      genre: release.genre,
      trackCount: release.trackCount,
      likesCount: release.likesCount,
      tracklist: release.tracklist,
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
// Весь ввод валидируется ДО записи; изменения полей и состава участников —
// одной транзакцией (раньше невалидный участник/роль/дата давали 500 на середине
// и оставляли релиз наполовину обновлённым).
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const release = await prisma.release.findUnique({
      where: { id: req.params.id },
      include: { participants: true, artist: { select: { id: true, name: true } } },
    });
    if (!release) return res.status(404).json({ error: 'Релиз не найден' });

    if (!(await isArtistAdmin(release.artistId, meId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const t = parseTitleInput(body.title, 'Название обязательно');
      if (!t.ok) return res.status(400).json({ error: t.error });
      data.title = t.value;
    }
    if (body.coverUrl !== undefined) {
      // Неизменённую (возможно, легаси) обложку пропускаем как есть.
      if (body.coverUrl !== release.coverUrl) {
        const c = parseCoverUrlInput(body.coverUrl);
        if (!c.ok) return res.status(400).json({ error: c.error });
        data.coverUrl = c.value;
      }
    }
    if (body.releaseDate !== undefined) {
      const d = parseReleaseDateInput(body.releaseDate);
      if (!d.ok) return res.status(400).json({ error: d.error });
      data.releaseDate = d.value;
    }
    // Changing the link re-derives the platform; reject non-streaming / fake links.
    if (body.url !== undefined) {
      const url = body.url;
      if (typeof url !== 'string' || url.length > 2000) return res.status(400).json({ error: PLATFORM_ERROR });
      const detectedPlatform = detectReleasePlatform(url);
      if (!detectedPlatform) return res.status(400).json({ error: PLATFORM_ERROR });
      if (url.trim() !== release.url) {
        data.url = url.trim();
        data.platform = detectedPlatform as StreamingPlatform;
        // Ключ импорта следует за ссылкой: новая ссылка на альбом ЯМ — новый ключ,
        // любая другая — элемент становится «ручным».
        const extKey = releaseExternalKey(url);
        data.externalSource = extKey?.externalSource ?? null;
        data.externalId = extKey?.externalId ?? null;
      }
    }

    let desired: { userId: string; roleIds: string[] }[] | null = null;
    if (body.participants !== undefined) {
      const parts = await parseParticipantsInput(body.participants, 'RELEASE');
      if (!parts.ok) return res.status(400).json({ error: parts.error });
      desired = parts.value;
    }

    // Reconcile plan. DECLINED-строки — «память» об отказе: не удаляются и не
    // создаются заново (повторно пригласить отказавшегося нельзя).
    const existingByUser = new Map(release.participants.map((p) => [p.userId, p]));
    const toRemove: string[] = [];
    const toCreate: { userId: string; roleIds: string[] }[] = [];
    const toUpdateRoles: { participantId: string; roleIds: string[] }[] = [];
    if (desired) {
      const desiredIds = new Set(desired.map((p) => p.userId));
      for (const p of release.participants) {
        if (p.confirmStatus !== 'DECLINED' && !desiredIds.has(p.userId)) toRemove.push(p.id);
      }
      for (const p of desired) {
        const existing = existingByUser.get(p.userId);
        if (existing?.confirmStatus === 'DECLINED') {
          return res.status(400).json({ error: 'Один из участников отказался от участия в этом релизе — повторно указать его нельзя' });
        }
        if (existing) toUpdateRoles.push({ participantId: existing.id, roleIds: p.roleIds });
        else toCreate.push(p);
      }
      const liveAfter = release.participants.filter((p) => p.confirmStatus !== 'DECLINED').length
        - toRemove.length + toCreate.length;
      if (liveAfter > MAX_MEDIA_PARTICIPANTS) {
        return res.status(400).json({ error: `Не больше ${MAX_MEDIA_PARTICIPANTS} участников` });
      }
      const outsiderError = await checkOutsiderParticipants(release.artistId, toCreate.map((p) => p.userId));
      if (outsiderError) return res.status(400).json({ error: outsiderError });
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length) await tx.release.update({ where: { id: release.id }, data });
        if (toRemove.length) await tx.releaseParticipant.deleteMany({ where: { id: { in: toRemove } } });
        for (const u of toUpdateRoles) {
          await tx.releaseParticipantRole.deleteMany({ where: { participantId: u.participantId } });
          if (u.roleIds.length) {
            await tx.releaseParticipantRole.createMany({
              data: u.roleIds.map((roleId) => ({ participantId: u.participantId, roleId })),
              skipDuplicates: true,
            });
          }
        }
        for (const p of toCreate) {
          await tx.releaseParticipant.create({
            data: {
              releaseId: release.id,
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

    const finalTitle = (data.title as string | undefined) ?? release.title;
    await Promise.all(
      toCreate
        .filter((p) => p.userId !== meId)
        .map((p) =>
          notify({
            userId: p.userId,
            actorId: meId,
            type: 'release_participant_invite',
            title: release.artist.name,
            body: `«${release.artist.name}» указал вас участником релиза «${finalTitle}». Подтвердите своё участие.`,
            link: `/releases/${release.id}`,
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
      participants: updated!.participants
        .filter((p) => p.confirmStatus !== 'DECLINED')
        .map(serializeParticipant),
    });
  } catch (err) {
    console.error('[releases] PATCH /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/releases/participants/:participantId/confirm — invitee ─────────
// Повторный/параллельный confirm уведомление не дублирует (смена статуса атомарна).
router.patch('/participants/:participantId/confirm', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const participant = await prisma.releaseParticipant.findUnique({
      where: { id: req.params.participantId },
      include: { release: { include: { artist: { select: { id: true, name: true } } } } },
    });
    if (!participant) return res.status(404).json({ error: 'Участие не найдено' });
    if (participant.userId !== meId) return res.status(403).json({ error: 'Нет прав' });

    const { count } = await prisma.releaseParticipant.updateMany({
      where: { id: participant.id, confirmStatus: { not: 'ACCEPTED' } },
      data: { confirmStatus: 'ACCEPTED' },
    });
    if (!count) return res.json({ ok: true, alreadyConfirmed: true });

    const name = await actorName(meId);
    const recipients = (await artistAdminIds(participant.release.artistId)).filter((id) => id !== meId);
    await Promise.all(
      recipients.map((rid) =>
        notify({
          userId: rid,
          actorId: meId,
          type: 'release_participant_confirmed',
          title: participant.release.artist.name,
          body: `${name} подтвердил участие в релизе «${participant.release.title}».`,
          link: `/releases/${participant.releaseId}`,
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

    const { count } = await prisma.releaseParticipant.updateMany({
      where: { id: participant.id, confirmStatus: { not: 'DECLINED' } },
      data: { confirmStatus: 'DECLINED' },
    });
    if (!count) return res.json({ ok: true, alreadyDeclined: true });

    const name = await actorName(meId);
    const recipients = (await artistAdminIds(participant.release.artistId)).filter((id) => id !== meId);
    await Promise.all(
      recipients.map((rid) =>
        notify({
          userId: rid,
          actorId: meId,
          type: 'release_participant_declined',
          title: participant.release.artist.name,
          body: `${name} отклонил участие в релизе «${participant.release.title}».`,
          link: `/releases/${participant.releaseId}`,
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
// Удаление импортированного релиза оставляет «надгробие» (DismissedMediaItem) —
// ночной синк Яндекс.Музыки его больше не создаёт.
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

    await prisma.$transaction(async (tx) => {
      if (release.externalSource && release.externalId) {
        await tx.dismissedMediaItem.upsert({
          where: {
            artistId_kind_externalSource_externalId: {
              artistId: release.artistId,
              kind: 'release',
              externalSource: release.externalSource,
              externalId: release.externalId,
            },
          },
          create: {
            artistId: release.artistId,
            kind: 'release',
            externalSource: release.externalSource,
            externalId: release.externalId,
          },
          update: {},
        });
      }
      await tx.release.delete({ where: { id: release.id } });
    });

    // Notify CONFIRMED participants (cascade removed the rows).
    const confirmed = release.participants.filter((p) => p.confirmStatus === 'ACCEPTED' && p.userId !== meId);
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

    return res.json({ ok: true });
  } catch (err) {
    console.error('[releases] DELETE /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
