import { Prisma } from '@prisma/client';
import { prisma } from '../index';

/**
 * Whitelist полей «моего пользователя» для ответов входа/регистрации
 * (/auth/login, /auth/verify-email, Telegram, VK).
 *
 * Раньше эти ответы отдавали запись User целиком (минус password) — вместе с
 * emailVerificationCode, passwordResetCode, pendingEmailCodeHash и прочими
 * служебными полями. Новое поле в схеме теперь НЕ попадает в ответ само собой:
 * его нужно явно добавить сюда.
 *
 * Состав — то, что клиент кладёт в authStore сразу после входа (дальше App
 * обновляет пользователя через GET /users/me).
 */
export const SELF_USER_SELECT = {
  id: true,
  email: true,
  pendingEmail: true,          // новый email, ожидающий подтверждения (без кода/хэша)
  phone: true,
  telegramUsername: true,
  telegramNotifyEnabled: true,
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
  isPremium: true,
  isPro: true,
  proUntil: true,
  isVerified: true,
  emailVerified: true,
  genres: true,
  fieldOfActivityId: true,
  fieldOfActivity: { select: { id: true, name: true } },
  userProfessions: {
    include: {
      profession: { include: { direction: { select: { id: true, name: true } } } },
    },
  },
  userArtists: { where: { inviteStatus: 'ACCEPTED' as const }, include: { artist: { select: { id: true, slug: true, name: true } } } },
  employerId: true,
  employer: { select: { id: true, name: true, inn: true, ogrn: true } },
  socialLinks: true,
  occupancyStatus: true,
  birthDate: true,
  birthDateVisible: true,
  contactsVisible: true,
  contactsVisibility: true,
  notificationPrefs: true,
  termsAgreedAt: true,
  publicConsentAt: true,
  publicConsentVersion: true,
  publicConsentRevokedAt: true,
  searchIndexingOptOut: true,
  consentPdAt: true,
  consentPdVersion: true,
  consentMarketingAt: true,
  onboardingCompletedAt: true,
  lastSeenAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type SelfUser = Prisma.UserGetPayload<{ select: typeof SELF_USER_SELECT }>;

/** «Мой пользователь» по id — только поля из SELF_USER_SELECT. */
export function findSelfUser(id: string): Promise<SelfUser | null> {
  return prisma.user.findUnique({ where: { id }, select: SELF_USER_SELECT });
}
