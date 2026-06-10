// App version shown in the info sheet + sidebar, and the user-facing changelog
// behind it. Bump APP_VERSION and prepend a new entry on each release.

export const APP_VERSION = '2.1';

export interface ChangelogEntry {
  version: string;
  date: string;
  added?: string[];
  changed?: string[];
  removed?: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.1',
    date: 'Июнь 2026',
    added: [
      'Редактор постов: жирный, курсив, списки, цитаты и ссылки — оформляй посты красиво',
      '@-упоминания и вставка картинок прямо из буфера (Ctrl+V)',
      'Умная лента «Для вас» — показываем интересное и свежее, а не только самое новое',
      'Сортировка ленты: Новые · Популярные · Обсуждаемые',
      'Ссылки в постах теперь кликабельны',
      'Портфолио: плеер для аудио, иконки по типу документа, удобная сетка фото',
      'Кольцо заполнения профиля вокруг аватара',
      'Pro: видна дата окончания подписки',
      'Понятные сообщения об ошибках вместо «молчаливых» сбоев',
    ],
    changed: [
      'Вкладка каталога «Каталог» переименована в «Услуги»',
      'Имя и фамилию больше нельзя оставить пустыми',
      'Лимит на фото и документы в портфолио — 10 МБ (аудио — больше)',
    ],
  },
];
