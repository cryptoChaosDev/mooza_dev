import { INTEREST_CATEGORIES } from "./categories";
import { Post, UserProfile } from "./types";

// Получение пользователя из Telegram WebApp API (заглушка)
export function getTelegramUser(): Partial<UserProfile> {
  // @ts-ignore
  const tg = window.Telegram?.WebApp;
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    const user = tg.initDataUnsafe.user;
    return {
      name: user.first_name + (user.last_name ? ` ${user.last_name}` : ""),
      avatarUrl: user.photo_url,
    };
  }
  return {};
}

// Вспомогательная функция для поиска категории и подкатегории по тегу
export function getInterestPath(tag: string) {
  for (const cat of INTEREST_CATEGORIES) {
    for (const sub of cat.subcategories) {
      if (sub.tags.includes(tag)) {
        return `${cat.category} - ${sub.name} - ${tag}`;
      }
    }
  }
  return tag;
}

// Функция форматирования даты поста с относительным временем
export function formatPostDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const time = `${hours}:${minutes}`;
  
  // Если меньше 1 минуты назад
  if (diffMinutes < 1) return 'только что';
  
  // Если меньше часа назад
  if (diffMinutes < 60) {
    if (diffMinutes === 1) return '1 минуту назад';
    if (diffMinutes < 5) return `${diffMinutes} минуты назад`;
    return `${diffMinutes} минут назад`;
  }
  
  // Если меньше суток назад
  if (diffHours < 24) {
    if (diffHours === 1) return '1 час назад';
    if (diffHours < 5) return `${diffHours} часа назад`;
    return `${diffHours} часов назад`;
  }
  
  // Проверяем, сегодня ли это
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return `сегодня в ${time}`;
  
  // Проверяем, вчера ли это
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isYesterday) return `вчера в ${time}`;
  
  // Если меньше недели назад
  if (diffDays < 7) {
    if (diffDays === 1) return '1 день назад';
    return `${diffDays} дня назад`;
  }
  
  // Если меньше месяца назад
  if (diffWeeks < 4) {
    if (diffWeeks === 1) return '1 неделю назад';
    return `${diffWeeks} недели назад`;
  }
  
  // Если меньше года назад
  if (diffMonths < 12) {
    if (diffMonths === 1) return '1 месяц назад';
    if (diffMonths < 5) return `${diffMonths} месяца назад`;
    return `${diffMonths} месяцев назад`;
  }
  
  // Для старых постов показываем дату
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// --- Генерация моковых пользователей ---
const MOCK_WORKPLACES = [
  "Mooza Studio", "SoundLab", "MusicHub", "JamSpace", "BeatFactory", "GrooveRoom", "HarmonyWorks", "StudioX", "LiveSound", "CreativeLab"
];
const MOCK_PORTFOLIO_FILES = [
  undefined,
  "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
  "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"
];
const MOCK_NAMES = [
  "Алексей Иванов", "Мария Петрова", "Денис Смирнов", "Ольга Сидорова", "Иван Кузнецов", "Екатерина Орлова", "Павел Волков", "Светлана Морозова", "Дмитрий Фёдоров", "Анна Васильева", "Владимир Попов", "Елена Соколова", "Сергей Лебедев", "Татьяна Козлова", "Артём Новиков", "Наталья Павлова", "Игорь Михайлов", "Юлия Романова", "Максим Захаров", "Виктория Баранова", "Григорий Киселёв", "Алиса Громова", "Валерий Соловьёв", "Полина Белова", "Роман Гаврилов", "Вера Корнилова", "Евгений Ефимов", "Дарья Крылова", "Никита Соловьёв", "Кристина Кузьмина", "Василиса Котова", "Михаил Грачёв", "Анастасия Климова", "Виталий Кузьмин", "Маргарита Ковалева", "Глеб Сидоров", "Лидия Киселёва", "Андрей Козлов", "София Фролова", "Вячеслав Белов", "Елизавета Громова", "Аркадий Орлов", "Диана Кузнецова", "Пётр Соловьёв", "Алёна Морозова", "Владислав Фёдоров", "Оксана Лебедева", "Даниил Попов", "Евгения Павлова", "Станислав Иванов"
];
const MOCK_BIOS = [
  "Люблю музыку и новые знакомства!", "Ищу единомышленников для совместных проектов.", "Пишу песни и играю на гитаре.", "Открыт для коллабораций.", "Музыка — моя жизнь.", "Экспериментирую с жанрами.", "Готов к новым музыкальным открытиям!", "Ищу группу для выступлений.", "Обожаю живые концерты.", "Пишу аранжировки и свожу треки."
];
const MOCK_CITIES = [
  "Москва", "Санкт-Петербург", "Казань", "Екатеринбург", "Новосибирск", "Самара", "Воронеж", "Краснодар", "Уфа", "Пермь", "Ростов-на-Дону", "Челябинск", "Нижний Новгород", "Омск", "Волгоград", "Томск", "Тула", "Калуга", "Сочи", "Ярославль"
];

