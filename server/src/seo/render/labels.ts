/** Русские подписи значений справочников — те же, что на клиенте. */

export const ARTIST_TYPE_LABELS: Record<string, string> = {
  SOLO: 'Сольный артист',
  DUET: 'Дуэт',
  GROUP: 'Группа',
  COVER_GROUP: 'Кавер-группа',
  TRIBUTE: 'Трибьют',
  CHOIR: 'Хор',
  ENSEMBLE: 'Ансамбль',
  ORCHESTRA: 'Оркестр',
};

export const ARTIST_ACTIVITY_LABELS: Record<string, string> = {
  ACTIVE: 'Действующий',
  INACTIVE: 'Неактивный',
  ARCHIVED: 'Архивный',
  DISBANDED: 'Распался',
};

export const RELEASE_TYPE_LABELS: Record<string, string> = {
  single: 'Сингл',
  album: 'Альбом',
  ep: 'EP',
  compilation: 'Сборник',
  podcast: 'Подкаст',
  audiobook: 'Аудиокнига',
};

export const MEDIA_PLATFORM_LABELS: Record<string, string> = {
  VK: 'ВКонтакте',
  SPOTIFY: 'Spotify',
  YANDEX_MUSIC: 'Яндекс Музыка',
  APPLE_MUSIC: 'Apple Music',
  VK_VIDEO: 'ВКонтакте Видео',
  RUTUBE: 'Rutube',
  YOUTUBE: 'YouTube',
};

export const WORK_FORMAT_LABELS: Record<string, string> = { online: 'Онлайн', offline: 'Офлайн', hybrid: 'Гибрид' };
export const GEOGRAPHY_LABELS: Record<string, string> = {
  city: 'В своём городе',
  region: 'В своём регионе',
  country: 'По всей стране',
  international: 'Международная занятость',
};
export const EMPLOYMENT_LABELS: Record<string, string> = {
  permanent: 'Постоянная',
  partial: 'Частичная (совмещение)',
  project: 'Проектная',
  intern: 'Стажёр',
  volunteer: 'Волонтёр',
};
export const PAYMENT_LABELS: Record<string, string> = { free: 'Бесплатно', barter: 'Бартер', percent: 'Процент', rate: 'Ставка' };

export const OCCUPANCY_LABELS: Record<string, string> = {
  open: 'Открыт для работы',
  considering: 'Рассматриваю предложения',
  closed: 'Не ищу работу',
};

export const ORDER_STATUS_LABELS: Record<string, string> = { active: 'Открыт', done: 'Выполнен', archived: 'В архиве' };
export const VACANCY_STATUS_LABELS: Record<string, string> = { active: 'Открыта', archived: 'В архиве' };

export function label(map: Record<string, string>, value: unknown): string | null {
  if (value == null || value === '') return null;
  return map[String(value)] ?? null;
}

/** «N участник/участника/участников». */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/** Дата по-русски: «9 октября 2026». */
export function ruDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
}
