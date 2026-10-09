import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { upload, uploadBanner, uploadPortfolio } from '../middleware/upload';
import { codeLimiter, guestReadLimiter } from '../middleware/rateLimiter';
import { requireAuthUnlessGuestBrowsing, sendPublic, setGuestCacheHeaders } from '../middleware/guest';
import {
  getPublicProfile, getPublicUserServices, getPublicService, getPublicCredits,
  publicPersonWhere, notifyPublicDataChanged, toPublicCredits, toPublicCatalogSignals,
} from '../lib/publicData';
import { getCreditsSummary, loadCatalogExtras } from '../lib/profileSignals';
import { effectiveResponse, recomputeResponseBadges } from '../lib/responseBadge';
import { recordConsentEvent, requestMeta, sanitizeConsentSource, CONSENT_VERSIONS } from '../lib/consentEvents';
import { maskContacts } from '../lib/maskContacts';
import { yoNorm } from '../utils/search';
import { notify } from '../utils/notify';
import { isProActive, limitsFor } from '../utils/pro';
import { getJwtSecret } from '../utils/jwt';
import { sendEmailChangeCode as sendEmailChangeMail } from '../utils/mailer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

// ── «Отвечает быстро»: пересчёт бейджей раз в сутки (первый — через 5 минут
// после старта). Таймеры unref — не держат процесс. recomputeResponseBadges
// идемпотентна: если её подключит и scheduler, двойной вызов безвреден.
const RESPONSE_BADGE_FIRST_RUN_MS = 5 * 60 * 1000;
const RESPONSE_BADGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => { void recomputeResponseBadges(); }, RESPONSE_BADGE_FIRST_RUN_MS).unref?.();
  setInterval(() => { void recomputeResponseBadges(); }, RESPONSE_BADGE_INTERVAL_MS).unref?.();
}

const userServiceInclude = {
  profession: {
    select: {
      id: true,
      name: true,
      directionId: true,
      direction: {
        select: {
          id: true,
          name: true,
          allowedFilterTypes: true,
          customFilters: {
            select: {
              id: true,
              name: true,
              values: { select: { id: true, value: true }, orderBy: { sortOrder: 'asc' } },
            },
          },
          fieldOfActivity: { select: { id: true, name: true } },
        },
      },
    },
  },
  // section нужен форме редактирования услуги (подпись раздела каталога) и
  // группировке услуг по разделам в профиле — без него sectionName пустой.
  service: {
    select: {
      id: true,
      name: true,
      section: { select: { id: true, name: true } },
    },
  },
  genres:          { select: { id: true, name: true } },
  workFormats:     { select: { id: true, name: true } },
  employmentTypes: { select: { id: true, name: true } },
  skillLevels:     { select: { id: true, name: true } },
  availabilities:  { select: { id: true, name: true } },
  geographies:     { select: { id: true, name: true } },
  // filter.name нужен странице услуги: подписи категорий слева от чипсов
  // («Уровень», «Жанр», …) — как на странице заказа. Без него лейблы пустые.
  selectedCustomFilterValues: { select: { id: true, filterId: true, value: true, filter: { select: { id: true, name: true } } } },
} as const;

const userSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatar: true,
  bannerImage: true,
  bio: true,
  country: true,
  city: true,
  role: true,
  isAdmin: true,
  isBlocked: true,
  isPremium: true,
  isPro: true,
  proUntil: true,
  isVerified: true,
  genres: true,
  fieldOfActivityId: true,
  fieldOfActivity: { select: { id: true, name: true } },
  userServices: { include: userServiceInclude },
  userProfessions: {
    include: {
      profession: {
        select: { id: true, name: true, directionId: true, direction: { select: { id: true, name: true } } },
      },
      selectedCustomFilterValues: {
        include: { filter: { select: { id: true, name: true } } },
      },
    },
  },
  // Только подтверждённые участия: PENDING-заявки/приглашения и DECLINED в
  // профиле не показываются (клиент свои PENDING из профиля не использует —
  // «Мои артисты» берёт groupAPI.getMyGroups).
  userArtists: {
    where: { inviteStatus: 'ACCEPTED' as const },
    include: { artist: { select: { id: true, slug: true, name: true, avatar: true } } },
  },
  socialLinks: true,
  channel: {
    select: {
      id: true,
      name: true,
      description: true,
      avatar: true,
      _count: { select: { subscriptions: true, posts: true } },
    },
  },
  occupancyStatus: true,
  birthDate: true,
  birthDateVisible: true,
  contactsVisible: true,
  contactsVisibility: true,
  notificationPrefs: true,
  // Новый email, ожидающий подтверждения кодом (сам код наружу не отдаётся).
  pendingEmail: true,
  lastSeenAt: true,
  termsAgreedAt: true,
  publicConsentAt: true,
  publicConsentVersion: true,
  publicConsentRevokedAt: true,
  searchIndexingOptOut: true,
  publicConsentPromptAt: true,
  publicConsentPromptCount: true,
  onboardingCompletedAt: true,
  createdAt: true,
  portfolioFiles: { select: { id: true, url: true, originalName: true, title: true, size: true, mimeType: true, sortOrder: true, createdAt: true }, orderBy: { sortOrder: 'asc' as const } },
  portfolioLinks: { select: { id: true, type: true, url: true, title: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
  _count: {
    select: {
      sentRequests: { where: { status: 'accepted' } },
      receivedRequests: { where: { status: 'accepted' } },
      posts: true,
      referrals: true,
    }
  },
} as const;

// Статусы услуг, видимые посторонним: черновики и архив — только владельцу.
const HIDDEN_SERVICE_STATUSES = ['draft', 'archived'];

// Public profile select — no email/phone/isAdmin/isBlocked/notificationPrefs.
// proUntil выбирается только для вычисления isPro и вырезается в toPublicUser.
const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatar: true,
  bannerImage: true,
  bio: true,
  country: true,
  city: true,
  role: true,
  isPremium: true,
  isPro: true,
  proUntil: true,
  isVerified: true,
  genres: true,
  fieldOfActivityId: true,
  fieldOfActivity: { select: { id: true, name: true } },
  userServices: {
    where: { status: { notIn: HIDDEN_SERVICE_STATUSES } },
    include: userServiceInclude,
  },
  userProfessions: {
    include: {
      profession: {
        select: { id: true, name: true, directionId: true, direction: { select: { id: true, name: true } } },
      },
      selectedCustomFilterValues: {
        include: { filter: { select: { id: true, name: true } } },
      },
    },
  },
  // Чужой профиль — только подтверждённые участия (не PENDING/DECLINED).
  userArtists: {
    where: { inviteStatus: 'ACCEPTED' as const },
    include: { artist: { select: { id: true, slug: true, name: true, avatar: true } } },
  },
  socialLinks: true,
  lastSeenAt: true,
  channel: {
    select: {
      id: true,
      name: true,
      description: true,
      avatar: true,
      _count: { select: { subscriptions: true, posts: true } },
    },
  },
  occupancyStatus: true,
  birthDate: true,
  birthDateVisible: true,
  contactsVisible: true,
  contactsVisibility: true,
  // «Отвечает быстро»: кэш пересчёта, вырезается в toPublicUser (наружу —
  // категория responseBadge; минуты — только вошедшим, как avgResponseMinutes)
  responseBadge: true,
  responseBadgeAt: true,
  responseMedianMinutes: true,
  createdAt: true,
  portfolioFiles: { select: { id: true, url: true, originalName: true, title: true, size: true, mimeType: true, sortOrder: true, createdAt: true }, orderBy: { sortOrder: 'asc' as const } },
  portfolioLinks: { select: { id: true, type: true, url: true, title: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
  _count: {
    select: {
      sentRequests: { where: { status: 'accepted' } },
      receivedRequests: { where: { status: 'accepted' } },
      posts: true,
    }
  },
} as const;

/** Пользователь «скрыт» из выдачи: заблокирован навсегда или до даты в будущем. */
function visibleUserWhere() {
  return {
    isBlocked: false,
    OR: [{ blockedUntil: null }, { blockedUntil: { lte: new Date() } }],
  };
}

// Contact links that are gated by the contacts-visibility setting.
const CONTACT_LINK_KEYS = ['phone', 'email', 'tg_profile'];

/**
 * Decide whether the VIEWER may see the OWNER's contact fields, based on the
 * owner's `contactsVisibility` (3-level enum). Falls back to the legacy
 * `contactsVisible` boolean when the enum is absent.
 *   ALL        → always visible
 *   REGISTERED → visible only to authenticated viewers
 *   FRIENDS    → visible only to accepted Connection / Friendship counterparts
 * The owner viewing themselves always sees their own contacts.
 */
async function canViewContacts(
  owner: { id: string; contactsVisibility?: string | null; contactsVisible?: boolean | null },
  viewerId: string | null | undefined
): Promise<boolean> {
  // Owner viewing self.
  if (viewerId && viewerId === owner.id) return true;

  const mode = owner.contactsVisibility
    || (owner.contactsVisible === false ? 'FRIENDS' : 'ALL');

  if (mode === 'ALL') return true;
  if (mode === 'REGISTERED') return !!viewerId;

  // FRIENDS: require an accepted Connection (either direction) OR accepted Friendship.
  if (!viewerId) return false;
  const conn = await prisma.connection.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId: viewerId, receiverId: owner.id },
        { requesterId: owner.id, receiverId: viewerId },
      ],
    },
    select: { id: true },
  });
  if (conn) return true;
  const friend = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: viewerId, receiverId: owner.id },
        { requesterId: owner.id, receiverId: viewerId },
      ],
    },
    select: { id: true },
  });
  return !!friend;
}

