// Слаги жанров Яндекс.Музыки → русские названия (для бейджей релизов).
// Неизвестный слаг показываем как есть.
export const YM_GENRE_LABELS: Record<string, string> = {
  rusrock: 'Русский рок',
  rock: 'Рок',
  indie: 'Инди',
  alternative: 'Альтернатива',
  punk: 'Панк',
  metal: 'Метал',
  progmetal: 'Прогрессив-метал',
  numetal: 'Ню-метал',
  folkmetal: 'Фолк-метал',
  hardrock: 'Хард-рок',
  postrock: 'Пост-рок',
  rusrap: 'Русский рэп',
  rap: 'Рэп и хип-хоп',
  ruspop: 'Русская поп-музыка',
  pop: 'Поп',
  electronic: 'Электроника',
  dance: 'Танцевальная',
  house: 'Хаус',
  techno: 'Техно',
  dnb: 'Drum & Bass',
  jazz: 'Джаз',
  blues: 'Блюз',
  folk: 'Фолк',
  rusfolk: 'Русский фолк',
  classical: 'Классика',
  soundtrack: 'Саундтреки',
  rnb: 'R&B',
  soul: 'Соул',
  funk: 'Фанк',
  reggae: 'Регги',
  ska: 'Ска',
  country: 'Кантри',
  shanson: 'Шансон',
  romances: 'Романсы',
  bard: 'Бардовская песня',
  local_indie: 'Локальное инди',
};

export function ymGenreLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return YM_GENRE_LABELS[slug] ?? slug;
}

// Тип релиза ЯМ → русский бейдж.
export const RELEASE_TYPE_LABELS: Record<string, string> = {
  single: 'Сингл',
  album: 'Альбом',
  ep: 'EP',
  compilation: 'Сборник',
  podcast: 'Подкаст',
  audiobook: 'Аудиокнига',
};
