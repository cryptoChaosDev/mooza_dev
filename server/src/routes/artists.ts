import { Router, Response } from 'express';
import fs from 'fs';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { uploadArtistAvatar, uploadArtistBanner } from '../middleware/upload';
import { Prisma, ArtistType } from '@prisma/client';
import crypto from 'crypto';
import { tgEvent } from '../utils/telegram';
import { classifyUrl, BLOCK_MESSAGE } from '../utils/socialPlatforms';
import { yoNorm } from '../utils/search';
import { notify, notifyMany } from '../utils/notify';
import { extractYmArtistId } from '../utils/yandexMusicSync';
import {
  getArtistAccess,
  artistAdminIds,
  resolveRoleIds,
  isUniqueViolation,
  isFkViolation,
} from '../lib/artistAccess';
import { validateArtistInvite, acceptArtistInvite, ARTIST_INVITE_TTL_MS } from '../lib/artistInvites';

const router = Router();

// ── Input validation ─────────────────────────────────────────────────────────

const ARTIST_TYPES = new Set<string>(Object.values(ArtistType));
// Статусы, для которых работает ночной синк Яндекс.Музыки (см. yandexMusicSync).
const YM_SYNCED_STATUSES = new Set<string>(['VERIFIED', 'APPROVED']);

type Fail = { ok: false; error: string };
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// Необязательная строка: undefined → не менять; null/'' → очистить (null).
function parseOptionalText(raw: unknown, max: number, label: string): { ok: true; value: string | null } | Fail {
  if (raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: `Некорректное поле «${label}»` };
  const s = raw.trim();
  if (s.length > max) return { ok: false, error: `Поле «${label}» — не длиннее ${max} символов` };
  return { ok: true, value: s || null };
}

function isHttpUrl(s: string): boolean {
  if (CONTROL_CHARS.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
}

// Ссылка на страницу группы: только http(s) — иначе <a href> на карточке
// артиста превращается в хранимый XSS (javascript:…).
function parseBandLink(raw: unknown): { ok: true; value: string | null } | Fail {
  if (raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Некорректная ссылка на страницу группы' };
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  if (s.length > 500 || !/^https?:\/\//i.test(s) || !isHttpUrl(s)) {
    return { ok: false, error: 'Ссылка на страницу группы должна начинаться с http:// или https://' };
  }
  return { ok: true, value: s };
}

// Контакты/соцсети артиста: объект «ключ → строка». Значения хранятся уже
// полными ссылками (см. client SocialLinks.buildUrl): https://…, tel:…, mailto:…;
// у легаси-записей встречаются «голые» слаги без схемы — их клиент сам
// дополняет базовым адресом, поэтому они безопасны. Любая другая схема
// (javascript:, data:, …) и не-строки ({"vk":123} ронял страницу у всех) — 400.
function sanitizeSocialLinks(raw: unknown): { ok: true; value: Record<string, string> } | Fail {
  if (raw === null) return { ok: true, value: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Некорректные контакты' };
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 40) return { ok: false, error: 'Слишком много контактов' };
  const out: Record<string, string> = {};
  for (const [key, val] of entries) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) return { ok: false, error: 'Некорректные контакты' };
    if (val === null || val === undefined || val === '') continue;
    if (typeof val !== 'string') return { ok: false, error: 'Некорректные контакты' };
    const v = val.trim();
    if (!v) continue;
    if (v.length > 500 || CONTROL_CHARS.test(v)) return { ok: false, error: 'Некорректные контакты' };
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1]?.toLowerCase();
    if (scheme) {
      const okScheme =
        ((scheme === 'http' || scheme === 'https') && isHttpUrl(v)) ||
        (scheme === 'tel' && key === 'phone') ||
        (scheme === 'mailto' && key === 'email');
      if (!okScheme) return { ok: false, error: 'Некорректная ссылка в контактах' };
    }
    if (key === 'yandex_music' && !extractYmArtistId(v)) {
      return { ok: false, error: 'Ссылка на Яндекс Музыку должна вести на страницу артиста (music.yandex.ru/artist/…)' };
    }
    out[key] = v;
  }
  return { ok: true, value: out };
}

// Жанры: существующие id каталога (неизвестный id раньше давал 500).
async function resolveGenreIds(raw: unknown): Promise<string[] | null> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((g) => typeof g !== 'string' || !g)) return null;
  const ids = Array.from(new Set(raw as string[]));
  if (ids.length > 20) return null;
  if (!ids.length) return [];
  const found = await prisma.genre.count({ where: { id: { in: ids } } });
  return found === ids.length ? ids : null;
}

// Страница ЯМ уже привязана к другому артисту Moooza?
async function ymIdTakenByOther(ymId: string, artistId?: string): Promise<boolean> {
  const other = await prisma.artist.findFirst({
    where: { ymId, ...(artistId ? { NOT: { id: artistId } } : {}) },
    select: { id: true },
  });
  return !!other;
}

const YM_TAKEN_ERROR = 'Эта страница Яндекс Музыки уже привязана к другому артисту на Moooza — обратитесь в поддержку';