function getRandomFromArray<T>(arr: T[], count: number) {
  const shuffled = arr.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function getRandomInterests() {
  const allTags = INTEREST_CATEGORIES.flatMap(cat => cat.subcategories.flatMap(sub => sub.tags));
  return getRandomFromArray(allTags, 3 + Math.floor(Math.random() * 4)); // 3-6 интересов
}

function getRandomAvatar(name: string) {
  // Используем https://ui-avatars.com/ для генерации аватарок
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`;
}

const MOCK_SOCIALS = [
  (name: string) => `https://vk.com/${name.replace(/\s/g, '').toLowerCase()}`,
  (name: string) => `https://t.me/${name.split(' ')[0].toLowerCase()}`,
  (name: string) => `https://instagram.com/${name.replace(/\s/g, '').toLowerCase()}`,
  (name: string) => `https://youtube.com/@${name.replace(/\s/g, '').toLowerCase()}`,
  (name: string) => `https://soundcloud.com/${name.replace(/\s/g, '').toLowerCase()}`,
  (name: string) => `https://bandcamp.com/${name.replace(/\s/g, '').toLowerCase()}`,
  (name: string) => `https://mysite.com/${name.replace(/\s/g, '').toLowerCase()}`
];

function getRandomSocials(name: string) {
  const count = 1 + Math.floor(Math.random() * 3);
  const shuffled = MOCK_SOCIALS.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).map(fn => fn(name));
}

export const MOCK_USERS: UserProfile[] = Array.from({ length: 100 }).map((_, i) => {
  const name = MOCK_NAMES[i % MOCK_NAMES.length] + (i >= MOCK_NAMES.length ? ` #${i+1}` : "");
  const [firstName, ...lastNameArr] = name.split(" ");
  const lastName = lastNameArr.join(" ") || "";
  const city = getRandomFromArray(MOCK_CITIES, 1)[0];
  const country = "Россия";
  const workPlace = getRandomFromArray(MOCK_WORKPLACES, 1)[0];
  const skills = getRandomInterests();
  const interests = getRandomInterests();
  const bio = getRandomFromArray(MOCK_BIOS, 1)[0] + (Math.random() > 0.5 ? "\nЛюбимый город: " + city : "");
  const phone = `+7 (9${Math.floor(10 + Math.random()*89)}) ${Math.floor(100+Math.random()*900)}-${Math.floor(10+Math.random()*90)}-${Math.floor(10+Math.random()*90)}`;
  const email = `user${i+1}@mooza.ru`;
  const portfolioText = `Портфолио пользователя ${name}. Достижения, проекты, ссылки.`;
  const fileUrl = getRandomFromArray(MOCK_PORTFOLIO_FILES, 1)[0];
  return {
    userId: `user_${i+1}_${Math.random().toString(36).slice(2, 10)}`,
    firstName,
    lastName,
    name,
    bio,
    workPlace,
    skills,
    interests,
    portfolio: { text: portfolioText, fileUrl },
    phone,
    email,
    avatarUrl: getRandomAvatar(name),
    city,
    country,
    socials: getRandomSocials(name),
  };
});

// --- Моковые посты ---
export const MOCK_POSTS: Post[] = [
  ...Array.from({ length: 30 }).map((_, i) => {
    const user = MOCK_USERS[i % MOCK_USERS.length];
    const texts = [
      "Ищу музыкантов для совместных репетиций!",
      "Записываю каверы, ищу вокалиста!",
      "Давайте соберёмся на квартирник!",
      "В пятницу джемим блюз в баре! Присоединяйтесь!",
      "Ищу басиста для новой группы.",
      "Готовлю новый альбом, ищу саунд-продюсера.",
      "Кто хочет поиграть джаз на выходных?",
      "Нужен барабанщик для live-сета.",
      "Пишу электронную музыку, ищу вокал.",
      "Давайте устроим jam-session в парке!",
      "Ищу единомышленников для записи EP.",
      "Кто хочет снять клип на песню?",
      "Ищу клавишника для кавер-группы.",
      "Готовлюсь к концерту, ищу подтанцовку!",
      "Нужен совет по сведению трека.",
      "Кто хочет вместе поэкспериментировать с жанрами?",
      "Ищу группу для выступлений на фестивале.",
      "Пишу аранжировки, ищу вокалистку.",
      "Давайте обменяемся демками!",
      "Кто хочет записать совместный трек?",
    ];
    return {
      id: i + 1,
      userId: user.userId,
      author: user.name,
      avatarUrl: user.avatarUrl,
      content: texts[i % texts.length],
      tags: user.interests.slice(0, 3),
      liked: false,
      favorite: false,
      createdAt: new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 30).toISOString(),
      updatedAt: new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 30).toISOString(),
    };
  })
];