function stripContactLinks(socialLinks: any): any {
  if (!socialLinks || typeof socialLinks !== 'object') return socialLinks;
  const links = { ...(socialLinks as Record<string, any>) };
  for (const k of CONTACT_LINK_KEYS) delete links[k];
  return links;
}

/**
 * Приводит строку publicUserSelect к виду для постороннего зрителя:
 * дата рождения — только если владелец разрешил, контакты — по contactsVisibility,
 * срок Pro (proUntil) не раскрывается — отдаётся только итоговый isPro.
 */
async function toPublicUser(user: any, viewerId: string | null | undefined) {
  const {
    birthDateVisible, contactsVisible, contactsVisibility, proUntil, isPro,
    responseBadge, responseBadgeAt, responseMedianMinutes,
    ...publicUser
  } = user;
  if (!birthDateVisible) publicUser.birthDate = null;
  publicUser.isPro = isProActive({ isPro, proUntil });
  publicUser.responseBadge = effectiveResponse({ responseBadge, responseBadgeAt }).badge;
  const showContacts = await canViewContacts(
    { id: publicUser.id, contactsVisibility, contactsVisible },
    viewerId,
  );
  if (!showContacts) {
    publicUser.socialLinks = stripContactLinks(publicUser.socialLinks);
  }
  return publicUser;
}

// Public: resolve user by nickname or UUID — no auth required
router.get('/handle/:handle', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res) => {
  try {
    const { handle } = req.params;
    // Гость: только профили с согласием (иначе одинаковый 404), белый список полей.
    if (!req.userId) {
      return sendPublic(res, await getPublicProfile(handle, { byHandle: true }), 'Пользователь не найден');
    }
    // Try nickname first (strip leading @ if present)
    const cleanHandle = (handle.startsWith('@') ? handle.slice(1) : handle).trim();
    if (!cleanHandle) return res.status(404).json({ error: 'Пользователь не найден' });

    // Никнейм ищем по нормализованной колонке (lower + ё→е) — так же, как
    // проверяется уникальность: «@Алёна» и «@алена» — один пользователь.
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { nickname: { not: null }, nicknameNorm: yoNorm(cleanHandle) },
          { id: cleanHandle },
        ],
      },
      select: publicUserSelect,
    });

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // Respect the same privacy gates as GET /:id.
    res.json(await toPublicUser(user, req.userId));
  } catch (error) {
    console.error('Get by handle error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      // «Отвечает быстро» — кэш пересчёта, наружу через effectiveResponse
      select: { ...userSelect, responseBadge: true, responseBadgeAt: true, responseMedianMinutes: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const shouldPromptPublicConsent = await computeShouldPromptPublicConsent(user as any);
    const { responseBadgeAt, responseMedianMinutes, ...me } = user as any;
    const response = effectiveResponse({ responseBadge: me.responseBadge, responseBadgeAt, responseMedianMinutes });
    res.json({
      ...me,
      responseBadge: response.badge,
      avgResponseMinutes: response.medianMinutes,
      shouldPromptPublicConsent,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ─── PATCH /me/notification-prefs — настройки уведомлений ────────────────────
// Категории: messages | orders | vacancies | social. false = отключено.
// Присланные ключи мерджатся с сохранёнными (частичное обновление).
router.patch('/me/notification-prefs', authenticate, async (req: AuthRequest, res) => {
  try {
    const ALLOWED = ['messages', 'orders', 'vacancies', 'social'] as const;
    const incoming: Record<string, boolean> = {};
    for (const key of ALLOWED) {
      if (typeof req.body?.[key] === 'boolean') incoming[key] = req.body[key];
    }
    if (Object.keys(incoming).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    const current = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { notificationPrefs: true },
    });
    const merged = { ...((current?.notificationPrefs as Record<string, boolean> | null) ?? {}), ...incoming };
    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { notificationPrefs: merged },
      select: { id: true, notificationPrefs: true },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update notification prefs error:', error);
    res.status(500).json({ error: 'Failed to update notification prefs' });
  }
});

// Record consent to processing personal data allowed for public distribution
// (152-ФЗ ст. 10.1). One-time: keeps the original timestamp if already given.
const PUBLIC_CONSENT_VERSION = CONSENT_VERSIONS.pd_public;
const PUBLIC_CONSENT_PROMPT_MAX = 3;
const PUBLIC_CONSENT_PROMPT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Показывать ли окно «Сделайте профиль публичным»: нет согласия, согласие не
 * отзывалось сознательно, показов < 3, последний показ > 30 дней назад (или не
 * было), и человеку есть что показать — активная услуга, ACCEPTED-участие в
 * артисте или подтверждённые титры в релизах/клипах.
 */
async function computeShouldPromptPublicConsent(user: {
  id: string;
  publicConsentAt?: Date | null;
  publicConsentRevokedAt?: Date | null;
  publicConsentPromptAt?: Date | null;
  publicConsentPromptCount?: number | null;
}): Promise<boolean> {
  if (user.publicConsentAt) return false;
  if (user.publicConsentRevokedAt) return false; // отозвал сам — не навязываемся
  if ((user.publicConsentPromptCount ?? 0) >= PUBLIC_CONSENT_PROMPT_MAX) return false;
  if (user.publicConsentPromptAt && Date.now() - new Date(user.publicConsentPromptAt).getTime() < PUBLIC_CONSENT_PROMPT_INTERVAL_MS) {
    return false;
  }
  try {
    const [services, artists, releases, clips] = await Promise.all([
      prisma.userService.count({ where: { userId: user.id, status: 'active' } }),
      prisma.userArtist.count({ where: { userId: user.id, inviteStatus: 'ACCEPTED' } }),
      prisma.releaseParticipant.count({ where: { userId: user.id, confirmStatus: 'ACCEPTED' } }),
      prisma.clipParticipant.count({ where: { userId: user.id, confirmStatus: 'ACCEPTED' } }),
    ]);
    return services + artists + releases + clips > 0;
  } catch {
    return false;
  }
}

router.post('/me/public-consent', authenticate, async (req: AuthRequest, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { publicConsentAt: true },
    });
    if (!me?.publicConsentAt) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { publicConsentAt: new Date(), publicConsentVersion: PUBLIC_CONSENT_VERSION },
      });
      await recordConsentEvent({
        userId: req.userId!,
        type: 'pd_public',
        action: 'grant',
        version: PUBLIC_CONSENT_VERSION,
        source: sanitizeConsentSource(req.body?.source, 'profile'),
        ...requestMeta(req),
      });
      notifyPublicDataChanged({ type: 'user', id: req.userId!, reason: 'consent_granted' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Public consent error:', error);
    res.status(500).json({ error: 'Failed to record consent' });
  }
});

// Переименовать файл аватара/обложки при отзыве согласия: старые URL, которые
// могли разойтись по внешним кэшам/поисковикам, перестают работать.
function rotateUploadFile(url: string | null | undefined, folder: 'avatars' | 'covers'): string | null {
  if (!url || !url.startsWith(`/uploads/${folder}/`)) return null;
  try {
    const dir = path.join(process.cwd(), 'uploads', folder);
    const oldName = path.basename(url);
    const oldPath = path.join(dir, oldName);
    if (!fs.existsSync(oldPath)) return null;
    const newName = `${crypto.randomBytes(16).toString('hex')}${path.extname(oldName)}`;
    fs.renameSync(oldPath, path.join(dir, newName));
    return `/uploads/${folder}/${newName}`;
  } catch {
    return null;
  }
}

// ── DELETE /api/users/me/public-consent — отзыв согласия (152-ФЗ ст. 10.1) ──
// Профиль сразу пропадает у гостей (404), контакты «для всех» → «для
// зарегистрированных», файлы аватара/обложки переименовываются, событие — в журнал,
// кэши публичных данных/снимков сбрасываются (onPublicDataChanged).
router.delete('/me/public-consent', authenticate, async (req: AuthRequest, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { publicConsentAt: true, contactsVisibility: true, avatar: true, bannerImage: true },
    });
    if (!me) return res.status(404).json({ error: 'User not found' });

    const data: any = { publicConsentAt: null, publicConsentRevokedAt: new Date() };
    if (me.contactsVisibility === 'ALL') {
      data.contactsVisibility = 'REGISTERED';
      data.contactsVisible = false;
    }
    if (me.publicConsentAt) {
      const newAvatar = rotateUploadFile(me.avatar, 'avatars');
      if (newAvatar) data.avatar = newAvatar;
      const newBanner = rotateUploadFile(me.bannerImage, 'covers');
      if (newBanner) data.bannerImage = newBanner;
    }

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: {
        publicConsentAt: true, publicConsentRevokedAt: true, contactsVisibility: true,
        avatar: true, bannerImage: true,
      },
    });
    await recordConsentEvent({
      userId: req.userId!,
      type: 'pd_public',
      action: 'revoke',
      version: PUBLIC_CONSENT_VERSION,
      source: sanitizeConsentSource(req.body?.source, 'settings'),
      ...requestMeta(req),
    });
    notifyPublicDataChanged({ type: 'user', id: req.userId!, reason: 'consent_revoked' });
    res.json({ ok: true, ...updated });
  } catch (error) {
    console.error('Public consent revoke error:', error);
    res.status(500).json({ error: 'Failed to revoke consent' });
  }
});

