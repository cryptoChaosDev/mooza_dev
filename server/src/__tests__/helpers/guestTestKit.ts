/**
 * Общие фикстуры для тестов гостевого режима.
 *
 * Prisma в тестах замокан и ИГНОРИРУЕТ select — моки специально возвращают
 * «грязные» строки со всеми чувствительными полями. Так deep-key проверка
 * доказывает, что гостевые сериализаторы собирают ответ по белому списку,
 * а не полагаются на select.
 */

export const NOW = new Date('2026-10-01T10:00:00.000Z');

/** Поля, которые лежат в БД и не должны попасть гостю ни на какой глубине. */
export const SENSITIVE_USER_FIELDS = {
  email: 'secret@mail.ru',
  phone: '+79990000000',
  password: '$2a$10$hash',
  telegramId: '111',
  telegramUsername: 'tg_user',
  vkId: '222',
  birthDate: new Date('1990-01-01'),
  birthDateVisible: true,
  lastSeenAt: NOW,
  notificationPrefs: { messages: false },
  isAdmin: true,
  contactsVisibility: 'ALL',
  contactsVisible: true,
  termsAgreedAt: NOW,
  referrerId: 'ref-1',
  referralLinkUsed: 'REFCODE',
  proUntil: new Date('2030-01-01'),
  emailVerificationCode: '123456',
  passwordResetCode: '654321',
  passwordChangedAt: NOW,
  publicConsentVersion: '2026-05-31',
  searchIndexingOptOut: false,
  publicConsentPromptCount: 1,
  // кэш «Отвечает быстро»: минуты и дата пересчёта гостю не уходят (только категория)
  responseMedianMinutes: 7,
  responseBadgeAt: NOW,
};

export function person(id: string, opts: { consent?: boolean; blocked?: boolean; blockedUntil?: Date | null } = {}) {
  return {
    id,
    firstName: `Имя-${id}`,
    lastName: 'Фамилия',
    nickname: `nick_${id.replace(/-/g, '_')}`,
    avatar: `/uploads/avatars/${id}.png`,
    isVerified: false,
    isPremium: false,
    publicConsentAt: opts.consent === false ? null : NOW,
    isBlocked: !!opts.blocked,
    blockedUntil: opts.blockedUntil ?? null,
    ...SENSITIVE_USER_FIELDS,
  };
}

export const DIRTY_SOCIAL_LINKS = {
  phone: '+79161234567',
  email: 'contact@mail.ru',
  tg_profile: '@ivan_contact',
  vk: 'https://vk.com/id123',
  telegram: 'https://t.me/ivan',
  yandex_music: 'https://music.yandex.ru/artist/42',
  website: 'https://ivan.example',
};

export function serviceRow(id: string, status: string, user: any = person('u-pub')) {
  return {
    id,
    userId: user.id,
    status,
    name: 'Сведение',
    nameNorm: 'сведение',
    description: 'Звоните +7 916 123-45-67 или пишите на mix@mail.ru',
    priceFrom: 1000,
    priceTo: 5000,
    deadlineFrom: 1,
    deadlineTo: 7,
    priceItems: [{ name: 'Трек, связь @mixer_pro', price: 3000 }],
    professionId: 'prof-1',
    serviceId: 'srv-1',
    createdAt: NOW,
    updatedAt: NOW,
    profession: {
      id: 'prof-1', name: 'Звукорежиссёр', directionId: 'dir-1',
      direction: { id: 'dir-1', name: 'Звук', allowedFilterTypes: [], customFilters: [], fieldOfActivity: { id: 'f-1', name: 'Музыка' } },
    },
    service: { id: 'srv-1', name: 'Сведение', section: { id: 'sec-1', name: 'Продакшн' } },
    genres: [{ id: 'g-1', name: 'Рок' }],
    workFormats: [],
    employmentTypes: [],
    skillLevels: [],
    availabilities: [],
    geographies: [],
    selectedCustomFilterValues: [{ id: 'cfv-1', filterId: 'cf-1', value: 'Средний', filter: { id: 'cf-1', name: 'Уровень' } }],
    user,
  };
}

export function profileRow(id = 'u-pub', opts: { consent?: boolean; blocked?: boolean } = {}) {
  return {
    ...person(id, opts),
    bannerImage: null,
    bio: 'Музыкант. Телефон 8 916 123 45 67, tg t.me/ivan_bio',
    country: 'Россия',
    city: 'Москва',
    role: 'musician',
    isPro: false,
    genres: ['Рок'],
    occupancyStatus: 'open',
    socialLinks: DIRTY_SOCIAL_LINKS,
    createdAt: NOW,
    updatedAt: NOW,
    fieldOfActivity: { id: 'f-1', name: 'Музыка' },
    userProfessions: [{
      id: 'up-1', userId: id, features: [],
      profession: { id: 'prof-1', name: 'Звукорежиссёр', directionId: 'dir-1', direction: { id: 'dir-1', name: 'Звук' } },
      selectedCustomFilterValues: [],
    }],
    userServices: [serviceRow('svc-active', 'active'), serviceRow('svc-draft', 'draft'), serviceRow('svc-arch', 'archived')],
    userArtists: [
      { id: 'ua-1', userId: id, inviteStatus: 'ACCEPTED', isOwner: true, isAdmin: true, participationStatus: 'ACTIVE_MEMBER', invitedById: 'u-x', artist: { id: 'a-1', name: 'Группа', avatar: null, status: 'VERIFIED' } },
      { id: 'ua-2', userId: id, inviteStatus: 'PENDING', isOwner: false, isAdmin: false, participationStatus: 'ACTIVE_MEMBER', artist: { id: 'a-2', name: 'Ожидание', avatar: null, status: 'VERIFIED' } },
      { id: 'ua-3', userId: id, inviteStatus: 'ACCEPTED', isOwner: false, isAdmin: false, participationStatus: 'ACTIVE_MEMBER', artist: { id: 'a-3', name: 'Отклонён', avatar: null, status: 'REJECTED' } },
    ],
    channel: { id: 'ch-1', ownerId: id, name: 'Канал', description: 'пишите @ivan_channel', avatar: null, _count: { subscriptions: 1, posts: 2 } },
    portfolioFiles: [{ id: 'pf-1', userId: id, url: '/uploads/portfolio/x.mp3', originalName: 'x.mp3', title: null, size: 10, mimeType: 'audio/mpeg', sortOrder: 0, createdAt: NOW }],
    portfolioLinks: [{ id: 'pl-1', userId: id, type: 'audio', url: 'https://music.yandex.ru/album/1', title: '', createdAt: NOW }],
    _count: { posts: 5, sentRequests: 3, receivedRequests: 4, referrals: 2 },
  };
}
