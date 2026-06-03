import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { uploadArtistAvatar, uploadArtistBanner } from '../middleware/upload';
import { Prisma, ArtistType } from '@prisma/client';
import crypto from 'crypto';
import { tgEvent } from '../utils/telegram';
import { classifyUrl, BLOCK_MESSAGE } from '../utils/socialPlatforms';
import { notify, notifyMany } from '../utils/notify';

const router = Router();

// Allowed submitter-relationship roles (creator's declared relationship to the artist).

// Minimum confirmed members required to request verification, by artist type.
function minMembersForType(type: ArtistType | null | undefined): number {
  if (type === 'SOLO' || type === 'TRIBUTE') return 1;
  return 2;
}

// Russian plural helper: one / few / many.
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// Generate a unique verification code in the format MOOOZA-XXXXXX (6 uppercase alphanumerics).
async function generateUniqueVerificationCode(): Promise<string> {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let suffix = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) suffix += alphabet[bytes[i] % alphabet.length];
    const code = `MOOOZA-${suffix}`;
    const existing = await prisma.artist.findUnique({ where: { verificationCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  // Extremely unlikely fallback.
  return `MOOOZA-${crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 6)}`;
}

// BigInt → Number for JSON serialization (listeners field)
function serializeArtist(artist: any) {
  return {
    ...artist,
    listeners: artist.listeners !== undefined ? Number(artist.listeners) : undefined,
  };
}

// Helper: check if user is a member of the artist
async function isMember(artistId: string, userId: string): Promise<boolean> {
  return !!(await prisma.userArtist.findFirst({ where: { artistId, userId } }));
}

// Helper: is user an admin of the artist (UserArtist.isAdmin) or a system admin.
async function isArtistAdmin(artistId: string, userId: string): Promise<boolean> {
  const ua = await prisma.userArtist.findFirst({ where: { artistId, userId, isAdmin: true } });
  if (ua) return true;
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return !!me?.isAdmin;
}

// ── GET /api/artists/suggest?q= ─────────────────────────────────────────────
router.get('/suggest', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) return res.json([]);

    // Search ALL artists by name (duplicate detection + join targets).
    const artists = await prisma.artist.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
      },
      include: {
        genres: { include: { genre: { select: { id: true, name: true } } } },
      },
      take: 8,
      orderBy: { name: 'asc' },
    });

    res.json(artists.map(a => ({
      id: a.id,
      name: a.name,
      thumb: a.avatar,
      genres: a.genres.map((ag: any) => ({ id: ag.genre.id, name: ag.genre.name })),
    })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to suggest artists' });
  }
});

// ── GET /api/artists/following ──────────────────────────────────────────────
router.get('/following', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const follows = await prisma.artistFollower.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { artist: { include: { _count: { select: { followers: true } } } } },
    });

    const artists = follows.map((f) => ({
      id: f.artist.id,
      name: f.artist.name,
      avatar: f.artist.avatar,
      city: f.artist.city,
      type: f.artist.type,
      listeners: Number(f.artist.listeners),
      followersCount: f.artist._count.followers,
      followedAt: f.createdAt,
    }));

    return res.json(artists);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch followed artists' });
  }
});