// ── POST /api/users/me/public-consent/prompt-shown — окно согласия показано ──
router.post('/me/public-consent/prompt-shown', authenticate, async (req: AuthRequest, res) => {
  try {
    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { publicConsentPromptAt: new Date(), publicConsentPromptCount: { increment: 1 } },
      select: { publicConsentPromptAt: true, publicConsentPromptCount: true },
    });
    res.json({ ok: true, ...updated });
  } catch (error) {
    console.error('Public consent prompt-shown error:', error);
    res.status(500).json({ error: 'Failed to record prompt' });
  }
});

// ── PATCH /api/users/me/search-indexing — запрет индексации профиля ──────────
// { optOut: boolean }. На видимость гостям не влияет — только noindex/sitemap.
router.patch('/me/search-indexing', authenticate, async (req: AuthRequest, res) => {
  try {
    const { optOut } = req.body ?? {};
    if (typeof optOut !== 'boolean') return res.status(400).json({ error: 'optOut (boolean) required' });
    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { searchIndexingOptOut: optOut },
      select: { searchIndexingOptOut: true },
    });
    notifyPublicDataChanged({ type: 'user', id: req.userId!, reason: 'search_indexing' });
    res.json({ ok: true, ...updated });
  } catch (error) {
    console.error('Search indexing opt-out error:', error);
    res.status(500).json({ error: 'Failed to update search indexing' });
  }
});

// Upload avatar
router.post('/me/avatar', authenticate, upload.single('avatar'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get current user to delete old avatar (+ Pro state for GIF gating)
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { avatar: true, isPro: true, proUntil: true }
    });

    // GIF avatar is Pro-only — delete the just-saved file and reject for non-Pro.
    if (req.file.mimetype === 'image/gif' && !isProActive(currentUser)) {
      const savedPath = path.join(process.cwd(), 'uploads', 'avatars', req.file.filename);
      if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
      return res.status(400).json({ error: 'GIF-аватар и обложка доступны в Pro' });
    }

    // Delete old avatar file if exists
    if (currentUser?.avatar) {
      const oldAvatarPath = path.join(process.cwd(), 'uploads', 'avatars', path.basename(currentUser.avatar));
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    // Update user with new avatar URL
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { avatar: avatarUrl },
      select: userSelect,
    });

    res.json(user);
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Upload banner image
router.post('/me/banner', authenticate, uploadBanner.single('banner'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { bannerImage: true, isPro: true, proUntil: true }
    });

    // GIF cover/banner is Pro-only — delete the just-saved file and reject for non-Pro.
    if (req.file.mimetype === 'image/gif' && !isProActive(currentUser)) {
      const savedPath = path.join(process.cwd(), 'uploads', 'covers', req.file.filename);
      if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
      return res.status(400).json({ error: 'GIF-аватар и обложка доступны в Pro' });
    }

    if (currentUser?.bannerImage) {
      const oldPath = path.join(process.cwd(), 'uploads', 'covers', path.basename(currentUser.bannerImage));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const bannerUrl = `/uploads/covers/${req.file.filename}`;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { bannerImage: bannerUrl },
      select: userSelect,
    });

    res.json(user);
  } catch (error) {
    console.error('Upload banner error:', error);
    res.status(500).json({ error: 'Failed to upload banner' });
  }
});

// ── Смена email: код подтверждения на НОВЫЙ адрес ────────────────────────────
// Email — логин и ключ привязки VK-входа, поэтому без подтверждения его менять
// нельзя (иначе можно «занять» чужой адрес). Новое значение лежит в pendingEmail,
// в БД хранится только HMAC кода (сам код в ответы API не попадает), и
// применяется после POST /me/email/confirm.
const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
const EMAIL_CODE_COOLDOWN_MS = 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashEmailCode(userId: string, email: string, code: string): string {
  return crypto.createHmac('sha256', getJwtSecret()).update(`${userId}:${email}:${code}`).digest('hex');
}

function sendEmailChangeCode(to: string, code: string) {
  // Письмо «Подтверждение нового email». Ошибку SMTP не пробрасываем: код можно
  // запросить повторно (POST /me/email/resend).
  sendEmailChangeMail(to, code).catch((err) => console.error('[users] email change code send failed:', err));
}

