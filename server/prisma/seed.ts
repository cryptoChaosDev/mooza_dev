import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding reference data...');

  // ============ Fields of Activity ============
  const fieldNames = [
    'Музыкант-исполнитель',
    'Музыкальное производство',
    'Звукорежиссура',
    'Музыкальный менеджмент',
    'Образование и преподавание',
  ];

  const fields: Record<string, any> = {};
  for (const name of fieldNames) {
    fields[name] = await prisma.fieldOfActivity.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Created ${Object.keys(fields).length} fields of activity`);

  // ============ Professions ============
  // БЛОК 1 — МУЗЫКАНТЫ-ИСПОЛНИТЕЛИ
  const professionData: { name: string; field: string }[] = [
    { name: 'Вокалист', field: 'Музыкант-исполнитель' },
    { name: 'Гитарист', field: 'Музыкант-исполнитель' },
    { name: 'Басист', field: 'Музыкант-исполнитель' },
    { name: 'Ударник', field: 'Музыкант-исполнитель' },
    { name: 'Клавишник', field: 'Музыкант-исполнитель' },
    { name: 'Скрипач', field: 'Музыкант-исполнитель' },
    { name: 'Виолончелист', field: 'Музыкант-исполнитель' },
    { name: 'Духовик', field: 'Музыкант-исполнитель' },
    { name: 'Перкуссионист', field: 'Музыкант-исполнитель' },
    { name: 'Диджей', field: 'Музыкант-исполнитель' },
    { name: 'Аккордеонист', field: 'Музыкант-исполнитель' },
    { name: 'Арфист', field: 'Музыкант-исполнитель' },
    { name: 'Пианист', field: 'Музыкант-исполнитель' },
    // Музыкальное производство
    { name: 'Продюсер', field: 'Музыкальное производство' },
    { name: 'Битмейкер', field: 'Музыкальное производство' },
    { name: 'Аранжировщик', field: 'Музыкальное производство' },
    { name: 'Композитор', field: 'Музыкальное производство' },
    { name: 'Саунд-дизайнер', field: 'Музыкальное производство' },
    // Звукорежиссура
    { name: 'Звукорежиссёр', field: 'Звукорежиссура' },
    { name: 'Мастеринг-инженер', field: 'Звукорежиссура' },
    { name: 'Микс-инженер', field: 'Звукорежиссура' },
    { name: 'Звукооператор', field: 'Звукорежиссура' },
    { name: 'Инженер записи', field: 'Звукорежиссура' },
    // Музыкальный менеджмент
    { name: 'Музыкальный менеджер', field: 'Музыкальный менеджмент' },
    { name: 'Концертный директор', field: 'Музыкальный менеджмент' },
    { name: 'Букинг-агент', field: 'Музыкальный менеджмент' },
    { name: 'PR-менеджер', field: 'Музыкальный менеджмент' },
    { name: 'A&R менеджер', field: 'Музыкальный менеджмент' },
    // Образование и преподавание
    { name: 'Преподаватель вокала', field: 'Образование и преподавание' },
    { name: 'Преподаватель гитары', field: 'Образование и преподавание' },
    { name: 'Преподаватель фортепиано', field: 'Образование и преподавание' },
    { name: 'Музыкальный теоретик', field: 'Образование и преподавание' },
    { name: 'Репетитор по сольфеджио', field: 'Образование и преподавание' },
  ];

  const professions: Record<string, any> = {};
  for (const p of professionData) {
    const prof = await prisma.profession.upsert({
      where: {
        name_fieldOfActivityId: {
          name: p.name,
          fieldOfActivityId: fields[p.field].id,
        },
      },
      update: {},
      create: {
        name: p.name,
        fieldOfActivityId: fields[p.field].id,
      },
    });
    professions[p.name] = prof;
  }
  console.log(`Created ${Object.keys(professions).length} professions`);

  // ============ Services per Profession ============
  // Services for БЛОК 1 — МУЗЫКАНТЫ-ИСПОЛНИТЕЛИ
  const serviceData: { name: string; nameEn: string; professions: string[]; sortOrder: number }[] = [
    {
      name: 'Живое выступление',
      nameEn: 'Live Performance',
      professions: ['Вокалист', 'Гитарист', 'Басист', 'Ударник', 'Клавишник', 'Скрипач', 'Виолончелист', 'Духовик', 'Перкуссионист', 'Диджей', 'Аккордеонист', 'Арфист', 'Пианист'],
      sortOrder: 0,
    },
    {
      name: 'Сессионная работа',
      nameEn: 'Session Work',
      professions: ['Вокалист', 'Гитарист', 'Басист', 'Ударник', 'Клавишник', 'Скрипач', 'Виолончелист', 'Духовик', 'Перкуссионист', 'Аккордеонист', 'Арфист', 'Пианист'],
      sortOrder: 1,
    },
    {
      name: 'Студийная запись',
      nameEn: 'Studio Recording',
      professions: ['Вокалист', 'Гитарист', 'Басист', 'Ударник', 'Клавишник', 'Скрипач', 'Виолончелист', 'Духовик', 'Перкуссионист', 'Аккордеонист', 'Арфист', 'Пианист'],
      sortOrder: 2,
    },
    {
      name: 'Запись вокала',
      nameEn: 'Vocal Recording',
      professions: ['Вокалист'],
      sortOrder: 3,
    },
    {
      name: 'Бэк-вокал',
      nameEn: 'Backing Vocals',
      professions: ['Вокалист'],
      sortOrder: 4,
    },
    {
      name: 'Озвучка / Джингл',
      nameEn: 'Voiceover / Jingle',
      professions: ['Вокалист'],
      sortOrder: 5,
    },
    {
      name: 'DJ-сет',
      nameEn: 'DJ Set',
      professions: ['Диджей'],
      sortOrder: 6,
    },
    {
      name: 'Продюсирование',
      nameEn: 'Music Production',
      professions: ['Продюсер', 'Битмейкер'],
      sortOrder: 7,
    },
    {
      name: 'Создание битов',
      nameEn: 'Beat Making',
      professions: ['Битмейкер'],
      sortOrder: 8,
    },
    {
      name: 'Аранжировка',
      nameEn: 'Arranging',
      professions: ['Аранжировщик', 'Композитор'],
      sortOrder: 9,
    },
    {
      name: 'Композиция',
      nameEn: 'Composition',
      professions: ['Композитор'],
      sortOrder: 10,
    },
    {
      name: 'Саунд-дизайн',
      nameEn: 'Sound Design',
      professions: ['Саунд-дизайнер'],
      sortOrder: 11,
    },
    {
      name: 'Микширование',
      nameEn: 'Mixing',
      professions: ['Звукорежиссёр', 'Микс-инженер'],
      sortOrder: 12,
    },
    {
      name: 'Мастеринг',
      nameEn: 'Mastering',
      professions: ['Мастеринг-инженер'],
      sortOrder: 13,
    },
    {
      name: 'Звукорежиссура мероприятий',
      nameEn: 'Event Sound Engineering',
      professions: ['Звукорежиссёр', 'Звукооператор'],
      sortOrder: 14,
    },
    {
      name: 'Запись в студии',
      nameEn: 'Studio Session',
      professions: ['Инженер записи'],
      sortOrder: 15,
    },
    {
      name: 'Аудио монтаж',
      nameEn: 'Audio Editing',
      professions: ['Звукорежиссёр', 'Инженер записи'],
      sortOrder: 16,
    },
    {
      name: 'Обучение вокалу',
      nameEn: 'Vocal Lessons',
      professions: ['Преподаватель вокала'],
      sortOrder: 17,
    },
    {
      name: 'Обучение игре на гитаре',
      nameEn: 'Guitar Lessons',
      professions: ['Преподаватель гитары'],
      sortOrder: 18,
    },
    {
      name: 'Обучение игре на фортепиано',
      nameEn: 'Piano Lessons',
      professions: ['Преподаватель фортепиано'],
      sortOrder: 19,
    },
    {
      name: 'Теория музыки',
      nameEn: 'Music Theory',
      professions: ['Музыкальный теоретик', 'Репетитор по сольфеджио'],
      sortOrder: 20,
    },
    {
      name: 'Менеджмент артиста',
      nameEn: 'Artist Management',
      professions: ['Музыкальный менеджер'],
      sortOrder: 21,
    },
    {
      name: 'Организация концертов',
      nameEn: 'Concert Organization',
      professions: ['Концертный директор', 'Букинг-агент'],
      sortOrder: 22,
    },
    {
      name: 'PR и продвижение',
      nameEn: 'PR & Promotion',
      professions: ['PR-менеджер'],
      sortOrder: 23,
    },
    {
      name: 'Работа с артистами (A&R)',
      nameEn: 'A&R',
      professions: ['A&R менеджер'],
      sortOrder: 24,
    },
  ];

  for (const s of serviceData) {
    // Use the first profession as the primary one (for the FK)
    const primaryProfession = professions[s.professions[0]];
    if (!primaryProfession) continue;

    await prisma.service.upsert({
      where: { name: s.name },
      update: { sortOrder: s.sortOrder },
      create: {
        name: s.name,
        nameEn: s.nameEn,
        professionId: primaryProfession.id,
        sortOrder: s.sortOrder,
      },
    });
  }
  console.log(`Created ${serviceData.length} services`);

  // ============ Genres ============
  const genreData: { name: string; nameEn: string; sortOrder: number }[] = [
    { name: 'Поп', nameEn: 'Pop', sortOrder: 0 },
    { name: 'Рок', nameEn: 'Rock', sortOrder: 1 },
    { name: 'Хип-хоп / Рэп', nameEn: 'Hip-Hop / Rap', sortOrder: 2 },
    { name: 'Электроника', nameEn: 'Electronic', sortOrder: 3 },
    { name: 'Джаз', nameEn: 'Jazz', sortOrder: 4 },
    { name: 'Классика', nameEn: 'Classical', sortOrder: 5 },
    { name: 'R&B / Soul', nameEn: 'R&B / Soul', sortOrder: 6 },
    { name: 'Метал', nameEn: 'Metal', sortOrder: 7 },
    { name: 'Инди', nameEn: 'Indie', sortOrder: 8 },
    { name: 'Альтернатива', nameEn: 'Alternative', sortOrder: 9 },
    { name: 'Фолк', nameEn: 'Folk', sortOrder: 10 },
    { name: 'Блюз', nameEn: 'Blues', sortOrder: 11 },
    { name: 'Регги', nameEn: 'Reggae', sortOrder: 12 },
    { name: 'Латинская музыка', nameEn: 'Latin', sortOrder: 13 },
    { name: 'Эмбиент', nameEn: 'Ambient', sortOrder: 14 },
    { name: 'Оркестровая', nameEn: 'Orchestral', sortOrder: 15 },
    { name: 'Кантри', nameEn: 'Country', sortOrder: 16 },
    { name: 'Фанк', nameEn: 'Funk', sortOrder: 17 },
    { name: 'Поп-рок', nameEn: 'Pop-Rock', sortOrder: 18 },
    { name: 'Диско', nameEn: 'Disco', sortOrder: 19 },
    { name: 'Хаус', nameEn: 'House', sortOrder: 20 },
    { name: 'Техно', nameEn: 'Techno', sortOrder: 21 },
    { name: 'Дабстеп', nameEn: 'Dubstep', sortOrder: 22 },
    { name: 'Трэп', nameEn: 'Trap', sortOrder: 23 },
    { name: 'Шансон', nameEn: 'Chanson', sortOrder: 24 },
    { name: 'Детская музыка', nameEn: 'Children', sortOrder: 25 },
  ];

  for (const g of genreData) {
    await prisma.genre.upsert({
      where: { name: g.name },
      update: { sortOrder: g.sortOrder },
      create: { name: g.name, nameEn: g.nameEn, sortOrder: g.sortOrder },
    });
  }
  console.log(`Created ${genreData.length} genres`);

  // ============ Work Formats ============
  const workFormatData: { name: string; nameEn: string; sortOrder: number }[] = [
    { name: 'Онлайн / Удалённо', nameEn: 'Online / Remote', sortOrder: 0 },
    { name: 'На площадке', nameEn: 'On-site', sortOrder: 1 },
    { name: 'В студии', nameEn: 'In studio', sortOrder: 2 },
    { name: 'На живом мероприятии', nameEn: 'Live event', sortOrder: 3 },
    { name: 'Гибридный формат', nameEn: 'Hybrid', sortOrder: 4 },
  ];

  for (const w of workFormatData) {
    await prisma.workFormat.upsert({
      where: { name: w.name },
      update: { sortOrder: w.sortOrder },
      create: { name: w.name, nameEn: w.nameEn, sortOrder: w.sortOrder },
    });
  }
  console.log(`Created ${workFormatData.length} work formats`);

  // ============ Employment Types ============
  const employmentTypeData: { name: string; nameEn: string; sortOrder: number }[] = [
    { name: 'Разовый проект', nameEn: 'One-time project', sortOrder: 0 },
    { name: 'Фриланс', nameEn: 'Freelance', sortOrder: 1 },
    { name: 'Частичная занятость', nameEn: 'Part-time', sortOrder: 2 },
    { name: 'Полная занятость', nameEn: 'Full-time', sortOrder: 3 },
    { name: 'Штатный сотрудник', nameEn: 'Staff', sortOrder: 4 },
  ];

  for (const e of employmentTypeData) {
    await prisma.employmentType.upsert({
      where: { name: e.name },
      update: { sortOrder: e.sortOrder },
      create: { name: e.name, nameEn: e.nameEn, sortOrder: e.sortOrder },
    });
  }
  console.log(`Created ${employmentTypeData.length} employment types`);

  // ============ Skill Levels ============
  const skillLevelData: { name: string; nameEn: string; sortOrder: number }[] = [
    { name: 'Начинающий', nameEn: 'Beginner', sortOrder: 0 },
    { name: 'Любитель', nameEn: 'Amateur', sortOrder: 1 },
    { name: 'Полупрофессионал', nameEn: 'Semi-professional', sortOrder: 2 },
    { name: 'Профессионал', nameEn: 'Professional', sortOrder: 3 },
  ];

  for (const s of skillLevelData) {
    await prisma.skillLevel.upsert({
      where: { name: s.name },
      update: { sortOrder: s.sortOrder },
      create: { name: s.name, nameEn: s.nameEn, sortOrder: s.sortOrder },
    });
  }
  console.log(`Created ${skillLevelData.length} skill levels`);

  // ============ Availabilities ============
  const availabilityData: { name: string; nameEn: string; sortOrder: number }[] = [
    { name: 'Готов к работе сейчас', nameEn: 'Available now', sortOrder: 0 },
    { name: 'В течение недели', nameEn: 'Within 1 week', sortOrder: 1 },
    { name: 'В течение месяца', nameEn: 'Within 1 month', sortOrder: 2 },
    { name: 'По договорённости', nameEn: 'By arrangement', sortOrder: 3 },
  ];

  for (const a of availabilityData) {
    await prisma.availability.upsert({
      where: { name: a.name },
      update: { sortOrder: a.sortOrder },
      create: { name: a.name, nameEn: a.nameEn, sortOrder: a.sortOrder },
    });
  }
  console.log(`Created ${availabilityData.length} availabilities`);

  // ============ Price Ranges ============
  const priceRangeData: { name: string; nameEn: string; minValue: number | null; maxValue: number | null; sortOrder: number }[] = [
    { name: 'До 5 000 ₽', nameEn: 'Up to 5,000 ₽', minValue: null, maxValue: 5000, sortOrder: 0 },
    { name: '5 000 – 15 000 ₽', nameEn: '5,000 – 15,000 ₽', minValue: 5000, maxValue: 15000, sortOrder: 1 },
    { name: '15 000 – 30 000 ₽', nameEn: '15,000 – 30,000 ₽', minValue: 15000, maxValue: 30000, sortOrder: 2 },
    { name: '30 000 – 60 000 ₽', nameEn: '30,000 – 60,000 ₽', minValue: 30000, maxValue: 60000, sortOrder: 3 },
    { name: 'От 60 000 ₽', nameEn: 'From 60,000 ₽', minValue: 60000, maxValue: null, sortOrder: 4 },
    { name: 'По договорённости', nameEn: 'By arrangement', minValue: null, maxValue: null, sortOrder: 5 },
  ];

  for (const p of priceRangeData) {
    await prisma.priceRange.upsert({
      where: { name: p.name },
      update: { sortOrder: p.sortOrder },
      create: {
        name: p.name,
        nameEn: p.nameEn,
        minValue: p.minValue,
        maxValue: p.maxValue,
        sortOrder: p.sortOrder,
      },
    });
  }
  console.log(`Created ${priceRangeData.length} price ranges`);

  // ============ Geographies ============
  const geographyData: { name: string; nameEn: string; sortOrder: number }[] = [
    { name: 'Вся Россия', nameEn: 'All Russia', sortOrder: 0 },
    { name: 'Онлайн', nameEn: 'Online', sortOrder: 1 },
    { name: 'Москва', nameEn: 'Moscow', sortOrder: 2 },
    { name: 'Санкт-Петербург', nameEn: 'Saint Petersburg', sortOrder: 3 },
    { name: 'Екатеринбург', nameEn: 'Yekaterinburg', sortOrder: 4 },
    { name: 'Новосибирск', nameEn: 'Novosibirsk', sortOrder: 5 },
    { name: 'Казань', nameEn: 'Kazan', sortOrder: 6 },
    { name: 'Краснодар', nameEn: 'Krasnodar', sortOrder: 7 },
    { name: 'Нижний Новгород', nameEn: 'Nizhny Novgorod', sortOrder: 8 },
    { name: 'Ростов-на-Дону', nameEn: 'Rostov-on-Don', sortOrder: 9 },
    { name: 'Уфа', nameEn: 'Ufa', sortOrder: 10 },
    { name: 'Самара', nameEn: 'Samara', sortOrder: 11 },
    { name: 'Волгоград', nameEn: 'Volgograd', sortOrder: 12 },
    { name: 'Воронеж', nameEn: 'Voronezh', sortOrder: 13 },
    { name: 'Пермь', nameEn: 'Perm', sortOrder: 14 },
    { name: 'Другой город', nameEn: 'Other city', sortOrder: 15 },
  ];

  for (const g of geographyData) {
    await prisma.geography.upsert({
      where: { name: g.name },
      update: { sortOrder: g.sortOrder },
      create: { name: g.name, nameEn: g.nameEn, sortOrder: g.sortOrder },
    });
  }
  console.log(`Created ${geographyData.length} geographies`);

  // ============ Profession Features ============
  const featureNames = [
    'Начинающий',
    'Средний уровень',
    'Профессионал',
    'Работаю платно',
    'Работаю бесплатно',
  ];

  for (const name of featureNames) {
    await prisma.professionFeature.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Created ${featureNames.length} profession features`);

  // ============ Artists ============
  const artistNames = ['Сплин', 'Земфира', 'Мумий Тролль', 'Би-2', 'Noize MC'];
  for (const name of artistNames) {
    await prisma.artist.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Created ${artistNames.length} artists`);

  // ============ Employers ============
  const employerData = [
    { name: 'Universal Music Russia', inn: '7707083893', ogrn: '1027700132195' },
    { name: 'Sony Music Entertainment', inn: '7714456789', ogrn: '1037714067890' },
    { name: 'Warner Music Russia', inn: '7725123456', ogrn: '1047725012345' },
    { name: 'Gazgolder', inn: '7701987654', ogrn: '1057701098765' },
    { name: 'Black Star', inn: '7709876543', ogrn: '1067709087654' },
  ];

  for (const e of employerData) {
    await prisma.employer.upsert({
      where: { inn: e.inn },
      update: {},
      create: e,
    });
  }
  console.log(`Created ${employerData.length} employers`);

  console.log('\nSeeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