// ── GET /api/artists/check-name?name= ────────────────────────────────────────
// Case-insensitive duplicate check across ALL artists (used by the create flow).
router.get('/check-name', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    if (!name) return res.json({ exists: false });

    const artist = await prisma.artist.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true, avatar: true, type: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!artist) return res.json({ exists: false });

    return res.json({
      exists: true,
      artist: {
        id: artist.id,
        name: artist.name,
        avatar: artist.avatar,
        type: artist.type,
        verified: artist.status === 'VERIFIED',
      },
    });
  } catch (err) {
    console.error('[artists] GET /check-name', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/artists/:id ─────────────────────────────────────────────────────
router.get('/:id', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.userId;

    const artist = await prisma.artist.findUnique({
      where: { id },
      include: {
        genres: { include: { genre: true } },
        _count: { select: { followers: true } },
        followers: currentUserId
          ? { where: { userId: currentUserId }, select: { userId: true } }
          : { take: 0, select: { userId: true } },
        userArtists: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true },
            },
            profession: { select: { id: true, name: true } },
            roles: { include: { role: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    if (!artist) {
      return res.status(404).json({ error: 'Артист не найден' });
    }

    const { genres, _count, followers, userArtists, ...rest } = artist;

    // Is the requester an admin/owner of this artist (or a system admin)?
    let viewerIsOwner = false;
    let viewerIsAdmin = false;
    if (currentUserId) {
      const mine = userArtists.find(
        (ua: any) => ua.userId === currentUserId && ua.inviteStatus === 'ACCEPTED',
      );
      viewerIsOwner = !!mine?.isOwner;
      viewerIsAdmin = !!mine?.isAdmin;
      if (!viewerIsAdmin) {
        const sys = await prisma.user.findUnique({
          where: { id: currentUserId },
          select: { isAdmin: true },
        });
        if (sys?.isAdmin) viewerIsAdmin = true;
      }
    }

    const serializeMember = (ua: any) => ({
      membershipId: ua.id,
      isOwner: ua.isOwner,
      isAdmin: ua.isAdmin,
      participationStatus: ua.participationStatus,
      user: {
        id: ua.user.id,
        firstName: ua.user.firstName,
        lastName: ua.user.lastName,
        avatar: ua.user.avatar,
        nickname: ua.user.nickname,
      },
      roles: ua.roles.map((r: any) => ({ id: r.role.id, name: r.role.name })),
    });

    // Back-compat flat member shape (legacy consumers read `members[].id`, profession, etc).
    const legacyMembers = userArtists.map((ua: any) => ({
      membershipId: ua.id,
      id: ua.user.id,
      firstName: ua.user.firstName,
      lastName: ua.user.lastName,
      avatar: ua.user.avatar,
      nickname: ua.user.nickname,
      profession: ua.profession ?? null,
      isOwner: ua.isOwner,
      isAdmin: ua.isAdmin,
      inviteStatus: ua.inviteStatus,
    }));

    const confirmedMembers = userArtists
      .filter((ua: any) => ua.inviteStatus === 'ACCEPTED')
      .map(serializeMember);

    const pendingMembers =
      viewerIsOwner || viewerIsAdmin
        ? userArtists.filter((ua: any) => ua.inviteStatus === 'PENDING').map(serializeMember)
        : [];

    // The viewer's OWN pending invitation — shown ONLY to a user who is not
    // already part of the collective (owners/admins/confirmed members never see
    // the accept/decline banner). The member-invite notification links here.
    const viewerHasAccepted =
      !!currentUserId && userArtists.some((ua: any) => ua.userId === currentUserId && ua.inviteStatus === 'ACCEPTED');
    // Only an ADMIN-INVITED pending membership (invitedById set) shows the
    // accept/decline banner. Self-requested joins (invitedById null) are
    // approved by the artist admin instead.
    const myPending = currentUserId && !viewerHasAccepted
      ? userArtists.find((ua: any) => ua.userId === currentUserId && ua.inviteStatus === 'PENDING' && ua.invitedById)
      : null;
    const viewerPendingMembership = myPending
      ? {
          membershipId: myPending.id,
          roles: myPending.roles.map((r: any) => ({ id: r.role.id, name: r.role.name })),
        }
      : null;

    return res.json(serializeArtist({
      ...rest,
      genres: genres.map((ag) => ag.genre),
      followersCount: _count.followers,
      isFollowed: currentUserId ? followers.some((f) => f.userId === currentUserId) : false,
      members: legacyMembers,
      confirmedMembers,
      pendingMembers,
      viewerIsOwner,
      viewerIsAdmin,
      viewerPendingMembership,
    }));
  } catch (err) {
    console.error('[artists] GET /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/artists ────────────────────────────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      name,
      type,
      city,
      tourReady,
      description,
      socialLinks,
      bandLink,
      listeners,
      genreIds,
      submitterRoles,
      submitterRoleIds,
    } = req.body as {
      name: string;
      type?: string;
      city?: string;
      tourReady?: string;
      description?: string;
      socialLinks?: Record<string, string>;
      bandLink?: string;
      listeners?: number;
      genreIds?: string[];
      submitterRoles?: string[];
      submitterRoleIds?: string[];
    };

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Имя артиста обязательно' });
    }

    // Submitter roles come from the seeded role catalog (collective context).
    // We resolve the chosen role IDs → Role rows, store their names on the artist
    // (descriptive) AND attach them to the creator's membership so they appear as
    // the owner's roles in the line-up.
    const roleIdSet = Array.isArray(submitterRoleIds)
      ? Array.from(new Set(submitterRoleIds.filter((r): r is string => typeof r === 'string' && !!r))).slice(0, 20)
      : [];
    const submitterRoleRows = roleIdSet.length
      ? await prisma.role.findMany({ where: { id: { in: roleIdSet } }, select: { id: true, name: true } })
      : [];
    // Fall back to any plain role names sent (legacy), else use the resolved names.
    const cleanSubmitterRoles = submitterRoleRows.length
      ? submitterRoleRows.map((r) => r.name)
      : Array.isArray(submitterRoles)
        ? Array.from(new Set(submitterRoles.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map((r) => r.trim()))).slice(0, 20)
        : [];

    // Generate the verification code immediately at creation.
    const verificationCode = await generateUniqueVerificationCode();

    const artist = await prisma.artist.create({
      data: {
        name: name.trim(),
        type: type as ArtistType | undefined ?? undefined,
        city,
        tourReady,
        description,
        socialLinks: socialLinks ?? undefined,
        bandLink,
        listeners: listeners ?? 0,
        submitterRoles: cleanSubmitterRoles,
        verificationCode,
        genres: genreIds?.length
          ? { create: genreIds.map((gId) => ({ genreId: gId })) }
          : undefined,
        userArtists: {
          create: {
            userId,
            isOwner: true,
            isAdmin: true,
            inviteStatus: 'ACCEPTED',
            participationStatus: 'ACTIVE_MEMBER',
            roles: submitterRoleRows.length
              ? { create: submitterRoleRows.map((r) => ({ roleId: r.id })) }
              : undefined,
          },
        },
      },
      include: {
        genres: { include: { genre: true } },
        _count: { select: { followers: true } },
        userArtists: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true },
            },
          },
        },
      },
    });

    try {
      const creator = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      tgEvent.artist('создан', artist.name, `${creator?.firstName} ${creator?.lastName}`);
    } catch {}

    return res.status(201).json(serializeArtist({
      ...artist,
      genres: artist.genres.map((ag) => ag.genre),
      followersCount: artist._count.followers,
      isFollowed: false,
      members: artist.userArtists.map((ua) => ({
        id: ua.user.id,
        firstName: ua.user.firstName,
        lastName: ua.user.lastName,
        avatar: ua.user.avatar,
        nickname: ua.user.nickname,
      })),
    }));
  } catch (err) {
    console.error('[artists] POST /', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PUT /api/artists/:id ─────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    if (!(await isMember(id, userId))) {
      return res.status(403).json({ error: 'Нет прав для редактирования' });
    }

    const existing = await prisma.artist.findUnique({ where: { id }, select: { name: true, status: true } });
    if (!existing) return res.status(404).json({ error: 'Артист не найден' });

    const {
      name,
      type,
      city,
      tourReady,
      description,
      socialLinks,
      bandLink,
      listeners,
      genreIds,
    } = req.body as {
      name?: string;
      type?: string;
      city?: string;
      tourReady?: string;
      description?: string;
      socialLinks?: Record<string, string>;
      bandLink?: string;
      listeners?: number;
      genreIds?: string[];
    };

    // A verified artist's name is locked — changing it requires support.
    if (
      existing.status === 'VERIFIED' &&
      name !== undefined &&
      name.trim() !== existing.name
    ) {
      return res.status(400).json({
        error: 'Название верифицированного артиста нельзя изменить — обратитесь в поддержку',
      });
    }

    const updateData: Prisma.ArtistUpdateInput = {};
    if (name !== undefined) updateData.name = name.trim();
    if (type !== undefined) updateData.type = type as ArtistType;
    if (city !== undefined) updateData.city = city;
    if (tourReady !== undefined) updateData.tourReady = tourReady;
    if (description !== undefined) updateData.description = description;
    if (socialLinks !== undefined) updateData.socialLinks = socialLinks;
    if (bandLink !== undefined) updateData.bandLink = bandLink;
    if (listeners !== undefined) updateData.listeners = listeners;

    if (genreIds !== undefined) {
      updateData.genres = {
        deleteMany: {},
        create: genreIds.map((gId) => ({ genreId: gId })),
      };
    }

    const artist = await prisma.artist.update({
      where: { id },
      data: updateData,
      include: {
        genres: { include: { genre: true } },
        _count: { select: { followers: true } },
        followers: { where: { userId }, select: { userId: true } },
        userArtists: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true },
            },
          },
        },
      },
    });

    return res.json(serializeArtist({
      ...artist,
      genres: artist.genres.map((ag) => ag.genre),
      followersCount: artist._count.followers,
      isFollowed: artist.followers.some((f) => f.userId === userId),
      members: artist.userArtists.map((ua) => ({
        id: ua.user.id,
        firstName: ua.user.firstName,
        lastName: ua.user.lastName,
        avatar: ua.user.avatar,
        nickname: ua.user.nickname,
      })),
    }));
  } catch (err) {
    console.error('[artists] PUT /:id', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/artists/:id/avatar ─────────────────────────────────────────────
router.post(
  '/:id/avatar',
  authenticate,
  uploadArtistAvatar.single('avatar'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      if (!(await isMember(id, userId))) {
        return res.status(403).json({ error: 'Нет прав' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
      }

      const avatarPath = `/uploads/artists/avatars/${req.file.filename}`;
      const updated = await prisma.artist.update({
        where: { id },
        data: { avatar: avatarPath },
        select: { id: true, avatar: true },
      });

      return res.json(updated);
    } catch (err) {
      console.error('[artists] POST /:id/avatar', err);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  },
);

// ── POST /api/artists/:id/banner ─────────────────────────────────────────────
router.post(
  '/:id/banner',
  authenticate,
  uploadArtistBanner.single('banner'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      if (!(await isMember(id, userId))) {
        return res.status(403).json({ error: 'Нет прав' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
      }

      const bannerPath = `/uploads/artists/banners/${req.file.filename}`;
      const updated = await prisma.artist.update({
        where: { id },
        data: { banner: bannerPath },
        select: { id: true, banner: true },
      });

      return res.json(updated);
    } catch (err) {
      console.error('[artists] POST /:id/banner', err);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  },
);

// ── POST /api/artists/:id/follow ─────────────────────────────────────────────
router.post('/:id/follow', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    await prisma.artistFollower.upsert({
      where: { userId_artistId: { userId, artistId: id } },
      create: { userId, artistId: id },
      update: {},
    });

    return res.json({ followed: true });
  } catch (err) {
    console.error('[artists] POST /:id/follow', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/artists/:id/follow ───────────────────────────────────────────
router.delete('/:id/follow', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    await prisma.artistFollower.deleteMany({
      where: { userId, artistId: id },
    });

    return res.json({ followed: false });
  } catch (err) {
    console.error('[artists] DELETE /:id/follow', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/:id/request-verification ──────────────────────────────
// Admin of the artist submits the verification proof URL. Server validates ALL
// submit conditions; on failure returns 400 { error:'CONDITIONS_NOT_MET', unmet }.
router.patch('/:id/request-verification', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { verificationUrl } = req.body as { verificationUrl?: string };

    if (!(await isArtistAdmin(id, userId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const artist = await prisma.artist.findUnique({ where: { id } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    if (artist.status === 'VERIFIED') {
      return res.status(400).json({ error: 'Артист уже верифицирован' });
    }
    if (artist.status === 'PENDING') {
      return res.status(400).json({ error: 'Заявка уже на рассмотрении' });
    }

    const unmet: string[] = [];

    // Required fields.
    if (!artist.name || !artist.name.trim()) unmet.push('Заполните название');
    if (!artist.avatar) unmet.push('Загрузите аватар');
    if (!artist.type) unmet.push('Выберите тип артиста');

    // Minimum confirmed members by type.
    const confirmedMembers = await prisma.userArtist.count({
      where: { artistId: id, inviteStatus: 'ACCEPTED' },
    });
    const minMembers = minMembersForType(artist.type);
    if (confirmedMembers < minMembers) {
      const need = minMembers - confirmedMembers;
      unmet.push(`Добавьте ещё ${need} ${plural(need, 'участника', 'участников', 'участников')}`);
    }

    // Verification URL: must be present and an allowed platform.
    const url = (verificationUrl ?? '').trim();
    if (!url) {
      unmet.push('Укажите ссылку на профиль в одной из разрешённых соцсетей');
    } else {
      const classified = classifyUrl(url);
      if (classified.status === 'blocked') {
        unmet.push(BLOCK_MESSAGE);
      } else if (classified.status !== 'allowed') {
        unmet.push('Укажите ссылку на профиль в одной из разрешённых соцсетей');
      }
    }

    if (unmet.length) {
      return res.status(400).json({ error: 'CONDITIONS_NOT_MET', unmet });
    }

    // All conditions met. If the artist was rejected, regenerate a fresh code
    // (invalidating the old one).
    const data: Prisma.ArtistUpdateInput = {
      verificationProofUrl: url,
      status: 'PENDING',
      rejectionReason: null,
      submittedByUser: { connect: { id: userId } },
    };
    if (artist.status === 'REJECTED' || !artist.verificationCode) {
      data.verificationCode = await generateUniqueVerificationCode();
    }

    const updated = await prisma.artist.update({ where: { id }, data });

    return res.json(serializeArtist(updated));
  } catch (err) {
    console.error('[artists] PATCH /:id/request-verification', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/:id/withdraw ──────────────────────────────────────────
// Admin withdraws a pending verification request, returning the artist to DRAFT.
router.patch('/:id/withdraw', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    if (!(await isArtistAdmin(id, userId))) {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const artist = await prisma.artist.findUnique({ where: { id } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    if (artist.status === 'VERIFIED') {
      return res.status(400).json({ error: 'Нельзя отозвать заявку верифицированного артиста' });
    }
    if (artist.status !== 'PENDING') {
      return res.status(400).json({ error: 'Заявка не находится на рассмотрении' });
    }

    const updated = await prisma.artist.update({
      where: { id },
      data: { status: 'DRAFT' },
    });

    return res.json(serializeArtist(updated));
  } catch (err) {
    console.error('[artists] PATCH /:id/withdraw', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/artists/:id/join-request — request to join as member ──────────
router.post('/:id/join-request', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const artistId = req.params.id;
    const { roleIds } = req.body as { roleIds: string[] };
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      return res.status(400).json({ error: 'Укажите хотя бы одну роль' });
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    // Already a member or request already pending?
    const existing = await prisma.userArtist.findFirst({
      where: { userId, artistId, inviteStatus: { in: ['PENDING', 'ACCEPTED'] } },
    });
    if (existing) return res.status(400).json({ error: 'Вы уже участник или заявка уже отправлена' });

    // Roles come from the seeded role catalog (collective context).
    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } });
    if (!roles.length) return res.status(400).json({ error: 'Некорректные роли' });

    // Self-requested membership (invitedById=null) — the artist admin approves it.
    await prisma.userArtist.create({
      data: {
        userId, artistId, inviteStatus: 'PENDING', isOwner: false, participationStatus: 'ACTIVE_MEMBER',
        roles: { create: roles.map(r => ({ roleId: r.id })) },
      },
    });

    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const actorName = `${actor?.firstName ?? ''} ${actor?.lastName ?? ''}`.trim();
    const roleNames = roles.map(r => r.name).join(', ');
    // Notify the artist owner
    const ownerMembership = await prisma.userArtist.findFirst({
      where: { artistId, isOwner: true },
      select: { userId: true },
    });
    const notifyIds: string[] = ownerMembership ? [ownerMembership.userId] : [];
    // Also notify system admins if no owner found
    if (!notifyIds.length) {
      const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
      notifyIds.push(...admins.map(a => a.id));
    }
    await notifyMany(notifyIds, {
      actorId: userId, type: 'artist_join_request',
      title: 'Запрос на участие',
      body: `${actorName} запрашивает роль «${roleNames}» в «${artist.name}»`,
      link: `/artist/${artistId}`,
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/artists/:id/memberships/pending — pending join requests for artist ─
router.get('/:id/memberships/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const artistId = req.params.id;
    const isOwner = await prisma.userArtist.findFirst({ where: { artistId, userId: req.userId!, isOwner: true } });
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { isAdmin: true } });
    if (!isOwner && !me?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const memberships = await prisma.userArtist.findMany({
      where: { artistId, inviteStatus: 'PENDING', invitedById: null },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        profession: { select: { id: true, name: true } },
        roles: { include: { role: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(memberships.map((m: any) => ({
      ...m,
      roleNames: m.roles.map((r: any) => r.role.name),
    })));
  } catch {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Helper: check if current user can manage membership (artist owner or system admin)
async function canManageMembership(membershipId: string, userId: string): Promise<{ ua: any; allowed: boolean }> {
  const ua = await prisma.userArtist.findUnique({
    where: { id: membershipId },
    include: { artist: { select: { name: true } }, profession: { select: { name: true } } },
  });
  if (!ua) return { ua: null, allowed: false };
  const isArtistOwner = await prisma.userArtist.findFirst({ where: { artistId: ua.artistId, userId, isOwner: true } });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return { ua, allowed: !!(isArtistOwner || me?.isAdmin) };
}

// ── PATCH /api/artists/memberships/:id/approve ───────────────────────────────
router.patch('/memberships/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { ua, allowed } = await canManageMembership(req.params.id, req.userId!);
    if (!ua) return res.status(404).json({ error: 'Not found' });
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    await prisma.userArtist.update({ where: { id: req.params.id }, data: { inviteStatus: 'ACCEPTED' } });
    await notify({
      userId: ua.userId, actorId: req.userId, type: 'artist_join_approved',
      title: 'Участие подтверждено',
      body: `Ваш запрос на роль «${ua.profession?.name ?? ''}» в «${ua.artist.name}» подтверждён!`,
      link: `/profile/${ua.userId}`,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/memberships/:id/reject ────────────────────────────────
router.patch('/memberships/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { ua, allowed } = await canManageMembership(req.params.id, req.userId!);
    if (!ua) return res.status(404).json({ error: 'Not found' });
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    await prisma.userArtist.delete({ where: { id: req.params.id } });
    await notify({
      userId: ua.userId, actorId: req.userId, type: 'artist_join_rejected',
      title: 'Запрос отклонён',
      body: `Ваш запрос на роль «${ua.profession?.name ?? ''}» в «${ua.artist.name}» отклонён.`,
      link: `/profile/${ua.userId}`,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5a — members / admins / ownership / role-bound invite links
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL = process.env.APP_URL || 'https://moooza.ru';

// Resolve the requester's effective admin status for an artist, returning the
// confirmed-owner membership too. System admins are allowed but have no membership.
async function requireArtistAdmin(
  artistId: string,
  userId: string,
): Promise<{ ok: boolean; isSystemAdmin: boolean }> {
  const ua = await prisma.userArtist.findFirst({
    where: { artistId, userId, isAdmin: true, inviteStatus: 'ACCEPTED' },
    select: { id: true },
  });
  if (ua) return { ok: true, isSystemAdmin: false };
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return { ok: !!me?.isAdmin, isSystemAdmin: !!me?.isAdmin };
}

// The confirmed OWNER membership of an artist (there is exactly one).
async function getOwnerMembership(artistId: string) {
  return prisma.userArtist.findFirst({
    where: { artistId, isOwner: true, inviteStatus: 'ACCEPTED' },
  });
}

async function actorName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
}

// Role names for a set of role ids (for notification bodies).
async function roleNames(roleIds: string[]): Promise<string> {
  if (!roleIds.length) return '';
  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { name: true },
  });
  return roles.map((r) => r.name).join(', ');
}

// ── POST /api/artists/:id/members — admin adds a registered user (invite) ─────
router.post('/:id/members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const artistId = req.params.id;
    const { userId, roleIds, participationStatus } = req.body as {
      userId?: string;
      roleIds?: string[];
      participationStatus?: 'ACTIVE_MEMBER' | 'FORMER_MEMBER';
    };

    if (!userId) return res.status(400).json({ error: 'userId обязателен' });
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      return res.status(400).json({ error: 'Укажите хотя бы одну роль участника' });
    }

    const { ok } = await requireArtistAdmin(artistId, meId);
    if (!ok) return res.status(403).json({ error: 'Нет прав' });

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

    // Reject if already an active (PENDING or ACCEPTED) membership.
    const existingActive = await prisma.userArtist.findFirst({
      where: { artistId, userId, inviteStatus: { in: ['PENDING', 'ACCEPTED'] } },
    });
    if (existingActive) {
      return res.status(400).json({ error: 'Пользователь уже является участником или приглашён' });
    }

    const cleanRoleIds = Array.isArray(roleIds) ? roleIds.filter((r) => typeof r === 'string') : [];
    const part = participationStatus === 'FORMER_MEMBER' ? 'FORMER_MEMBER' : 'ACTIVE_MEMBER';

    const membership = await prisma.userArtist.create({
      data: {
        userId,
        artistId,
        professionId: null,
        isOwner: false,
        isAdmin: false,
        inviteStatus: 'PENDING',
        participationStatus: part,
        invitedById: meId,
        roles: cleanRoleIds.length
          ? { create: cleanRoleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
      include: { roles: { include: { role: { select: { id: true, name: true } } } } },
    });

    const names = await roleNames(cleanRoleIds);
    await notify({
      userId,
      actorId: meId,
      type: 'artist_member_invite',
      title: artist.name,
      body: `«${artist.name}» приглашает вас стать участником${names ? ` в роли «${names}»` : ''}. Подтвердите участие.`,
      link: `/artist/${artistId}`,
    });

    return res.status(201).json({
      membershipId: membership.id,
      userId: membership.userId,
      inviteStatus: membership.inviteStatus,
      participationStatus: membership.participationStatus,
      roles: membership.roles.map((r: any) => ({ id: r.role.id, name: r.role.name })),
    });
  } catch (err) {
    console.error('[artists] POST /:id/members', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/memberships/:membershipId/confirm — invitee confirms ───
router.patch('/memberships/:membershipId/confirm', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const ua = await prisma.userArtist.findUnique({
      where: { id: req.params.membershipId },
      include: { artist: { select: { id: true, name: true } } },
    });
    if (!ua) return res.status(404).json({ error: 'Приглашение не найдено' });
    if (ua.userId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (ua.inviteStatus !== 'PENDING') {
      return res.status(400).json({ error: 'Приглашение уже обработано' });
    }

    await prisma.userArtist.update({
      where: { id: ua.id },
      data: { inviteStatus: 'ACCEPTED' },
    });

    const name = await actorName(meId);
    // Notify the inviter + all artist admins/owner.
    const admins = await prisma.userArtist.findMany({
      where: { artistId: ua.artistId, isAdmin: true, inviteStatus: 'ACCEPTED' },
      select: { userId: true },
    });
    const recipientIds = new Set<string>(admins.map((a) => a.userId));
    if (ua.invitedById) recipientIds.add(ua.invitedById);
    recipientIds.delete(meId);
    await notifyMany([...recipientIds], {
      actorId: meId,
      type: 'artist_member_confirmed',
      title: ua.artist.name,
      body: `${name} подтвердил участие в «${ua.artist.name}».`,
      link: `/artist/${ua.artistId}`,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[artists] PATCH /memberships/:id/confirm', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/memberships/:membershipId/decline — invitee declines ───
router.patch('/memberships/:membershipId/decline', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const ua = await prisma.userArtist.findUnique({
      where: { id: req.params.membershipId },
      include: { artist: { select: { id: true, name: true } } },
    });
    if (!ua) return res.status(404).json({ error: 'Приглашение не найдено' });
    if (ua.userId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (ua.inviteStatus !== 'PENDING') {
      return res.status(400).json({ error: 'Приглашение уже обработано' });
    }

    await prisma.userArtist.update({
      where: { id: ua.id },
      data: { inviteStatus: 'DECLINED' },
    });

    const name = await actorName(meId);
    if (ua.invitedById && ua.invitedById !== meId) {
      await notify({
        userId: ua.invitedById,
        actorId: meId,
        type: 'artist_member_declined',
        title: ua.artist.name,
        body: `${name} отклонил приглашение в «${ua.artist.name}».`,
        link: `/artist/${ua.artistId}`,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[artists] PATCH /memberships/:id/decline', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/:id/members/:membershipId/participation — admin ────────
router.patch('/:id/members/:membershipId/participation', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { id: artistId, membershipId } = req.params;
    const { participationStatus } = req.body as {
      participationStatus?: 'ACTIVE_MEMBER' | 'FORMER_MEMBER';
    };

    if (participationStatus !== 'ACTIVE_MEMBER' && participationStatus !== 'FORMER_MEMBER') {
      return res.status(400).json({ error: 'Неверный participationStatus' });
    }

    const { ok } = await requireArtistAdmin(artistId, meId);
    if (!ok) return res.status(403).json({ error: 'Нет прав' });

    const ua = await prisma.userArtist.findUnique({ where: { id: membershipId } });
    if (!ua || ua.artistId !== artistId) return res.status(404).json({ error: 'Участник не найден' });

    await prisma.userArtist.update({
      where: { id: membershipId },
      data: { participationStatus },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[artists] PATCH /:id/members/:membershipId/participation', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/:id/members/:membershipId/roles — admin replaces roles ─
router.patch('/:id/members/:membershipId/roles', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { id: artistId, membershipId } = req.params;
    const { roleIds } = req.body as { roleIds?: string[] };

    const { ok } = await requireArtistAdmin(artistId, meId);
    if (!ok) return res.status(403).json({ error: 'Нет прав' });

    const ua = await prisma.userArtist.findUnique({ where: { id: membershipId } });
    if (!ua || ua.artistId !== artistId) return res.status(404).json({ error: 'Участник не найден' });

    const cleanRoleIds = Array.isArray(roleIds) ? roleIds.filter((r) => typeof r === 'string') : [];

    await prisma.$transaction([
      prisma.userArtistRole.deleteMany({ where: { userArtistId: membershipId } }),
      ...(cleanRoleIds.length
        ? [prisma.userArtistRole.createMany({
            data: cleanRoleIds.map((roleId) => ({ userArtistId: membershipId, roleId })),
            skipDuplicates: true,
          })]
        : []),
    ]);

    const updated = await prisma.userArtist.findUnique({
      where: { id: membershipId },
      include: { roles: { include: { role: { select: { id: true, name: true } } } } },
    });

    return res.json({
      ok: true,
      roles: updated?.roles.map((r: any) => ({ id: r.role.id, name: r.role.name })) ?? [],
    });
  } catch (err) {
    console.error('[artists] PATCH /:id/members/:membershipId/roles', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/artists/:id/members/:membershipId — admin removes a member ────
router.delete('/:id/members/:membershipId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { id: artistId, membershipId } = req.params;

    const { ok } = await requireArtistAdmin(artistId, meId);
    if (!ok) return res.status(403).json({ error: 'Нет прав' });

    const ua = await prisma.userArtist.findUnique({ where: { id: membershipId } });
    if (!ua || ua.artistId !== artistId) return res.status(404).json({ error: 'Участник не найден' });
    if (ua.isOwner) return res.status(400).json({ error: 'Нельзя удалить владельца' });

    await prisma.userArtist.delete({ where: { id: membershipId } });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[artists] DELETE /:id/members/:membershipId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/:id/activity-status — admin; auto former-member on inactive
router.patch('/:id/activity-status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const artistId = req.params.id;
    const { activityStatus } = req.body as {
      activityStatus?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'DISBANDED';
    };

    const valid = ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'DISBANDED'];
    if (!activityStatus || !valid.includes(activityStatus)) {
      return res.status(400).json({ error: 'Неверный activityStatus' });
    }

    const { ok } = await requireArtistAdmin(artistId, meId);
    if (!ok) return res.status(403).json({ error: 'Нет прав' });

    const artist = await prisma.artist.findUnique({ where: { id: artistId } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const wasActive = artist.activityStatus === 'ACTIVE';

    const updated = await prisma.artist.update({
      where: { id: artistId },
      data: { activityStatus },
    });

    // Active → non-active: freeze the lineup. Active members become former
    // members (history preserved — no deletion).
    if (wasActive && activityStatus !== 'ACTIVE') {
      await prisma.userArtist.updateMany({
        where: { artistId, participationStatus: 'ACTIVE_MEMBER' },
        data: { participationStatus: 'FORMER_MEMBER' },
      });
    }

    return res.json(serializeArtist(updated));
  } catch (err) {
    console.error('[artists] PATCH /:id/activity-status', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/:id/transfer-owner — OWNER only ────────────────────────
router.patch('/:id/transfer-owner', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const artistId = req.params.id;
    const { userId } = req.body as { userId?: string };
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });

    const owner = await getOwnerMembership(artistId);
    if (!owner || owner.userId !== meId) {
      return res.status(403).json({ error: 'Только владелец может передать владение' });
    }
    if (userId === meId) return res.status(400).json({ error: 'Вы уже владелец' });

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const target = await prisma.userArtist.findFirst({
      where: { artistId, userId, inviteStatus: 'ACCEPTED' },
    });
    if (!target) return res.status(400).json({ error: 'Получатель должен быть подтверждённым участником' });

    await prisma.$transaction([
      prisma.userArtist.update({
        where: { id: owner.id },
        data: { isOwner: false, isAdmin: true },
      }),
      prisma.userArtist.update({
        where: { id: target.id },
        data: { isOwner: true, isAdmin: true },
      }),
    ]);

    await notify({
      userId,
      actorId: meId,
      type: 'artist_owner_transferred',
      title: artist.name,
      body: `Вам передано владение артистом «${artist.name}».`,
      link: `/artist/${artistId}`,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[artists] PATCH /:id/transfer-owner', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/artists/:id/admins — OWNER only; grant admin ────────────────────
router.post('/:id/admins', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const artistId = req.params.id;
    const { userId } = req.body as { userId?: string };
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });

    const owner = await getOwnerMembership(artistId);
    if (!owner || owner.userId !== meId) {
      return res.status(403).json({ error: 'Только владелец может назначать администраторов' });
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const target = await prisma.userArtist.findFirst({
      where: { artistId, userId, inviteStatus: 'ACCEPTED' },
    });
    if (!target) return res.status(400).json({ error: 'Получатель должен быть подтверждённым участником' });

    await prisma.userArtist.update({ where: { id: target.id }, data: { isAdmin: true } });

    await notify({
      userId,
      actorId: meId,
      type: 'artist_admin_granted',
      title: artist.name,
      body: `Вас назначили администратором артиста «${artist.name}».`,
      link: `/artist/${artistId}`,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[artists] POST /:id/admins', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── DELETE /api/artists/:id/admins/:userId — OWNER only; revoke admin ─────────
router.delete('/:id/admins/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const { id: artistId, userId } = req.params;

    const owner = await getOwnerMembership(artistId);
    if (!owner || owner.userId !== meId) {
      return res.status(403).json({ error: 'Только владелец может снимать администраторов' });
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const target = await prisma.userArtist.findFirst({
      where: { artistId, userId, inviteStatus: 'ACCEPTED' },
    });
    if (!target) return res.status(404).json({ error: 'Участник не найден' });
    if (target.isOwner) return res.status(400).json({ error: 'Нельзя снять администратора с владельца' });

    await prisma.userArtist.update({ where: { id: target.id }, data: { isAdmin: false } });

    await notify({
      userId,
      actorId: meId,
      type: 'artist_admin_revoked',
      title: artist.name,
      body: `Вас сняли с администраторов артиста «${artist.name}».`,
      link: `/artist/${artistId}`,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[artists] DELETE /:id/admins/:userId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/artists/:id/invite-link — admin; create role-bound invite link ──
router.post('/:id/invite-link', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const artistId = req.params.id;
    const { roleIds, participationStatus } = req.body as {
      roleIds?: string[];
      participationStatus?: 'ACTIVE_MEMBER' | 'FORMER_MEMBER';
    };

    const { ok } = await requireArtistAdmin(artistId, meId);
    if (!ok) return res.status(403).json({ error: 'Нет прав' });

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const cleanRoleIds = Array.isArray(roleIds) ? roleIds.filter((r) => typeof r === 'string') : [];
    const part = participationStatus === 'FORMER_MEMBER' ? 'FORMER_MEMBER' : 'ACTIVE_MEMBER';
    const token = crypto.randomBytes(16).toString('hex');

    await prisma.artistInvite.create({
      data: {
        artistId,
        token,
        roleIds: cleanRoleIds,
        participationStatus: part,
        createdById: meId,
      },
    });

    return res.status(201).json({
      token,
      url: `${APP_URL}/register?artistInvite=${token}`,
    });
  } catch (err) {
    console.error('[artists] POST /:id/invite-link', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/artists/invite/:token — PUBLIC landing/OG preview ────────────────
router.get('/invite/:token', async (req: AuthRequest, res: Response) => {
  try {
    const invite = await prisma.artistInvite.findUnique({
      where: { token: req.params.token },
      include: { artist: { select: { id: true, name: true, avatar: true } } },
    });
    if (!invite) return res.status(404).json({ error: 'Приглашение не найдено' });

    const roles = invite.roleIds.length
      ? await prisma.role.findMany({
          where: { id: { in: invite.roleIds } },
          select: { id: true, name: true },
        })
      : [];

    return res.json({
      artist: { id: invite.artist.id, name: invite.artist.name, avatar: invite.artist.avatar },
      roles,
      participationStatus: invite.participationStatus,
    });
  } catch (err) {
    console.error('[artists] GET /invite/:token', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