// Update current user
router.put('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    // artistIds намеренно не принимается: участием в артистах управляет раздел
    // артистов (заявка на вступление / приглашение), а не профиль — иначе через
    // PUT /me можно было вступить в любой коллектив без одобрения.
    const {
      firstName, lastName, nickname, bio, country, city, role, genres,
      socialLinks, birthDate,
      _birthDateISO,
      birthDateVisible,
      fieldOfActivityId,
      userProfessions,
      occupancyStatus,
      email, phone,
      contactsVisible,
      contactsVisibility,
    } = req.body;

    // Parse birthDate: prefer the ISO field, fall back to dd.mm.yyyy, reject invalid dates
    const parseBirthDate = (): Date | null | undefined => {
      // Prefer an explicit ISO string from the client (yyyy-mm-dd)
      if (_birthDateISO) {
        const d = new Date(_birthDateISO);
        return isNaN(d.getTime()) ? undefined : d;
      }
      if (birthDate === undefined) return undefined;      // field not sent — don't touch
      if (!birthDate) return null;                        // empty — clear it
      // Accept dd.mm.yyyy
      const m = String(birthDate).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (m) {
        const d = new Date(`${m[3]}-${m[2]}-${m[1]}`);
        return isNaN(d.getTime()) ? undefined : d;
      }
      // Fall back to native parsing (ISO etc.)
      const d = new Date(birthDate);
      return isNaN(d.getTime()) ? undefined : d;
    };

    // Update basic fields
    const updateData: any = {};
    if (firstName !== undefined) {
      if (typeof firstName !== 'string' || !firstName.trim()) {
        return res.status(400).json({ error: 'Имя не может быть пустым' });
      }
      if (firstName.length > 20) {
        return res.status(400).json({ error: 'Имя — не более 20 символов' });
      }
      updateData.firstName = firstName.trim();
    }
    if (lastName !== undefined) {
      if (typeof lastName !== 'string' || !lastName.trim()) {
        return res.status(400).json({ error: 'Фамилия не может быть пустой' });
      }
      if (lastName.length > 30) {
        return res.status(400).json({ error: 'Фамилия — не более 30 символов' });
      }
      updateData.lastName = lastName.trim();
    }
    if (nickname !== undefined) {
      if (typeof nickname === 'string' && nickname.length > 20) {
        return res.status(400).json({ error: 'Никнейм — не более 20 символов' });
      }
      // Uniqueness (case/ё-insensitive) — only when a non-empty nickname is set.
      const nk = typeof nickname === 'string' ? nickname.trim() : '';
      if (nk) {
        const clash = await prisma.user.findFirst({
          where: { nicknameNorm: yoNorm(nk), NOT: { id: req.userId } },
          select: { id: true },
        });
        if (clash) return res.status(409).json({ error: 'Этот никнейм уже занят' });
      }
      updateData.nickname = nk || null;
    }
    if (bio !== undefined) {
      // Bio length is Pro-gated (Free 100 / Pro 200 chars).
      const proRow = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { isPro: true, proUntil: true },
      });
      const maxBio = limitsFor(isProActive(proRow)).bioChars;
      if (typeof bio === 'string' && bio.length > maxBio) {
        return res.status(400).json({ error: `Описание не должно превышать ${maxBio} символов` });
      }
      updateData.bio = bio;
    }
    if (country !== undefined) updateData.country = country;
    if (city !== undefined) {
      // Only catalog cities may be set. Validate just on change so existing
      // (possibly legacy free-text) cities don't block unrelated profile saves.
      const newCity = typeof city === 'string' ? city.trim() : '';
      if (newCity) {
        const current = await prisma.user.findUnique({ where: { id: req.userId }, select: { city: true } });
        if (newCity !== current?.city) {
          const inCatalog = await prisma.city.findFirst({
            where: { name: { equals: newCity, mode: 'insensitive' } },
            select: { id: true },
          });
          if (!inCatalog) return res.status(400).json({ error: 'Выберите город из списка' });
        }
      }
      updateData.city = city;
    }
    if (role !== undefined) updateData.role = role;
    if (genres !== undefined) updateData.genres = genres;
    if (socialLinks !== undefined) updateData.socialLinks = socialLinks;
    if (fieldOfActivityId !== undefined) updateData.fieldOfActivityId = fieldOfActivityId || null;
    const parsedBirthDate = parseBirthDate();
    if (parsedBirthDate instanceof Date) {
      const now = new Date();
      const age = now.getFullYear() - parsedBirthDate.getFullYear()
        - (now < new Date(now.getFullYear(), parsedBirthDate.getMonth(), parsedBirthDate.getDate()) ? 1 : 0);
      if (age < 16) {
        return res.status(400).json({ error: 'AGE_TOO_YOUNG', message: 'Для использования платформы необходимо быть старше 16 лет' });
      }
    }
    if (parsedBirthDate !== undefined) updateData.birthDate = parsedBirthDate;
    if (birthDateVisible !== undefined) updateData.birthDateVisible = !!birthDateVisible;
    // 3-level contacts visibility (preferred). Keep legacy boolean in sync:
    // ALL → contactsVisible true; REGISTERED/FRIENDS → false.
    if (contactsVisibility !== undefined) {
      const VALID = ['ALL', 'REGISTERED', 'FRIENDS'];
      if (!VALID.includes(contactsVisibility)) {
        return res.status(400).json({ error: 'Некорректное значение видимости контактов' });
      }
      updateData.contactsVisibility = contactsVisibility;
      updateData.contactsVisible = contactsVisibility === 'ALL';
    } else if (contactsVisible !== undefined) {
      // Legacy boolean still supported on its own.
      updateData.contactsVisible = !!contactsVisible;
      updateData.contactsVisibility = contactsVisible ? 'ALL' : 'FRIENDS';
    }
    if (occupancyStatus !== undefined) updateData.occupancyStatus = occupancyStatus || null;

    // Email — НЕ меняется напрямую: новый адрес уходит в pendingEmail, на него
    // отправляется код; применение — только через POST /me/email/confirm.
    let emailCodeToSend: { to: string; code: string } | null = null;
    if (email !== undefined && email !== null && String(email).trim() !== '') {
      const normEmail = String(email).trim().toLowerCase();
      if (!EMAIL_RE.test(normEmail)) {
        return res.status(400).json({ error: 'Некорректный email' });
      }
      const current = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { email: true, pendingEmail: true, pendingEmailExpires: true, lastCodeSentAt: true },
      });
      const alreadyPending = current?.pendingEmail === normEmail
        && !!current?.pendingEmailExpires && current.pendingEmailExpires > new Date();
      if (normEmail !== current?.email && !alreadyPending) {
        const clash = await prisma.user.findFirst({
          where: { email: normEmail, NOT: { id: req.userId } },
          select: { id: true },
        });
        if (clash) return res.status(409).json({ error: 'Этот email уже используется другим аккаунтом' });
        if (current?.lastCodeSentAt && Date.now() - current.lastCodeSentAt.getTime() < EMAIL_CODE_COOLDOWN_MS) {
          return res.status(429).json({ error: 'Подождите минуту перед повторной отправкой кода' });
        }
        const code = String(crypto.randomInt(10000000, 100000000));
        updateData.pendingEmail = normEmail;
        updateData.pendingEmailCodeHash = hashEmailCode(req.userId!, normEmail, code);
        updateData.pendingEmailExpires = new Date(Date.now() + EMAIL_CODE_TTL_MS);
        updateData.lastCodeSentAt = new Date();
        emailCodeToSend = { to: normEmail, code };
      }
    }

    // Phone — optional; empty string clears it, otherwise normalize + uniqueness check
    if (phone !== undefined) {
      const rawPhone = String(phone ?? '').trim();
      if (rawPhone === '') {
        updateData.phone = null;
      } else {
        const normPhone = '+' + rawPhone.replace(/\D/g, '');
        const clash = await prisma.user.findFirst({
          where: { phone: normPhone, NOT: { id: req.userId } },
          select: { id: true },
        });
        if (clash) return res.status(409).json({ error: 'Этот номер телефона уже используется' });
        updateData.phone = normPhone;
      }
    }

    // userProfessions: полный список профессий. Замена (deleteMany + create) и
    // обновление полей пользователя — в одной транзакции: ошибка на любой
    // профессии откатывает всё, а не оставляет пользователя без профессий.
    let professionRows: Array<{ professionId: string; features: string[]; cfvIds: string[] }> | null = null;
    if (userProfessions !== undefined) {
      if (!Array.isArray(userProfessions)) {
        return res.status(400).json({ error: 'userProfessions должен быть массивом' });
      }
      const byProfession = new Map<string, { professionId: string; features: string[]; cfvIds: string[] }>();
      for (const up of userProfessions as Array<{ professionId?: unknown; features?: unknown; selectedCustomFilterValueIds?: unknown }>) {
        if (!up || typeof up.professionId !== 'string' || !up.professionId) {
          return res.status(400).json({ error: 'Не указана профессия' });
        }
        const features = Array.isArray(up.features) ? up.features.filter((f): f is string => typeof f === 'string') : [];
        const cfvIds = Array.isArray(up.selectedCustomFilterValueIds)
          ? up.selectedCustomFilterValueIds.filter((id): id is string => typeof id === 'string' && !!id)
          : [];
        // Дубль профессии в списке → последняя запись (уникальность userId+professionId).
        byProfession.set(up.professionId, { professionId: up.professionId, features, cfvIds });
      }
      professionRows = [...byProfession.values()];
    }

    const user = await prisma.$transaction(async (tx) => {
      if (professionRows) {
        await tx.userProfession.deleteMany({ where: { userId: req.userId } });
        for (const up of professionRows) {
          await tx.userProfession.create({
            data: {
              userId: req.userId!,
              professionId: up.professionId,
              features: up.features,
              selectedCustomFilterValues: up.cfvIds.length
                ? { connect: up.cfvIds.map((id) => ({ id })) }
                : undefined,
            },
          });
        }
      }
      return tx.user.update({
        where: { id: req.userId },
        data: updateData,
        select: userSelect,
      });
    });

    if (emailCodeToSend) sendEmailChangeCode(emailCodeToSend.to, emailCodeToSend.code);

    res.json(user);
  } catch (error: any) {
    // A concurrent nickname change can slip past the findFirst pre-check and hit
    // the DB unique index (TOCTOU). Surface that as a clean 409 instead of a 500.
    if (error?.code === 'P2002') {
      const target = String(error?.meta?.target ?? '');
      if (target.toLowerCase().includes('nickname')) {
        return res.status(409).json({ error: 'Этот никнейм уже занят' });
      }
      return res.status(409).json({ error: 'Значение уже занято' });
    }
    // Несуществующая профессия / значение фильтра.
    if (error?.code === 'P2003' || error?.code === 'P2025') {
      return res.status(400).json({ error: 'Профессия или характеристика не найдена' });
    }
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ── POST /me/email/confirm — применить pendingEmail по коду из письма ───────
router.post('/me/email/confirm', codeLimiter, authenticate, async (req: AuthRequest, res) => {
  try {
    const code = String(req.body?.code ?? '').trim();
    if (!code) return res.status(400).json({ error: 'Введите код из письма' });
    const me = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { pendingEmail: true, pendingEmailCodeHash: true, pendingEmailExpires: true },
    });
    if (!me?.pendingEmail || !me.pendingEmailCodeHash) {
      return res.status(400).json({ error: 'Нет email, ожидающего подтверждения' });
    }
    if (!me.pendingEmailExpires || me.pendingEmailExpires < new Date()) {
      return res.status(400).json({ error: 'Срок действия кода истёк — запросите новый' });
    }
    const expected = Buffer.from(me.pendingEmailCodeHash, 'hex');
    const actual = Buffer.from(hashEmailCode(req.userId!, me.pendingEmail, code), 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return res.status(400).json({ error: 'Неверный код' });
    }
    // Адрес могли занять, пока код шёл письмом.
    const clash = await prisma.user.findFirst({
      where: { email: me.pendingEmail, NOT: { id: req.userId } },
      select: { id: true },
    });
    if (clash) return res.status(409).json({ error: 'Этот email уже используется другим аккаунтом' });
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        email: me.pendingEmail,
        emailVerified: true,
        pendingEmail: null,
        pendingEmailCodeHash: null,
        pendingEmailExpires: null,
      },
      select: userSelect,
    });
    res.json(user);
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Этот email уже используется другим аккаунтом' });
    console.error('Confirm email change error:', error);
    res.status(500).json({ error: 'Не удалось подтвердить email' });
  }
});