function dropUploadedFile(file?: Express.Multer.File) {
  if (file?.path) fs.unlink(file.path, () => {});
}

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

// Права: только подтверждённый (ACCEPTED) админ ИЛИ владелец артиста — см.
// lib/artistAccess. PENDING-участник (приглашённый/подавший заявку) прав не
// имеет; системный админ сайта и Artist.submittedById — тоже.
async function isArtistAdmin(artistId: string, userId: string): Promise<boolean> {
  return (await getArtistAccess(artistId, userId)).isAdmin;
}

// ── GET /api/artists/suggest?q= ─────────────────────────────────────────────
router.get('/suggest', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 1) return res.json([]);

    // Search ALL artists by name (duplicate detection + join targets); ё/е-insensitive.
    const artists = await prisma.artist.findMany({
      where: {
        nameNorm: { contains: yoNorm(q) },
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
// Duplicate check across ALL artists (used by the create flow); ё/е-insensitive.
router.get('/check-name', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    if (!name) return res.json({ exists: false });

    const artist = await prisma.artist.findFirst({
      where: { nameNorm: yoNorm(name) },
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

// ── GET /api/artists/my-invites ──────────────────────────────────────────────
// Invitations sent TO the current user (invitedById != null), still pending.
router.get('/my-invites', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const memberships = await prisma.userArtist.findMany({
      where: {
        userId,
        inviteStatus: 'PENDING',
        invitedById: { not: null },
      },
      include: {
        artist: { select: { id: true, name: true, avatar: true } },
        profession: { select: { name: true } },
        roles: { include: { role: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(
      memberships.map((m) => ({
        id: m.id,
        artist: { id: m.artist.id, name: m.artist.name, avatar: m.artist.avatar },
        roleNames: m.roles.map((r) => r.role.name),
        professionName: m.profession?.name ?? null,
        createdAt: m.createdAt,
      })),
    );
  } catch (e) {
    console.error('[artists] GET /my-invites', e);
    return res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

// ── GET /api/artists/join-requests ───────────────────────────────────────────
// Pending join requests (invitedById = null) for artists the current user OWNS
// or ADMINISTERS (confirmed) — the same people who can approve/reject them.
router.get('/join-requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const ownedRows = await prisma.userArtist.findMany({
      where: { userId, inviteStatus: 'ACCEPTED', OR: [{ isOwner: true }, { isAdmin: true }] },
      select: { artistId: true },
    });
    const artistIds = ownedRows.map((r) => r.artistId);
    if (artistIds.length === 0) return res.json([]);

    const requests = await prisma.userArtist.findMany({
      where: {
        artistId: { in: artistIds },
        inviteStatus: 'PENDING',
        invitedById: null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        artist: { select: { id: true, name: true } },
        profession: { select: { name: true } },
        roles: { include: { role: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(
      requests.map((r) => ({
        id: r.id,
        artist: { id: r.artist.id, name: r.artist.name },
        user: {
          id: r.user.id,
          firstName: r.user.firstName,
          lastName: r.user.lastName,
          avatar: r.user.avatar,
        },
        roleNames: r.roles.map((rr) => rr.role.name),
        professionName: r.profession?.name ?? null,
        createdAt: r.createdAt,
      })),
    );
  } catch (e) {
    console.error('[artists] GET /join-requests', e);
    return res.status(500).json({ error: 'Failed to fetch join requests' });
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

    // Служебные поля верификации наружу не отдаём: код/причина отказа/ссылка-
    // доказательство — только админам артиста, submittedById/подавший — никому.
    const {
      genres, _count, followers, userArtists,
      verificationCode, verificationProofUrl, rejectionReason,
      submittedById: _submittedById, verificationRequestedById: _requestedBy,
      ...rest
    } = artist;

    // Is the requester an admin/owner of this artist? Only a CONFIRMED
    // UserArtist row counts (owner ≥ admin); a system admin or the user stored in
    // submittedById gets no rights.
    let viewerIsOwner = false;
    let viewerIsAdmin = false;
    if (currentUserId) {
      const mine = userArtists.filter(
        (ua: any) => ua.userId === currentUserId && ua.inviteStatus === 'ACCEPTED',
      );
      viewerIsOwner = mine.some((ua: any) => ua.isOwner);
      viewerIsAdmin = viewerIsOwner || mine.some((ua: any) => ua.isAdmin);
    }

    // id строки участия нужен только для действий админа (и самому участнику).
    const serializeMember = (ua: any) => ({
      ...(viewerIsAdmin || ua.userId === currentUserId ? { membershipId: ua.id } : {}),
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
    // Публично — только подтверждённые участники; PENDING (приглашения/заявки) и
    // id строк участия видят лишь админы артиста; DECLINED/ARCHIVED — никто.
    const legacyMembers = userArtists
      .filter((ua: any) =>
        ua.inviteStatus === 'ACCEPTED' || (viewerIsAdmin && ua.inviteStatus === 'PENDING'))
      .map((ua: any) => ({
        ...(viewerIsAdmin ? { membershipId: ua.id } : {}),
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

    // История слушателей ЯМ (для графика динамики) — последние 90 точек.
    const snapshots = await prisma.artistListenersSnapshot.findMany({
      where: { artistId: id },
      orderBy: { createdAt: 'desc' },
      take: 90,
      select: { listeners: true, createdAt: true },
    });
    const listenersHistory = snapshots
      .reverse()
      .map((s) => ({ listeners: Number(s.listeners), date: s.createdAt }));

    // Похожие артисты с ЯМ: если такой артист есть на Moooza (по индексируемой
    // колонке ymId) — отдаём moozaArtistId, клиент ведёт на нашу карточку.
    // Служебный список автозаполнения синка (ymData.autofilled) наружу не отдаём.
    let ymData = rest.ymData as any;
    if (ymData && typeof ymData === 'object' && 'autofilled' in ymData) {
      const { autofilled: _af, ...publicYm } = ymData;
      ymData = publicYm;
    }
    const similar: any[] = Array.isArray(ymData?.similarArtists) ? ymData.similarArtists : [];
    if (similar.length > 0) {
      const similarIds = [...new Set(similar.map((s: any) => String(s?.ymId ?? '')).filter((s) => /^\d+$/.test(s)))];
      const ours = similarIds.length
        ? await prisma.artist.findMany({
            where: { ymId: { in: similarIds }, status: { in: ['VERIFIED', 'APPROVED'] }, NOT: { id } },
            select: { id: true, ymId: true },
          })
        : [];
      const ymToMooza = new Map<string, string>(ours.map((a) => [a.ymId as string, a.id]));
      ymData = {
        ...ymData,
        similarArtists: similar.map((s: any) => ({
          ...s,
          moozaArtistId: ymToMooza.get(String(s.ymId)) ?? null,
        })),
      };
    }

    return res.json(serializeArtist({
      ...rest,
      ...(viewerIsAdmin ? { verificationCode, verificationProofUrl, rejectionReason } : {}),
      ymData,
      listenersHistory,
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
    // listeners с клиента не принимаем — метрика приходит только из синка ЯМ.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { name, type } = body;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Имя артиста обязательно' });
    }
    if (name.trim().length > 200) {
      return res.status(400).json({ error: 'Название не длиннее 200 символов' });
    }
    if (typeof type !== 'string' || !ARTIST_TYPES.has(type)) {
      return res.status(400).json({ error: 'Выберите тип артиста' });
    }

    // Роль создателя — обязательна, из каталога ролей коллектива (COLLECTIVE).
    // Названия ролей сохраняем на артисте (описательно) и вешаем роли на
    // строку участия создателя — они видны как роли владельца в составе.
    const roleIds = await resolveRoleIds(body.submitterRoleIds, 'COLLECTIVE');
    if (roleIds === null) return res.status(400).json({ error: 'Указана несуществующая роль' });
    if (!roleIds.length) return res.status(400).json({ error: 'Укажите, кем вы являетесь для артиста' });
    const submitterRoleRows = await prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true },
    });

    const genreIds = await resolveGenreIds(body.genreIds);
    if (genreIds === null) return res.status(400).json({ error: 'Указан несуществующий жанр' });

    const city = body.city === undefined ? { ok: true as const, value: null } : parseOptionalText(body.city, 200, 'Город');
    if (!city.ok) return res.status(400).json({ error: city.error });
    const tourReady = body.tourReady === undefined ? { ok: true as const, value: null } : parseOptionalText(body.tourReady, 200, 'Готовность к туру');
    if (!tourReady.ok) return res.status(400).json({ error: tourReady.error });
    const description = body.description === undefined ? { ok: true as const, value: null } : parseOptionalText(body.description, 4000, 'Описание');
    if (!description.ok) return res.status(400).json({ error: description.error });
    const bandLink = body.bandLink === undefined ? { ok: true as const, value: null } : parseBandLink(body.bandLink);
    if (!bandLink.ok) return res.status(400).json({ error: bandLink.error });

    let socialLinks: Record<string, string> | undefined;
    let ymId: string | null = null;
    if (body.socialLinks !== undefined) {
      const sl = sanitizeSocialLinks(body.socialLinks);
      if (!sl.ok) return res.status(400).json({ error: sl.error });
      socialLinks = Object.keys(sl.value).length ? sl.value : undefined;
      ymId = extractYmArtistId(sl.value.yandex_music);
      if (ymId && (await ymIdTakenByOther(ymId))) return res.status(409).json({ error: YM_TAKEN_ERROR });
    }

    // Generate the verification code immediately at creation.
    const verificationCode = await generateUniqueVerificationCode();

    const artist = await prisma.artist.create({
      data: {
        name: name.trim(),
        type: type as ArtistType,
        city: city.value,
        tourReady: tourReady.value,
        description: description.value,
        socialLinks: socialLinks ?? undefined,
        ymId,
        bandLink: bandLink.value,
        submitterRoles: submitterRoleRows.map((r) => r.name),
        verificationCode,
        genres: genreIds.length
          ? { create: genreIds.map((gId) => ({ genreId: gId })) }
          : undefined,
        userArtists: {
          create: {
            userId,
            isOwner: true,
            isAdmin: true,
            inviteStatus: 'ACCEPTED',
            participationStatus: 'ACTIVE_MEMBER',
            roles: { create: submitterRoleRows.map((r) => ({ roleId: r.id })) },
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

    const { submittedById: _s, verificationRequestedById: _r, ...created } = artist;
    return res.status(201).json(serializeArtist({
      ...created,
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
    if (isUniqueViolation(err)) return res.status(409).json({ error: YM_TAKEN_ERROR });
    console.error('[artists] POST /', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PUT /api/artists/:id ─────────────────────────────────────────────────────
// Только подтверждённый админ/владелец артиста. Частичное обновление:
// непереданное поле не меняется, null/'' — очищает.
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    if (!(await isArtistAdmin(id, userId))) {
      return res.status(403).json({ error: 'Нет прав для редактирования' });
    }

    const existing = await prisma.artist.findUnique({
      where: { id },
      select: { name: true, status: true, socialLinks: true },
    });
    if (!existing) return res.status(404).json({ error: 'Артист не найден' });

    // listeners с клиента не принимаем — метрика приходит только из синка ЯМ.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { name, type, genreIds } = body;

    const updateData: Prisma.ArtistUpdateInput = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Имя артиста обязательно' });
      if (name.trim().length > 200) return res.status(400).json({ error: 'Название не длиннее 200 символов' });
      // A verified artist's name is locked — changing it requires support.
      if (existing.status === 'VERIFIED' && name.trim() !== existing.name) {
        return res.status(400).json({
          error: 'Название верифицированного артиста нельзя изменить — обратитесь в поддержку',
        });
      }
      updateData.name = name.trim();
    }
    if (type !== undefined) {
      if (type === null || type === '') updateData.type = null;
      else if (typeof type === 'string' && ARTIST_TYPES.has(type)) updateData.type = type as ArtistType;
      else return res.status(400).json({ error: 'Неверный тип артиста' });
    }
    for (const [key, max, label] of [
      ['city', 200, 'Город'],
      ['tourReady', 200, 'Готовность к туру'],
      ['description', 4000, 'Описание'],
    ] as const) {
      if (body[key] === undefined) continue;
      const parsed = parseOptionalText(body[key], max, label);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      (updateData as any)[key] = parsed.value;
    }
    if (body.bandLink !== undefined) {
      const parsed = parseBandLink(body.bandLink);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      updateData.bandLink = parsed.value;
    }
    if (body.socialLinks !== undefined) {
      const parsed = sanitizeSocialLinks(body.socialLinks);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const oldYm = extractYmArtistId(((existing.socialLinks as any) ?? {})?.yandex_music);
      const newYm = extractYmArtistId(parsed.value.yandex_music);
      if (newYm !== oldYm) {
        // Ночной синк тянет по этой ссылке дискографию и слушателей. У
        // проверенного артиста подмена ссылки = привязка чужой дискографии к
        // верифицированной карточке — меняется только через поддержку.
        if (YM_SYNCED_STATUSES.has(existing.status)) {
          return res.status(400).json({
            error: 'Ссылку на Яндекс Музыку проверенного артиста можно изменить только через поддержку',
          });
        }
        if (newYm && (await ymIdTakenByOther(newYm, id))) {
          return res.status(409).json({ error: YM_TAKEN_ERROR });
        }
        updateData.ymId = newYm;
      }
      updateData.socialLinks = parsed.value;
    }

    if (genreIds !== undefined) {
      const ids = await resolveGenreIds(genreIds);
      if (ids === null) return res.status(400).json({ error: 'Указан несуществующий жанр' });
      updateData.genres = {
        deleteMany: {},
        create: ids.map((gId) => ({ genreId: gId })),
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
          where: { inviteStatus: 'ACCEPTED' },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true },
            },
          },
        },
      },
    });

    const { submittedById: _s, verificationRequestedById: _r, ...updated } = artist;
    return res.json(serializeArtist({
      ...updated,
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
    if (isUniqueViolation(err)) return res.status(409).json({ error: YM_TAKEN_ERROR });
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

      if (!(await isArtistAdmin(id, userId))) {
        dropUploadedFile(req.file);
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
      dropUploadedFile(req.file);
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

      if (!(await isArtistAdmin(id, userId))) {
        dropUploadedFile(req.file);
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
      dropUploadedFile(req.file);
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

    const exists = await prisma.artist.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: 'Артист не найден' });

    await prisma.artistFollower.upsert({
      where: { userId_artistId: { userId, artistId: id } },
      create: { userId, artistId: id },
      update: {},
    });

    return res.json({ followed: true });
  } catch (err) {
    // Артиста удалили между проверкой и записью / параллельный двойной клик.
    if (isFkViolation(err)) return res.status(404).json({ error: 'Артист не найден' });
    if (isUniqueViolation(err)) return res.json({ followed: true });
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
    // (invalidating the old one). Кто подал — в отдельное поле; submittedById не
    // перезаписываем (его считали «владельцем» легаси-ручки и часть клиента).
    const data: Prisma.ArtistUpdateInput = {
      verificationProofUrl: url,
      status: 'PENDING',
      rejectionReason: null,
      verificationRequestedBy: { connect: { id: userId } },
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

    // Roles come from the seeded role catalog (collective context).
    const roleIds = await resolveRoleIds((req.body ?? {}).roleIds, 'COLLECTIVE');
    if (roleIds === null) return res.status(400).json({ error: 'Некорректные роли' });
    if (!roleIds.length) return res.status(400).json({ error: 'Укажите хотя бы одну роль' });

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    // Already a member or request already pending? Проверка + вставка — в одной
    // транзакции; от гонки двойного клика страхует частичный уникальный индекс
    // "UserArtist_live_userId_artistId_key" (P2002 → тот же ответ).
    const DUP_ERROR = 'Вы уже участник или заявка уже отправлена';
    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.userArtist.findFirst({
          where: { userId, artistId, inviteStatus: { in: ['PENDING', 'ACCEPTED'] } },
          select: { id: true },
        });
        if (existing) throw new JoinDuplicate();
        // Self-requested membership (invitedById=null) — the artist admin approves it.
        await tx.userArtist.create({
          data: {
            userId, artistId, inviteStatus: 'PENDING', isOwner: false, participationStatus: 'ACTIVE_MEMBER',
            roles: { create: roleIds.map((roleId) => ({ roleId })) },
          },
        });
      });
    } catch (e) {
      if (e instanceof JoinDuplicate || isUniqueViolation(e)) return res.status(400).json({ error: DUP_ERROR });
      throw e;
    }

    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const actorFullName = `${actor?.firstName ?? ''} ${actor?.lastName ?? ''}`.trim();
    const roleList = await roleNames(roleIds);
    // Notify the artist owner + admins (those who can approve the request).
    const notifyIds = (await artistAdminIds(artistId)).filter((id) => id !== userId);
    await notifyMany(notifyIds, {
      actorId: userId, type: 'artist_join_request',
      title: 'Запрос на участие',
      body: `${actorFullName} запрашивает роль «${roleList}» в «${artist.name}»`,
      link: `/artist/${artistId}`,
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[artists] POST /:id/join-request', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

class JoinDuplicate extends Error {}

// ── GET /api/artists/:id/memberships/pending — pending join requests for artist ─
// Owner OR confirmed admin of the artist (the same people who approve/reject).
router.get('/:id/memberships/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const artistId = req.params.id;
    if (!(await isArtistAdmin(artistId, req.userId!))) return res.status(403).json({ error: 'Нет прав' });
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
  } catch (err) {
    console.error('[artists] GET /:id/memberships/pending', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Helper: load a SELF-REQUESTED, still-pending join request (invitedById = null,
// not the owner row) and check the current user may decide on it (confirmed
// owner/admin of that artist). Admin-sent invitations, already-processed rows
// and the owner's own row are not «join requests» — 404/409 instead.
async function loadJoinRequest(membershipId: string, userId: string): Promise<
  { status: 404 | 403 | 409; ua?: undefined } | { status: 200; ua: any }
> {
  const ua = await prisma.userArtist.findUnique({
    where: { id: membershipId },
    include: {
      artist: { select: { id: true, name: true } },
      roles: { include: { role: { select: { name: true } } } },
    },
  });
  if (!ua) return { status: 404 };
  if (!(await isArtistAdmin(ua.artistId, userId))) return { status: 403 };
  if (ua.inviteStatus !== 'PENDING' || ua.invitedById !== null || ua.isOwner) return { status: 409 };
  return { status: 200, ua };
}

const JOIN_REQUEST_ERRORS: Record<number, string> = {
  404: 'Заявка не найдена',
  403: 'Нет прав',
  409: 'Заявка уже обработана',
};

// ── PATCH /api/artists/memberships/:id/approve ───────────────────────────────
router.patch('/memberships/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const found = await loadJoinRequest(req.params.id, req.userId!);
    if (found.status !== 200) return res.status(found.status).json({ error: JOIN_REQUEST_ERRORS[found.status] });
    const ua = found.ua;
    // Атомарно и только над всё ещё ожидающей заявкой (без «принятия»
    // отклонённого приглашения и без повторной обработки).
    const { count } = await prisma.userArtist.updateMany({
      where: { id: ua.id, inviteStatus: 'PENDING', invitedById: null, isOwner: false },
      data: { inviteStatus: 'ACCEPTED' },
    });
    if (!count) return res.status(409).json({ error: JOIN_REQUEST_ERRORS[409] });
    const roleList = ua.roles.map((r: any) => r.role.name).join(', ');
    await notify({
      userId: ua.userId, actorId: req.userId, type: 'artist_join_approved',
      title: 'Участие подтверждено',
      body: roleList
        ? `Ваш запрос на роль «${roleList}» в «${ua.artist.name}» подтверждён!`
        : `Ваш запрос на участие в «${ua.artist.name}» подтверждён!`,
      link: `/artist/${ua.artistId}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[artists] PATCH /memberships/:id/approve', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/artists/memberships/:id/reject ────────────────────────────────
router.patch('/memberships/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const found = await loadJoinRequest(req.params.id, req.userId!);
    if (found.status !== 200) return res.status(found.status).json({ error: JOIN_REQUEST_ERRORS[found.status] });
    const ua = found.ua;
    // Удаляется только ожидающая заявка — не строка владельца и не участник.
    const { count } = await prisma.userArtist.deleteMany({
      where: { id: ua.id, inviteStatus: 'PENDING', invitedById: null, isOwner: false },
    });
    if (!count) return res.status(409).json({ error: JOIN_REQUEST_ERRORS[409] });
    const roleList = ua.roles.map((r: any) => r.role.name).join(', ');
    await notify({
      userId: ua.userId, actorId: req.userId, type: 'artist_join_rejected',
      title: 'Запрос отклонён',
      body: roleList
        ? `Ваш запрос на роль «${roleList}» в «${ua.artist.name}» отклонён.`
        : `Ваш запрос на участие в «${ua.artist.name}» отклонён.`,
      link: `/artist/${ua.artistId}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[artists] PATCH /memberships/:id/reject', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5a — members / admins / ownership / role-bound invite links
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL = process.env.APP_URL || 'https://moooza.ru';

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

// Управление чужой строкой участия (статус/роли/исключение). Рядовой админ
// управляет только рядовыми участниками; строку другого админа или владельца
// меняет только владелец.
async function loadManagedMembership(
  artistId: string,
  membershipId: string,
  meId: string,
): Promise<{ status: 403 | 404; error: string } | { status: 200; ua: any; artistName: string; isOwner: boolean }> {
  const access = await getArtistAccess(artistId, meId);
  if (!access.isAdmin) return { status: 403, error: 'Нет прав' };
  const ua = await prisma.userArtist.findUnique({
    where: { id: membershipId },
    include: { artist: { select: { name: true } } },
  });
  if (!ua || ua.artistId !== artistId) return { status: 404, error: 'Участник не найден' };
  if ((ua.isAdmin || ua.isOwner) && !access.isOwner) {
    return { status: 403, error: 'Администраторов и владельца может менять только владелец' };
  }
  return { status: 200, ua, artistName: ua.artist.name, isOwner: access.isOwner };
}

// ── POST /api/artists/:id/members — admin adds a registered user (invite) ─────
router.post('/:id/members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const artistId = req.params.id;
    const { userId, participationStatus } = (req.body ?? {}) as {
      userId?: unknown;
      participationStatus?: 'ACTIVE_MEMBER' | 'FORMER_MEMBER';
    };

    if (typeof userId !== 'string' || !userId) return res.status(400).json({ error: 'userId обязателен' });

    if (!(await isArtistAdmin(artistId, meId))) return res.status(403).json({ error: 'Нет прав' });

    const cleanRoleIds = await resolveRoleIds((req.body ?? {}).roleIds, 'COLLECTIVE');
    if (cleanRoleIds === null) return res.status(400).json({ error: 'Указана несуществующая роль' });
    if (!cleanRoleIds.length) {
      return res.status(400).json({ error: 'Укажите хотя бы одну роль участника' });
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isBlocked: true } });
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (target.isBlocked) return res.status(400).json({ error: 'Пользователь заблокирован' });

    const part = participationStatus === 'FORMER_MEMBER' ? 'FORMER_MEMBER' : 'ACTIVE_MEMBER';
    const DUP_ERROR = 'Пользователь уже является участником или приглашён';

    let membership;
    try {
      membership = await prisma.$transaction(async (tx) => {
        // Reject if already an active (PENDING or ACCEPTED) membership.
        const existingActive = await tx.userArtist.findFirst({
          where: { artistId, userId, inviteStatus: { in: ['PENDING', 'ACCEPTED'] } },
          select: { id: true },
        });
        if (existingActive) throw new JoinDuplicate();
        return tx.userArtist.create({
          data: {
            userId,
            artistId,
            professionId: null,
            isOwner: false,
            isAdmin: false,
            inviteStatus: 'PENDING',
            participationStatus: part,
            invitedById: meId,
            roles: { create: cleanRoleIds.map((roleId) => ({ roleId })) },
          },
          include: { roles: { include: { role: { select: { id: true, name: true } } } } },
        });
      });
    } catch (e) {
      if (e instanceof JoinDuplicate || isUniqueViolation(e)) return res.status(400).json({ error: DUP_ERROR });
      throw e;
    }

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
// Только ПРИГЛАШЕНИЕ админа (invitedById задан). Собственную заявку на
// вступление (invitedById = null) пользователь сам себе подтвердить не может —
// её одобряет админ артиста (PATCH /memberships/:id/approve).
router.patch('/memberships/:membershipId/confirm', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const ua = await prisma.userArtist.findUnique({
      where: { id: req.params.membershipId },
      include: { artist: { select: { id: true, name: true } } },
    });
    if (!ua) return res.status(404).json({ error: 'Приглашение не найдено' });
    if (ua.userId !== meId) return res.status(403).json({ error: 'Нет прав' });
    if (!ua.invitedById) {
      return res.status(403).json({ error: 'Заявку на участие подтверждает администратор артиста' });
    }

    // Атомарно: повторный/параллельный confirm не шлёт уведомление второй раз.
    const { count } = await prisma.userArtist.updateMany({
      where: { id: ua.id, inviteStatus: 'PENDING', invitedById: { not: null } },
      data: { inviteStatus: 'ACCEPTED' },
    });
    if (!count) return res.status(400).json({ error: 'Приглашение уже обработано' });

    const name = await actorName(meId);
    // Notify the inviter + all artist admins/owner.
    const recipientIds = new Set<string>(await artistAdminIds(ua.artistId));
    recipientIds.add(ua.invitedById);
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
    if (ua.isOwner) return res.status(400).json({ error: 'Приглашение уже обработано' });

    const { count } = await prisma.userArtist.updateMany({
      where: { id: ua.id, inviteStatus: 'PENDING', isOwner: false },
      data: { inviteStatus: 'DECLINED' },
    });
    if (!count) return res.status(400).json({ error: 'Приглашение уже обработано' });

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
    const { participationStatus } = (req.body ?? {}) as {
      participationStatus?: 'ACTIVE_MEMBER' | 'FORMER_MEMBER';
    };

    if (participationStatus !== 'ACTIVE_MEMBER' && participationStatus !== 'FORMER_MEMBER') {
      return res.status(400).json({ error: 'Неверный participationStatus' });
    }

    const found = await loadManagedMembership(artistId, membershipId, meId);
    if (found.status !== 200) return res.status(found.status).json({ error: found.error });
    const ua = found.ua;

    await prisma.userArtist.update({
      where: { id: membershipId },
      // Manual change overrides the auto-lifecycle: clear the flag so a future
      // reactivation won't revert the admin's decision.
      data: { participationStatus, autoFormered: false },
    });

    if (ua.userId !== meId && ua.participationStatus !== participationStatus && ua.inviteStatus === 'ACCEPTED') {
      await notify({
        userId: ua.userId,
        actorId: meId,
        type: 'artist_member_status_changed',
        title: found.artistName,
        body: participationStatus === 'FORMER_MEMBER'
          ? `Вас перевели в бывшие участники «${found.artistName}».`
          : `Вас вернули в действующие участники «${found.artistName}».`,
        link: `/artist/${artistId}`,
      });
    }

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

    const found = await loadManagedMembership(artistId, membershipId, meId);
    if (found.status !== 200) return res.status(found.status).json({ error: found.error });
    const ua = found.ua;

    const cleanRoleIds = await resolveRoleIds((req.body ?? {}).roleIds, 'COLLECTIVE');
    if (cleanRoleIds === null) return res.status(400).json({ error: 'Указана несуществующая роль' });

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

    if (ua.userId !== meId) {
      const names = await roleNames(cleanRoleIds);
      await notify({
        userId: ua.userId,
        actorId: meId,
        type: 'artist_member_roles_changed',
        title: found.artistName,
        body: names
          ? `Ваши роли в «${found.artistName}» изменены: ${names}.`
          : `Ваши роли в «${found.artistName}» сняты.`,
        link: `/artist/${artistId}`,
      });
    }

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

    const found = await loadManagedMembership(artistId, membershipId, meId);
    if (found.status !== 200) return res.status(found.status).json({ error: found.error });
    const ua = found.ua;
    if (ua.isOwner) return res.status(400).json({ error: 'Нельзя удалить владельца' });

    const { count } = await prisma.userArtist.deleteMany({ where: { id: membershipId, isOwner: false } });
    if (!count) return res.status(404).json({ error: 'Участник не найден' });

    if (ua.userId !== meId && (ua.inviteStatus === 'ACCEPTED' || ua.inviteStatus === 'PENDING')) {
      await notify({
        userId: ua.userId,
        actorId: meId,
        type: 'artist_member_removed',
        title: found.artistName,
        body: ua.inviteStatus === 'ACCEPTED'
          ? `Вас исключили из состава «${found.artistName}».`
          : `Приглашение в «${found.artistName}» отменено.`,
        link: `/artist/${artistId}`,
      });
    }

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
    const { activityStatus } = (req.body ?? {}) as {
      activityStatus?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'DISBANDED';
    };

    const valid = ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'DISBANDED'];
    if (!activityStatus || !valid.includes(activityStatus)) {
      return res.status(400).json({ error: 'Неверный activityStatus' });
    }

    if (!(await isArtistAdmin(artistId, meId))) return res.status(403).json({ error: 'Нет прав' });

    const artist = await prisma.artist.findUnique({ where: { id: artistId } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const wasActive = artist.activityStatus === 'ACTIVE';

    const updated = await prisma.artist.update({
      where: { id: artistId },
      data: { activityStatus },
    });

    // Active → non-active: freeze the lineup. Active members become former
    // members (history preserved — no deletion). Tag them `autoFormered` so a
    // later reactivation can restore exactly this set.
    if (wasActive && activityStatus !== 'ACTIVE') {
      await prisma.userArtist.updateMany({
        where: { artistId, participationStatus: 'ACTIVE_MEMBER' },
        data: { participationStatus: 'FORMER_MEMBER', autoFormered: true },
      });
    }

    // Non-active → active: restore the lineup. Members auto-demoted when the
    // artist went inactive become active again; members an admin marked former
    // manually (autoFormered=false) are left untouched.
    if (!wasActive && activityStatus === 'ACTIVE') {
      await prisma.userArtist.updateMany({
        where: { artistId, participationStatus: 'FORMER_MEMBER', autoFormered: true },
        data: { participationStatus: 'ACTIVE_MEMBER', autoFormered: false },
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
    const { userId } = (req.body ?? {}) as { userId?: unknown };
    if (typeof userId !== 'string' || !userId) return res.status(400).json({ error: 'userId обязателен' });

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
    // Прежнему владельцу — подтверждение (след на случай чужого доступа к аккаунту).
    const newOwnerName = await actorName(userId);
    await notify({
      userId: meId,
      type: 'artist_owner_transferred_from',
      title: artist.name,
      body: `Вы передали владение артистом «${artist.name}» пользователю ${newOwnerName}. Вы остаётесь администратором.`,
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
    const { userId } = (req.body ?? {}) as { userId?: unknown };
    if (typeof userId !== 'string' || !userId) return res.status(400).json({ error: 'userId обязателен' });

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
// Ссылка живёт 30 дней; необязательный лимит использований maxUses (1–1000).
router.post('/:id/invite-link', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const meId = req.userId!;
    const artistId = req.params.id;
    const { participationStatus, maxUses } = (req.body ?? {}) as {
      participationStatus?: 'ACTIVE_MEMBER' | 'FORMER_MEMBER';
      maxUses?: unknown;
    };

    if (!(await isArtistAdmin(artistId, meId))) return res.status(403).json({ error: 'Нет прав' });

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const cleanRoleIds = await resolveRoleIds((req.body ?? {}).roleIds, 'COLLECTIVE');
    if (cleanRoleIds === null) return res.status(400).json({ error: 'Указана несуществующая роль' });
    let limit: number | null = null;
    if (maxUses !== undefined && maxUses !== null && maxUses !== '') {
      if (typeof maxUses !== 'number' || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) {
        return res.status(400).json({ error: 'Лимит использований — целое число от 1 до 1000' });
      }
      limit = maxUses;
    }
    const part = participationStatus === 'FORMER_MEMBER' ? 'FORMER_MEMBER' : 'ACTIVE_MEMBER';
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + ARTIST_INVITE_TTL_MS);

    await prisma.artistInvite.create({
      data: {
        artistId,
        token,
        roleIds: cleanRoleIds,
        participationStatus: part,
        createdById: meId,
        expiresAt,
        maxUses: limit,
      },
    });

    return res.status(201).json({
      token,
      url: `${APP_URL}/register?artistInvite=${token}`,
      expiresAt,
      maxUses: limit,
    });
  } catch (err) {
    console.error('[artists] POST /:id/invite-link', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/artists/invite/:token — PUBLIC landing/OG preview ────────────────
router.get('/invite/:token', async (req: AuthRequest, res: Response) => {
  try {
    const check = await validateArtistInvite(req.params.token);
    if (!check.ok) return res.status(check.status).json({ error: check.error, code: check.code });
    const invite = check.invite;

    const artist = await prisma.artist.findUnique({
      where: { id: invite.artistId },
      select: { id: true, name: true, avatar: true },
    });
    if (!artist) return res.status(404).json({ error: 'Приглашение не найдено' });

    const roles = invite.roleIds.length
      ? await prisma.role.findMany({
          where: { id: { in: invite.roleIds } },
          select: { id: true, name: true },
        })
      : [];

    return res.json({
      artist: { id: artist.id, name: artist.name, avatar: artist.avatar },
      roles,
      participationStatus: invite.participationStatus,
      expiresAt: invite.expiresAt,
    });
  } catch (err) {
    console.error('[artists] GET /invite/:token', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/artists/invite/:token/accept — already-logged-in user joins ──────
// Counterpart of the signup-time consume in auth.ts: lets an EXISTING user accept
// a role-bound invite link. Проверяет срок/лимит ссылки, атомарно расходует
// использование и создаёт ACCEPTED-участие (lib/artistInvites). Собственная
// PENDING-заявка через ссылку НЕ подтверждается (409) — её решает админ.
router.post('/invite/:token/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await acceptArtistInvite(req.params.token, req.userId!);
    if (!result.ok) return res.status(result.status).json({ error: result.error, code: result.code });
    return res.json(
      result.alreadyMember
        ? { artistId: result.artistId, alreadyMember: true }
        : { artistId: result.artistId },
    );
  } catch (err) {
    console.error('[artists] POST /invite/:token/accept', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