// ── POST /me/email/resend — новый код на pendingEmail ─────────────────────────
router.post('/me/email/resend', authenticate, async (req: AuthRequest, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { pendingEmail: true, lastCodeSentAt: true },
    });
    if (!me?.pendingEmail) return res.status(400).json({ error: 'Нет email, ожидающего подтверждения' });
    if (me.lastCodeSentAt && Date.now() - me.lastCodeSentAt.getTime() < EMAIL_CODE_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Подождите минуту перед повторной отправкой кода' });
    }
    const code = String(crypto.randomInt(10000000, 100000000));
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        pendingEmailCodeHash: hashEmailCode(req.userId!, me.pendingEmail, code),
        pendingEmailExpires: new Date(Date.now() + EMAIL_CODE_TTL_MS),
        lastCodeSentAt: new Date(),
      },
    });
    sendEmailChangeCode(me.pendingEmail, code);
    res.json({ ok: true });
  } catch (error) {
    console.error('Resend email change code error:', error);
    res.status(500).json({ error: 'Не удалось отправить код' });
  }
});

// ── DELETE /me/email/pending — отменить смену email ───────────────────────────
router.delete('/me/email/pending', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { pendingEmail: null, pendingEmailCodeHash: null, pendingEmailExpires: null },
      select: userSelect,
    });
    res.json(user);
  } catch (error) {
    console.error('Cancel email change error:', error);
    res.status(500).json({ error: 'Не удалось отменить смену email' });
  }
});

const SERVICE_STATUSES = new Set(['draft', 'active', 'archived']);

/** Публикация услуги (status active) требует согласия 152-ФЗ ст. 10.1. */
const PUBLIC_CONSENT_REQUIRED = {
  error: 'Чтобы опубликовать услугу, дайте согласие на распространение персональных данных',
  code: 'PUBLIC_CONSENT_REQUIRED',
};

/** Целое неотрицательное число или null; undefined — значение некорректно. */
function toOptionalInt(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 2_000_000_000) return undefined;
  return Math.trunc(n);
}

const toIdList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string' && !!id))] : [];

// Update user services (profession → service → filter axes).
// Контракт — полный список услуг пользователя; элемент может нести `id`
// существующей услуги. Существующие услуги ОБНОВЛЯЮТСЯ на месте (по id, иначе
// по serviceId), новые создаются, удаляются только отсутствующие в списке —
// поэтому id не меняются и не отваливаются посты-услуги в ленте, сделки
// (userServiceId) и ссылки /services/:id.
router.put('/me/services', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const userId = req.userId;

    const services: any[] = req.body;
    if (!Array.isArray(services)) {
      return res.status(400).json({ error: 'Body must be an array of service entries' });
    }

    const existing = await prisma.userService.findMany({
      where: { userId },
      select: { id: true, serviceId: true, status: true },
    });
    const byId = new Map(existing.map((e) => [e.id, e]));
    const byServiceId = new Map(existing.map((e) => [e.serviceId, e]));

    type Existing = (typeof existing)[number];
    type Entry = { match: Existing | null; status: string; data: Record<string, unknown>; rel: Record<string, string[]> };
    const entries: Entry[] = [];
    const seenServices = new Set<string>();
    const seenMatches = new Set<string>();
    for (const us of services) {
      if (!us || typeof us.professionId !== 'string' || !us.professionId || typeof us.serviceId !== 'string' || !us.serviceId) {
        return res.status(400).json({ error: 'Укажите профессию и услугу каталога' });
      }
      if (seenServices.has(us.serviceId)) {
        return res.status(400).json({ error: 'Одна и та же услуга каталога указана дважды' });
      }
      seenServices.add(us.serviceId);

      const match = (typeof us.id === 'string' && byId.get(us.id)) || byServiceId.get(us.serviceId) || null;
      if (match) {
        if (seenMatches.has(match.id)) {
          return res.status(400).json({ error: 'Одна и та же услуга указана дважды' });
        }
        seenMatches.add(match.id);
      }

      const nums = {
        priceFrom: toOptionalInt(us.priceFrom),
        priceTo: toOptionalInt(us.priceTo),
        deadlineFrom: toOptionalInt(us.deadlineFrom),
        deadlineTo: toOptionalInt(us.deadlineTo),
      };
      if (Object.values(nums).some((n) => n === undefined)) {
        return res.status(400).json({ error: 'Некорректная стоимость или срок' });
      }
      // Статус не передан → у существующей услуги сохраняется прежний.
      const status: string = SERVICE_STATUSES.has(us.status) ? us.status : (match?.status ?? 'active');

      entries.push({
        match,
        status,
        data: {
          professionId: us.professionId,
          serviceId: us.serviceId,
          status,
          name: us.name ? String(us.name).slice(0, 50) : null,
          ...nums,
          description: us.description ? String(us.description) : null,
          priceItems: Array.isArray(us.priceItems) && us.priceItems.length > 0 ? us.priceItems : Prisma.DbNull,
        },
        rel: {
          genres: toIdList(us.genreIds),
          workFormats: toIdList(us.workFormatIds),
          employmentTypes: toIdList(us.employmentTypeIds),
          skillLevels: toIdList(us.skillLevelIds),
          availabilities: toIdList(us.availabilityIds),
          geographies: toIdList(us.geographyIds),
          selectedCustomFilterValues: toIdList(us.customFilterValueIds),
        },
      });
    }

    // Новая публикация (не была active → стала active) — только с согласием.
    if (entries.some((e) => e.status === 'active' && e.match?.status !== 'active')) {
      const me = await prisma.user.findUnique({ where: { id: userId }, select: { publicConsentAt: true } });
      if (!me?.publicConsentAt) return res.status(403).json(PUBLIC_CONSENT_REQUIRED);
    }

    const toDelete = existing.filter((e) => !seenMatches.has(e.id)).map((e) => e.id);
    const relData = (rel: Record<string, string[]>, mode: 'set' | 'connect') =>
      Object.fromEntries(Object.entries(rel).map(([k, ids]) => [k, { [mode]: ids.map((id) => ({ id })) }]));

    await prisma.$transaction(async (tx) => {
      if (toDelete.length > 0) {
        // Как DELETE /me/services/:id — посты «Услуга» без услуги не оставляем.
        await tx.post.deleteMany({ where: { serviceId: { in: toDelete } } });
        await tx.userService.deleteMany({ where: { id: { in: toDelete }, userId } });
      }
      for (const e of entries) {
        if (e.match) {
          await tx.userService.update({
            where: { id: e.match.id },
            data: { ...e.data, ...relData(e.rel, 'set') } as Prisma.UserServiceUncheckedUpdateInput,
          });
        } else {
          await tx.userService.create({
            data: { userId, ...e.data, ...relData(e.rel, 'connect') } as Prisma.UserServiceUncheckedCreateInput,
          });
        }
      }
    });

    // Return updated user services
    const userServices = await prisma.userService.findMany({
      where: { userId },
      include: userServiceInclude,
    });

    res.json(userServices);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Эта услуга каталога уже добавлена' });
    }
    if (error?.code === 'P2003' || error?.code === 'P2025') {
      return res.status(400).json({ error: 'Услуга, профессия или характеристика не найдена' });
    }
    console.error('Update user services error:', error);
    res.status(500).json({ error: 'Failed to update user services' });
  }
});

// ── PATCH /api/users/me/services/:serviceId ───────────────────────────────────
router.patch('/me/services/:serviceId', authenticate, async (req: AuthRequest, res) => {
  try {
    const us = await prisma.userService.findUnique({ where: { id: req.params.serviceId } });
    if (!us || us.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    const { priceFrom, priceTo, description, name, deadlineFrom, deadlineTo, priceItems } = req.body;
    const updated = await prisma.userService.update({
      where: { id: req.params.serviceId },
      data: {
        ...(name !== undefined ? { name: name ? String(name).slice(0, 50) : null } : {}),
        ...(priceFrom    !== undefined ? { priceFrom:    priceFrom    !== '' && priceFrom    != null ? Number(priceFrom)    : null } : {}),
        ...(priceTo      !== undefined ? { priceTo:      priceTo      !== '' && priceTo      != null ? Number(priceTo)      : null } : {}),
        ...(deadlineFrom !== undefined ? { deadlineFrom: deadlineFrom !== '' && deadlineFrom != null ? Number(deadlineFrom) : null } : {}),
        ...(deadlineTo   !== undefined ? { deadlineTo:   deadlineTo   !== '' && deadlineTo   != null ? Number(deadlineTo)   : null } : {}),
        ...(description  !== undefined ? { description: description || null } : {}),
        ...(priceItems !== undefined ? { priceItems: priceItems ?? null } : {}),
      },
      include: userServiceInclude,
    });
    return res.json(updated);
  } catch (err) {
    console.error('[users] PATCH /me/services/:serviceId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── PATCH /api/users/me/services/:serviceId/status ───────────────────────────
router.patch('/me/services/:serviceId/status', authenticate, async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    if (!SERVICE_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid status' });
    const us = await prisma.userService.findUnique({ where: { id: req.params.serviceId } });
    if (!us || us.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    if (status === 'active' && us.status !== 'active') {
      const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { publicConsentAt: true } });
      if (!me?.publicConsentAt) return res.status(403).json(PUBLIC_CONSENT_REQUIRED);
    }
    const updated = await prisma.userService.update({
      where: { id: req.params.serviceId },
      data: { status },
      include: userServiceInclude,
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /api/users/services/:serviceId/inquire — notify owner of interest ───
router.post('/services/:serviceId/inquire', authenticate, async (req: AuthRequest, res) => {
  try {
    const us = await prisma.userService.findUnique({
      where: { id: req.params.serviceId },
      include: { service: { select: { name: true } }, user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!us || HIDDEN_SERVICE_STATUSES.includes(us.status)) return res.status(404).json({ error: 'Not found' });
    if (us.userId === req.userId) return res.status(400).json({ error: 'Cannot inquire own service' });
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { firstName: true, lastName: true } });
    const actorName = `${actor?.firstName ?? ''} ${actor?.lastName ?? ''}`.trim();
    await notify({
      userId: us.userId,
      actorId: req.userId,
      type: 'service_inquiry',
      title: 'Интерес к услуге',
      body: `${actorName} заинтересовался услугой «${us.service.name}»`,
      link: `/services/${us.id}`,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── DELETE /api/users/me/services/:serviceId ──────────────────────────────────
router.delete('/me/services/:serviceId', authenticate, async (req: AuthRequest, res) => {
  try {
    const us = await prisma.userService.findUnique({ where: { id: req.params.serviceId } });
    if (!us || us.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    // Also remove any feed «Услуга» posts linked to this offering — otherwise the
    // Post.serviceId is nulled (onDelete: SetNull) and the post lingers as an empty
    // service card with no data.
    await prisma.post.deleteMany({ where: { serviceId: req.params.serviceId } });
    await prisma.userService.delete({ where: { id: req.params.serviceId } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ─── GET /catalog — all users with filters, for catalog page ─────────────────
// Пагинация: ?page=N[&limit=M] → { results, pagination }. Без page — прежний
// контракт (массив первых 100) для мест, где нужен быстрый поиск людей (чат).
// Гость (при guestBrowsingEnabled): только люди с согласием (PUBLIC_PERSON_WHERE),
// не глубже GUEST_CATALOG_PAGE_MAX страниц, без связей, белый список полей;
// при выключенном флаге — 401, как раньше.
const GUEST_CATALOG_PAGE_MAX = 10;
router.get('/catalog', optionalAuthenticate, requireAuthUnlessGuestBrowsing, guestReadLimiter, async (req: AuthRequest, res) => {
  try {
    const isGuest = !req.userId;
    const { query, fieldOfActivityId, directionId, professionId, serviceId, customFilterValueIds: customFilterValueIdsRaw } = req.query;
    const customFilterValueIds = customFilterValueIdsRaw
      ? (customFilterValueIdsRaw as string).split(',').map(s => s.trim()).filter(Boolean)
      : [];

    // ── People-tab catalog filters/sort ──────────────────────────────────────
    const splitList = (raw: any): string[] =>
      raw ? String(raw).split(',').map(s => s.trim()).filter(Boolean) : [];
    const locations = splitList(req.query.location);          // city/country names
    const professionFilter = splitList(req.query.profession); // profession ids
    const occupancy = splitList(req.query.occupancy).filter(o => ['open', 'considering', 'closed'].includes(o));
    const withReviews = req.query.withReviews === '1' || req.query.withReviews === 'true';
    const sortRaw = String(req.query.sort ?? 'date');
    // Гостю связи не показываются — и сортировка по ним не раскрывается.
    const sort = ['date', 'rating', 'connections', 'alpha'].includes(sortRaw) && !(isGuest && sortRaw === 'connections')
      ? sortRaw : 'date';
    const alphaDir = String(req.query.alphaDir ?? 'asc') === 'desc' ? 'desc' : 'asc';

    const paginated = req.query.page !== undefined;
    const pageNum = paginated
      ? Math.min(isGuest ? GUEST_CATALOG_PAGE_MAX : Number.MAX_SAFE_INTEGER, Math.max(1, parseInt(String(req.query.page), 10) || 1))
      : 1;
    const limitNum = paginated
      ? Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20))
      : 100;
    const skip = (pageNum - 1) * limitNum;

    const where: any = { id: { not: req.userId } };

    // Заблокированные (навсегда или до даты в будущем) в каталоге не показываются.
    const andClauses: any[] = [visibleUserWhere()];
    // Гость видит только людей с согласием на публичное распространение ПДн.
    if (isGuest) andClauses.push(publicPersonWhere());

    // Профессия у пользователя может быть и без услуги (UserProfession) — такие
    // тоже должны находиться и поиском, и фильтрами.
    const byProfession = (professionWhere: any) => ({
      OR: [
        { userServices: { some: { profession: professionWhere } } },
        { userProfessions: { some: { profession: professionWhere } } },
      ],
    });

    if (query) {
      const words = (query as string).trim().split(/\s+/).filter(Boolean);
      // Search against generated ё→е-normalized columns so "е" and "ё" are equal.
      const wordClauses = words.map(word => {
        const w = yoNorm(word);
        return {
          OR: [
            // Identity
            { firstNameNorm: { contains: w } },
            { lastNameNorm: { contains: w } },
            { nicknameNorm: { contains: w } },
            // Profile text
            { bioNorm: { contains: w } },
            { cityNorm: { contains: w } },
            { countryNorm: { contains: w } },
            // Service taxonomy
            { userServices: { some: { profession: { nameNorm: { contains: w } } } } },
            { userServices: { some: { service: { nameNorm: { contains: w } } } } },
            { userServices: { some: { profession: { direction: { nameNorm: { contains: w } } } } } },
            { userServices: { some: { profession: { direction: { fieldOfActivity: { nameNorm: { contains: w } } } } } } },
            // Professions without a service
            { userProfessions: { some: { profession: { nameNorm: { contains: w } } } } },
            { userProfessions: { some: { profession: { direction: { nameNorm: { contains: w } } } } } },
            { userProfessions: { some: { profession: { direction: { fieldOfActivity: { nameNorm: { contains: w } } } } } } },
            { userProfessions: { some: { selectedCustomFilterValues: { some: { valueNorm: { contains: w } } } } } },
            // Service filters
            { userServices: { some: { genres: { some: { nameNorm: { contains: w } } } } } },
            { userServices: { some: { workFormats: { some: { nameNorm: { contains: w } } } } } },
            { userServices: { some: { employmentTypes: { some: { nameNorm: { contains: w } } } } } },
            { userServices: { some: { skillLevels: { some: { nameNorm: { contains: w } } } } } },
            { userServices: { some: { availabilities: { some: { nameNorm: { contains: w } } } } } },
            { userServices: { some: { geographies: { some: { nameNorm: { contains: w } } } } } },
            // Custom filter values
            { userServices: { some: { selectedCustomFilterValues: { some: { valueNorm: { contains: w } } } } } },
            // Collectives (confirmed memberships only — not pending requests)
            { userArtists: { some: { inviteStatus: 'ACCEPTED', artist: { nameNorm: { contains: w } } } } },
          ],
        };
      });
      andClauses.push({ AND: wordClauses });
    }

    // Filter by Service (independent catalog)
    if (serviceId) {
      andClauses.push({ userServices: { some: { serviceId: serviceId as string } } });
    }

    // Filter by profession/direction (most→least specific)
    if (professionId) {
      andClauses.push(byProfession({ id: professionId as string }));
    } else if (directionId && !serviceId) {
      andClauses.push(byProfession({ directionId: directionId as string }));
    } else if (fieldOfActivityId) {
      andClauses.push(byProfession({ direction: { fieldOfActivityId: fieldOfActivityId as string } }));
    }

    if (customFilterValueIds.length > 0) {
      andClauses.push({
        userProfessions: {
          some: {
            selectedCustomFilterValues: {
              some: { id: { in: customFilterValueIds } },
            },
          },
        },
      });
    }

    // ── People-tab: location (city OR country), profession, occupancy ────────
    if (locations.length > 0) {
      const locNorms = locations.map(l => yoNorm(l));
      andClauses.push({
        OR: locNorms.flatMap(n => [
          { cityNorm: { contains: n } },
          { countryNorm: { contains: n } },
        ]),
      });
    }

    if (professionFilter.length > 0) {
      andClauses.push(byProfession({ id: { in: professionFilter } }));
    }

    if (occupancy.length > 0) {
      andClauses.push({ occupancyStatus: { in: occupancy } });
    }

    // «Только с отзывами» — фильтр в БД (раньше — после take:500 в JS).
    if (withReviews) {
      andClauses.push({ reviewsReceived: { some: {} } });
    }

    where.AND = andClauses;

    // ── Порядок и страница ───────────────────────────────────────────────────
    // date/alpha — сортировка и пагинация в БД. rating/connections — агрегаты
    // считаются в БД (groupBy) по ВСЕМ подходящим id, затем сортировка и срез
    // страницы; строки грузятся только для страницы.
    let pageIds: string[];
    let totalCount: number;
    if (sort === 'rating' || sort === 'connections') {
      const all = await prisma.user.findMany({
        where,
        select: { id: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      const ids = all.map((u) => u.id);
      totalCount = ids.length;
      const score = new Map<string, number>();
      if (ids.length > 0 && sort === 'rating') {
        const ratings = await prisma.review.groupBy({
          by: ['targetId'],
          where: { targetId: { in: ids } },
          _avg: { rating: true },
        });
        for (const r of ratings) score.set(r.targetId, Number(r._avg.rating ?? -1));
      } else if (ids.length > 0) {
        const [sent, received] = await Promise.all([
          prisma.connection.groupBy({
            by: ['requesterId'],
            where: { status: 'ACCEPTED', requesterId: { in: ids } },
            _count: { _all: true },
          }),
          prisma.connection.groupBy({
            by: ['receiverId'],
            where: { status: 'ACCEPTED', receiverId: { in: ids } },
            _count: { _all: true },
          }),
        ]);
        for (const r of sent) score.set(r.requesterId, (score.get(r.requesterId) ?? 0) + r._count._all);
        for (const r of received) score.set(r.receiverId, (score.get(r.receiverId) ?? 0) + r._count._all);
      }
      // Array.prototype.sort стабилен: при равных значениях остаётся «новые первыми».
      const fallback = sort === 'rating' ? -1 : 0;
      ids.sort((a, b) => (score.get(b) ?? fallback) - (score.get(a) ?? fallback));
      pageIds = ids.slice(skip, skip + limitNum);
    } else {
      const orderBy: any = sort === 'alpha'
        ? [{ lastName: alphaDir }, { firstName: alphaDir }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'asc' }];
      const [rows, count] = await Promise.all([
        prisma.user.findMany({ where, select: { id: true }, orderBy, skip, take: limitNum }),
        prisma.user.count({ where }),
      ]);
      pageIds = rows.map((r) => r.id);
      totalCount = count;
    }

    const users = pageIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: pageIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            avatar: true,
            bio: true,
            city: true,
            country: true,
            occupancyStatus: true,
            isPremium: true,
            isVerified: true,
            createdAt: true,
            // «Отвечает быстро» — наружу только категория (toPublicCatalogSignals)
            responseBadge: true,
            responseBadgeAt: true,
            fieldOfActivity: { select: { id: true, name: true } },
            userServices: {
              where: { status: { notIn: HIDDEN_SERVICE_STATUSES } },
              select: { profession: { select: { id: true, name: true } } },
              distinct: ['professionId'],
            },
            userProfessions: { select: { profession: { select: { id: true, name: true } } } },
            _count: {
              select: {
                sentConnections: { where: { status: 'ACCEPTED' } },
                receivedConnections: { where: { status: 'ACCEPTED' } },
              },
            },
          },
        })
      : [];

    // Агрегаты отзывов — groupBy в БД только для пользователей страницы.
    const ratingRows = pageIds.length > 0
      ? await prisma.review.groupBy({
          by: ['targetId'],
          where: { targetId: { in: pageIds } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : [];
    const ratingByUser = new Map(ratingRows.map((r) => [r.targetId, r]));
    // Мини-бейдж «N релизов» и аудиодемо — три запроса на всю страницу.
    const extras = await loadCatalogExtras(pageIds);

    const byId = new Map(users.map((u) => [u.id, u]));
    const results = pageIds
      .map((id) => byId.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => {
        const r = ratingByUser.get(u.id);
        const reviewsCount = r?._count._all ?? 0;
        const ratingAvg = reviewsCount > 0 && r?._avg.rating != null ? Number(r._avg.rating) : null;
        const connectionsCount = (u._count?.sentConnections ?? 0) + (u._count?.receivedConnections ?? 0);
        const { responseBadge, responseBadgeAt, ...rest } = u as typeof u & { responseBadge?: string | null; responseBadgeAt?: Date | null };
        const signals = toPublicCatalogSignals(extras.get(u.id), { responseBadge, responseBadgeAt });
        return {
          ...rest,
          ratingAvg,
          reviewsCount,
          connectionsCount,
          releasesCount: signals.releasesCount,
          demo: signals.demo,
          responseBadge: signals.responseBadge,
        };
      });

    if (isGuest) {
      // Белый список полей (без связей и служебного), контакты в био — маскируются.
      setGuestCacheHeaders(res);
      const guestResults = results.map((u: any) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        nickname: u.nickname ?? null,
        avatar: u.avatar ?? null,
        bio: maskContacts(u.bio ?? null),
        city: u.city ?? null,
        country: u.country ?? null,
        occupancyStatus: u.occupancyStatus ?? null,
        isPremium: !!u.isPremium,
        isVerified: !!u.isVerified,
        createdAt: u.createdAt,
        fieldOfActivity: u.fieldOfActivity ? { id: u.fieldOfActivity.id, name: u.fieldOfActivity.name } : null,
        userServices: (u.userServices ?? []).map((us: any) => ({
          profession: us.profession ? { id: us.profession.id, name: us.profession.name } : null,
        })),
        userProfessions: (u.userProfessions ?? []).map((up: any) => ({
          profession: up.profession ? { id: up.profession.id, name: up.profession.name } : null,
        })),
        ratingAvg: u.ratingAvg,
        reviewsCount: u.reviewsCount,
        // уже собраны белым списком toPublicCatalogSignals (минут ответа нет)
        releasesCount: u.releasesCount,
        demo: u.demo ? { url: u.demo.url, title: u.demo.title } : null,
        responseBadge: u.responseBadge ?? null,
        isPublic: true,
      }));
      if (!paginated) return res.json(guestResults);
      return res.json({
        results: guestResults,
        pagination: { page: pageNum, limit: limitNum, totalCount, totalPages: Math.ceil(totalCount / limitNum) },
      });
    }

    if (!paginated) return res.json(results);
    res.json({
      results,
      pagination: { page: pageNum, limit: limitNum, totalCount, totalPages: Math.ceil(totalCount / limitNum) },
    });
  } catch (error) {
    console.error('[catalog] GET /catalog error:', error);
    res.status(500).json({ error: 'Failed to get catalog' });
  }
});

// Search users
router.get('/search', authenticate, async (req: AuthRequest, res) => {
  try {
    const { query, role, city, genre, fieldOfActivityId } = req.query;

    const where: any = {
      id: { not: req.userId },
    };

    if (query) {
      const q = yoNorm(query as string);
      where.OR = [
        { firstNameNorm: { contains: q } },
        { lastNameNorm: { contains: q } },
        { nicknameNorm: { contains: q } },
        { bioNorm: { contains: q } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (city) {
      where.cityNorm = { contains: yoNorm(city as string) };
    }

    if (genre) {
      where.genres = { has: genre as string };
    }

    if (fieldOfActivityId) {
      where.fieldOfActivityId = fieldOfActivityId as string;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        avatar: true,
        bio: true,
        country: true,
        city: true,
        role: true,
        isPremium: true,
        isVerified: true,
        isBlocked: true,
        genres: true,
        fieldOfActivity: { select: { id: true, name: true } },
        userProfessions: {
          include: {
            profession: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' }
      ],
      take: 50,
    });

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user by ID — public (no sensitive fields)
// ── GET /api/users/:id/services ──────────────────────────────────────────────
router.get('/:id/services', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res) => {
  try {
    // Гость: только активные услуги и только у человека с согласием (иначе 404).
    if (!req.userId) {
      return sendPublic(res, await getPublicUserServices(req.params.id), 'Not found');
    }
    // Черновики и архив видит только владелец.
    const isOwner = !!req.userId && req.userId === req.params.id;
    const services = await prisma.userService.findMany({
      where: {
        userId: req.params.id,
        ...(isOwner ? {} : { status: { notIn: HIDDEN_SERVICE_STATUSES } }),
      },
      include: userServiceInclude,
      orderBy: [{ professionId: 'asc' }],
    });
    return res.json(services);
  } catch (err) {
    console.error('[users] GET /:id/services', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/users/:id/credits ── «Подтверждённый опыт» ─────────────────────
// Кредиты из релизов/клипов: только подтверждённые участия, артисты не REJECTED.
// Гость — только при согласии на публичность (иначе 404, как профиль).
router.get('/:id/credits', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return sendPublic(res, await getPublicCredits(req.params.id), 'Not found');
    }
    return res.json(toPublicCredits(await getCreditsSummary(req.params.id)));
  } catch (err) {
    console.error('[users] GET /:id/credits', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── GET /api/users/user-service/:serviceId ────────────────────────────────────
router.get('/user-service/:serviceId', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res) => {
  try {
    // Гость: только active-услуга исполнителя с согласием (иначе 404).
    if (!req.userId) {
      return sendPublic(res, await getPublicService(req.params.serviceId), 'Not found');
    }
    const us = await prisma.userService.findUnique({
      where: { id: req.params.serviceId },
      include: {
        ...userServiceInclude,
        user: { select: { id: true, firstName: true, lastName: true, avatar: true, nickname: true } },
      },
    });
    // Черновик/архив посторонним — как несуществующая услуга.
    if (!us || (us.userId !== req.userId && HIDDEN_SERVICE_STATUSES.includes(us.status))) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json(us);
  } catch (err) {
    console.error('[users] GET /user-service/:serviceId', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/:id', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res) => {
  try {
    // Гость: профиль только при согласии на публичное распространение ПДн;
    // без согласия / заблокирован / не существует — одинаковый 404. Белый список:
    // без ДР, онлайна, времени ответа, связей; контакты — только contactsAvailable.
    if (!req.userId) {
      return sendPublic(res, await getPublicProfile(req.params.id), 'User not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: publicUserSelect,
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let friendship: { id: string; status: string; requesterId: string } | null = null;
    if (req.userId && req.userId !== req.params.id) {
      friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { requesterId: req.userId, receiverId: req.params.id },
            { requesterId: req.params.id, receiverId: req.userId },
          ],
        },
        select: { id: true, status: true, requesterId: true },
      });
    }

    const friendshipStatus = !friendship
      ? 'none'
      : friendship.status === 'accepted'
        ? 'accepted'
        : friendship.requesterId === req.userId
          ? 'pending_sent'
          : 'pending_received';

    const dealsCount = await prisma.deal.count({
      where: {
        status: 'COMPLETED',
        OR: [{ customerId: req.params.id }, { executorId: req.params.id }],
      },
    });

    // Время ответа — медиана первых ответов в личных диалогах за 90 дней
    // (≥ 5 диалогов), из кэша суточного пересчёта (lib/responseBadge). Только
    // вошедшим; гостю — лишь категория responseBadge.
    const avgResponseMinutes = effectiveResponse(user as any).medianMinutes;

    // Hide birthDate from other users unless the owner opted to show it, and
    // contact links (phone / email / telegram) unless the viewer is allowed by
    // the owner's 3-level contactsVisibility (ALL / REGISTERED / FRIENDS).
    // (The owner views their own profile through /users/me, which is unaffected.)
    const publicUser = await toPublicUser(user, req.userId);

    // Authoritative flag (from the VIEWER's DB record) for whether the viewer has
    // completed their own profile. Used by the client instead of a stale cached
    // auth object to decide whether to show the "fill your profile" prompt.
    let viewerProfileComplete = false;
    if (req.userId) {
      const v = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { firstName: true, lastName: true, avatar: true },
      });
      viewerProfileComplete = !!(v?.firstName && v?.lastName && v?.avatar);
    }

    res.json({
      ...publicUser,
      isFriend: friendshipStatus === 'accepted',
      friendshipId: friendship?.id ?? null,
      friendshipStatus,
      dealsCount,
      avgResponseMinutes,
      viewerProfileComplete,
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Upload portfolio file
router.post('/me/portfolio', authenticate, uploadPortfolio.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const savedPath = path.join(process.cwd(), 'uploads', 'portfolio', req.file.filename);
    const removeSaved = () => { if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath); };

    // Pro-gated limits (Free 10 files / 20 MB, Pro 20 files / 50 MB).
    const proRow = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { isPro: true, proUntil: true },
    });
    const limits = limitsFor(isProActive(proRow));

    // File COUNT cap.
    const count = await prisma.portfolioFile.count({ where: { userId: req.userId! } });
    if (count >= limits.portfolioFiles) {
      removeSaved();
      return res.status(400).json({ error: `Достигнут лимит файлов портфолио (${limits.portfolioFiles})` });
    }

    // File SIZE cap — photos & documents are capped at 10 MB; audio keeps the
    // Pro-gated limit (Free 20 / Pro 50). multer's fileSize is the Pro MAX, so
    // enforce the effective per-type limit here and delete the file if over.
    const isAudioFile = req.file.mimetype.startsWith('audio/');
    const maxMb = isAudioFile ? limits.portfolioFileMB : 10;
    const maxBytes = maxMb * 1024 * 1024;
    if (req.file.size > maxBytes) {
      removeSaved();
      return res.status(400).json({ error: `Файл превышает лимит ${maxMb} МБ` });
    }

    const fileUrl = `/uploads/portfolio/${req.file.filename}`;
    const pf = await prisma.portfolioFile.create({
      data: { userId: req.userId!, url: fileUrl, originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), size: req.file.size, mimeType: req.file.mimetype, sortOrder: count },
    });
    res.json(pf);
  } catch (error) {
    console.error('Portfolio upload error:', error);
    res.status(500).json({ error: 'Failed to upload portfolio file' });
  }
});

// Delete portfolio file
router.delete('/me/portfolio/:fileId', authenticate, async (req: AuthRequest, res) => {
  try {
    const pf = await prisma.portfolioFile.findFirst({ where: { id: req.params.fileId, userId: req.userId } });
    if (!pf) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(process.cwd(), 'uploads', 'portfolio', path.basename(pf.url));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.portfolioFile.delete({ where: { id: req.params.fileId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Portfolio delete error:', error);
    res.status(500).json({ error: 'Failed to delete portfolio file' });
  }
});

// Reorder portfolio files. Registered BEFORE PATCH /:fileId so «reorder» isn't
// captured as a fileId. Body: { orderedIds: string[] } — the caller's files in
// the desired order; sortOrder is set to each id's index.
router.patch('/me/portfolio/reorder', authenticate, async (req: AuthRequest, res) => {
  try {
    const { orderedIds } = req.body as { orderedIds?: string[] };
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
      return res.status(400).json({ error: 'orderedIds required' });
    }
    const own = await prisma.portfolioFile.findMany({ where: { userId: req.userId! }, select: { id: true } });
    const ownIds = new Set(own.map((f) => f.id));
    const ids = orderedIds.filter((id) => ownIds.has(id));
    await prisma.$transaction(ids.map((id, i) => prisma.portfolioFile.update({ where: { id }, data: { sortOrder: i } })));
    res.json({ success: true });
  } catch (error) {
    console.error('Portfolio reorder error:', error);
    res.status(500).json({ error: 'Failed to reorder portfolio' });
  }
});

// Rename a portfolio file (custom display title; empty → falls back to originalName).
router.patch('/me/portfolio/:fileId', authenticate, async (req: AuthRequest, res) => {
  try {
    const pf = await prisma.portfolioFile.findFirst({ where: { id: req.params.fileId, userId: req.userId } });
    if (!pf) return res.status(404).json({ error: 'File not found' });
    const raw = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 100) : '';
    const updated = await prisma.portfolioFile.update({ where: { id: pf.id }, data: { title: raw || null } });
    res.json(updated);
  } catch (error) {
    console.error('Portfolio rename error:', error);
    res.status(500).json({ error: 'Failed to rename portfolio file' });
  }
});

// Add portfolio link (audio / video)
router.post('/me/portfolio/links', authenticate, async (req: AuthRequest, res) => {
  try {
    const { type, url, title = '' } = req.body;
    if (!type || !url) return res.status(400).json({ error: 'type and url required' });
    if (!['audio', 'video'].includes(type)) return res.status(400).json({ error: 'type must be audio or video' });
    const count = await prisma.portfolioLink.count({ where: { userId: req.userId!, type } });
    if (count >= 5) return res.status(400).json({ error: `Max 5 ${type} links allowed` });
    const link = await prisma.portfolioLink.create({
      data: { userId: req.userId!, type, url, title },
      select: { id: true, type: true, url: true, title: true, createdAt: true },
    });
    res.json(link);
  } catch (error) {
    console.error('Portfolio link add error:', error);
    res.status(500).json({ error: 'Failed to add portfolio link' });
  }
});

// Delete portfolio link
router.delete('/me/portfolio/links/:linkId', authenticate, async (req: AuthRequest, res) => {
  try {
    const link = await prisma.portfolioLink.findFirst({ where: { id: req.params.linkId, userId: req.userId! } });
    if (!link) return res.status(404).json({ error: 'Link not found' });
    await prisma.portfolioLink.delete({ where: { id: req.params.linkId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Portfolio link delete error:', error);
    res.status(500).json({ error: 'Failed to delete portfolio link' });
  }
});

// Agree to terms and privacy policy
router.post('/me/agree-terms', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { termsAgreedAt: new Date() },
      select: userSelect,
    });
    await recordConsentEvent({
      userId: req.userId!, type: 'terms', action: 'grant', source: 'agree-terms', ...requestMeta(req),
    });
    res.json(user);
  } catch (error) {
    console.error('Agree terms error:', error);
    res.status(500).json({ error: 'Failed to record agreement' });
  }
});

// Mark onboarding as completed for current user
router.patch('/me/complete-onboarding', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: { onboardingCompletedAt: new Date() },
      select: { id: true, onboardingCompletedAt: true },
    });
    res.json(user);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
