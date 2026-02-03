import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding reference data...');

  // ============ Fields of Activity ============
  const fields = await Promise.all([
    prisma.fieldOfActivity.upsert({
      where: { name: 'Музыкальное производство' },
      update: {},
      create: { name: 'Музыкальное производство' },
    }),
    prisma.fieldOfActivity.upsert({
      where: { name: 'Исполнительское искусство' },
      update: {},
      create: { name: 'Исполнительское искусство' },
    }),
    prisma.fieldOfActivity.upsert({
      where: { name: 'Звукорежиссура' },
      update: {},
      create: { name: 'Звукорежиссура' },
    }),
    prisma.fieldOfActivity.upsert({
      where: { name: 'Музыкальный менеджмент' },
      update: {},
      create: { name: 'Музыкальный менеджмент' },
    }),
    prisma.fieldOfActivity.upsert({
      where: { name: 'Образование и преподавание' },
      update: {},
      create: { name: 'Образование и преподавание' },
    }),
  ]);

  console.log(`Created ${fields.length} fields of activity`);

  // ============ Professions per Field ============
  const professionData: { name: string; fieldIndex: number }[] = [
    // Музыкальное производство (index 0)
    { name: 'Продюсер', fieldIndex: 0 },
    { name: 'Битмейкер', fieldIndex: 0 },
    { name: 'Аранжировщик', fieldIndex: 0 },
    { name: 'Композитор', fieldIndex: 0 },
    { name: 'Саунд-дизайнер', fieldIndex: 0 },
    // Исполнительское искусство (index 1)
    { name: 'Вокалист', fieldIndex: 1 },
    { name: 'Гитарист', fieldIndex: 1 },
    { name: 'Барабанщик', fieldIndex: 1 },
    { name: 'Клавишник', fieldIndex: 1 },
    { name: 'Диджей', fieldIndex: 1 },
    // Звукорежиссура (index 2)
    { name: 'Звукорежиссёр', fieldIndex: 2 },
    { name: 'Мастеринг-инженер', fieldIndex: 2 },
    { name: 'Микс-инженер', fieldIndex: 2 },
    { name: 'Звукооператор', fieldIndex: 2 },
    { name: 'Инженер записи', fieldIndex: 2 },
    // Музыкальный менеджмент (index 3)
    { name: 'Музыкальный менеджер', fieldIndex: 3 },
    { name: 'Концертный директор', fieldIndex: 3 },
    { name: 'Букинг-агент', fieldIndex: 3 },
    { name: 'PR-менеджер', fieldIndex: 3 },
    { name: 'A&R менеджер', fieldIndex: 3 },
    // Образование и преподавание (index 4)
    { name: 'Преподаватель вокала', fieldIndex: 4 },
    { name: 'Преподаватель гитары', fieldIndex: 4 },
    { name: 'Преподаватель фортепиано', fieldIndex: 4 },
    { name: 'Музыкальный теоретик', fieldIndex: 4 },
    { name: 'Репетитор по сольфеджио', fieldIndex: 4 },
  ];

  const professions: any[] = [];
  for (const p of professionData) {
    const profession = await prisma.profession.upsert({
      where: {
        name_fieldOfActivityId: {
          name: p.name,
          fieldOfActivityId: fields[p.fieldIndex].id,
        },
      },
      update: {},
      create: {
        name: p.name,
        fieldOfActivityId: fields[p.fieldIndex].id,
      },
    });
    professions.push(profession);
  }

  console.log(`Created ${professions.length} professions`);

  // ============ Services per Profession ============
  const serviceData: { name: string; nameEn: string; professionIndices: number[] }[] = [
    // Production services
    { name: 'Сессионная работа', nameEn: 'Session Work', professionIndices: [0, 1, 2, 3] },
    { name: 'Живое выступление', nameEn: 'Live Performance', professionIndices: [0, 1, 2, 3] },
    { name: 'Студийная запись', nameEn: 'Studio Recording', professionIndices: [0, 1, 2, 3, 4] },
    { name: 'Микширование', nameEn: 'Mixing', professionIndices: [0, 1, 2] },
    { name: 'Мастеринг', nameEn: 'Mastering', professionIndices: [0, 1, 2] },
    { name: 'Саунд-дизайн', nameEn: 'Sound Design', professionIndices: [0, 4] },
    { name: 'Запись вокала', nameEn: 'Vocal Recording', professionIndices: [0, 1, 2, 3] },
    { name: 'Обучение игре на инструменте', nameEn: 'Instrument Lessons', professionIndices: [0, 1, 2, 3, 4] },
    { name: 'Композиция', nameEn: 'Composition', professionIndices: [0, 2, 3] },
    { name: 'Аранжировка', nameEn: 'Arranging', professionIndices: [0, 2] },
    { name: 'Продюсирование', nameEn: 'Production', professionIndices: [0] },
    { name: 'DJ-сет', nameEn: 'DJ Set', professionIndices: [4] },
    { name: 'Звукорежиссура', nameEn: 'Sound Engineering', professionIndices: [0, 1, 2, 3] },
    { name: 'Аудио монтаж', nameEn: 'Audio Editing', professionIndices: [0, 1, 2] },
    { name: 'Создание минусовок', nameEn: 'Backing Track Creation', professionIndices: [0, 1, 2, 3] },
  ];

  const services: any[] = [];
  for (const s of serviceData) {
    for (const profIndex of s.professionIndices) {
      const service = await prisma.service.upsert({
        where: {
          name: s.name,
        },
        update: {},
        create: {
          name: s.name,
          nameEn: s.nameEn,
          professionId: professions[profIndex].id,
          sortOrder: serviceData.indexOf(s),
        },
      });
      services.push({ ...service, professionId: professions[profIndex].id });
    }
  }

  console.log(`Created ${services.length} service-profession links`);

  // ============ Genres ============
  const genreData: { name: string; nameEn: string }[] = [
    { name: 'Рок', nameEn: 'Rock' },
    { name: 'Поп', nameEn: 'Pop' },
    { name: 'Джаз', nameEn: 'Jazz' },
    { name: 'Классика', nameEn: 'Classical' },
    { name: 'Электроника', nameEn: 'Electronic' },
    { name: 'Хип-хоп', nameEn: 'Hip-Hop' },
    { name: 'R&B', nameEn: 'R&B' },
    { name: 'Кантри', nameEn: 'Country' },
    { name: 'Фолк', nameEn: 'Folk' },
    { name: 'Метал', nameEn: 'Metal' },
    { name: 'Инди', nameEn: 'Indie' },
    { name: 'Альтернатива', nameEn: 'Alternative' },
    { name: 'Блюз', nameEn: 'Blues' },
    { name: 'Регги', nameEn: 'Reggae' },
    { name: 'Латинская музыка', nameEn: 'Latin' },
    { name: 'Эмбиент', nameEn: 'Ambient' },
    { name: 'Оркестровая', nameEn: 'Orchestral' },
  ];

  // Link genres to all services (many-to-many relationship)
  const allServices = await prisma.service.findMany({
    include: { genres: true },
  });

  for (const service of allServices) {
    // Link first 5 genres to each service
    const genresToLink = genreData.slice(0, 5);
    for (const genre of genresToLink) {
      const existingGenre = await prisma.genre.findUnique({
        where: { name: genre.name },
      });
      
      if (existingGenre) {
        await prisma.genre.update({
          where: { id: existingGenre.id },
          data: {
            serviceId: service.id,
          },
        });
      } else {
        await prisma.genre.create({
          data: {
            name: genre.name,
            nameEn: genre.nameEn,
            serviceId: service.id,
          },
        });
      }
    }
  }

  console.log(`Created ${genreData.length} genres linked to services`);

  // ============ Work Formats ============
  const workFormats = await Promise.all([
    prisma.workFormat.upsert({
      where: { name: 'Удалённо' },
      update: {},
      create: { name: 'Удалённо', nameEn: 'Remote', sortOrder: 0 },
    }),
    prisma.workFormat.upsert({
      where: { name: 'На площадке' },
      update: {},
      create: { name: 'На площадке', nameEn: 'On-site', sortOrder: 1 },
    }),
    prisma.workFormat.upsert({
      where: { name: 'Гибрид' },
      update: {},
      create: { name: 'Гибрид', nameEn: 'Hybrid', sortOrder: 2 },
    }),
    prisma.workFormat.upsert({
      where: { name: 'В студии' },
      update: {},
      create: { name: 'В студии', nameEn: 'Studio', sortOrder: 3 },
    }),
    prisma.workFormat.upsert({
      where: { name: 'На живом мероприятии' },
      update: {},
      create: { name: 'На живом мероприятии', nameEn: 'Live Venue', sortOrder: 4 },
    }),
  ]);

  console.log(`Created ${workFormats.length} work formats`);

  // ============ Employment Types ============
  const employmentTypes = await Promise.all([
    prisma.employmentType.upsert({
      where: { name: 'Полная занятость' },
      update: {},
      create: { name: 'Полная занятость', nameEn: 'Full-time', sortOrder: 0 },
    }),
    prisma.employmentType.upsert({
      where: { name: 'Частичная занятость' },
      update: {},
      create: { name: 'Частичная занятость', nameEn: 'Part-time', sortOrder: 1 },
    }),
    prisma.employmentType.upsert({
      where: { name: 'Фриланс' },
      update: {},
      create: { name: 'Фриланс', nameEn: 'Freelance', sortOrder: 2 },
    }),
    prisma.employmentType.upsert({
      where: { name: 'Проектная работа' },
      update: {},
      create: { name: 'Проектная работа', nameEn: 'Project-based', sortOrder: 3 },
    }),
  ]);

  console.log(`Created ${employmentTypes.length} employment types`);

  // ============ Skill Levels ============
  const skillLevels = await Promise.all([
    prisma.skillLevel.upsert({
      where: { name: 'Начинающий' },
      update: {},
      create: { name: 'Начинающий', nameEn: 'Beginner', sortOrder: 0 },
    }),
    prisma.skillLevel.upsert({
      where: { name: 'Средний уровень' },
      update: {},
      create: { name: 'Средний уровень', nameEn: 'Intermediate', sortOrder: 1 },
    }),
    prisma.skillLevel.upsert({
      where: { name: 'Продвинутый' },
      update: {},
      create: { name: 'Продвинутый', nameEn: 'Advanced', sortOrder: 2 },
    }),
    prisma.skillLevel.upsert({
      where: { name: 'Профессионал' },
      update: {},
      create: { name: 'Профессионал', nameEn: 'Professional', sortOrder: 3 },
    }),
    prisma.skillLevel.upsert({
      where: { name: 'Мастер' },
      update: {},
      create: { name: 'Мастер', nameEn: 'Master', sortOrder: 4 },
    }),
  ]);

  console.log(`Created ${skillLevels.length} skill levels`);

  // ============ Availabilities ============
  const availabilities = await Promise.all([
    prisma.availability.upsert({
      where: { name: 'Немедленно' },
      update: {},
      create: { name: 'Немедленно', nameEn: 'Immediate', sortOrder: 0 },
    }),
    prisma.availability.upsert({
      where: { name: 'В течение недели' },
      update: {},
      create: { name: 'В течение недели', nameEn: 'Within 1 week', sortOrder: 1 },
    }),
    prisma.availability.upsert({
      where: { name: 'В течение месяца' },
      update: {},
      create: { name: 'В течение месяца', nameEn: 'Within 1 month', sortOrder: 2 },
    }),
    prisma.availability.upsert({
      where: { name: 'По договорённости' },
      update: {},
      create: { name: 'По договорённости', nameEn: 'By arrangement', sortOrder: 3 },
    }),
  ]);

  console.log(`Created ${availabilities.length} availabilities`);

  // ============ Profession Features ============
  const features = await Promise.all([
    prisma.professionFeature.upsert({
      where: { name: 'Начинающий' },
      update: {},
      create: { name: 'Начинающий' },
    }),
    prisma.professionFeature.upsert({
      where: { name: 'Средний уровень' },
      update: {},
      create: { name: 'Средний уровень' },
    }),
    prisma.professionFeature.upsert({
      where: { name: 'Профессионал' },
      update: {},
      create: { name: 'Профессионал' },
    }),
    prisma.professionFeature.upsert({
      where: { name: 'Работаю платно' },
      update: {},
      create: { name: 'Работаю платно' },
    }),
    prisma.professionFeature.upsert({
      where: { name: 'Работаю бесплатно' },
      update: {},
      create: { name: 'Работаю бесплатно' },
    }),
  ]);

  console.log(`Created ${features.length} profession features`);

  // ============ Artists ============
  const artists = await Promise.all([
    prisma.artist.upsert({
      where: { name: 'Сплин' },
      update: {},
      create: { name: 'Сплин' },
    }),
    prisma.artist.upsert({
      where: { name: 'Земфира' },
      update: {},
      create: { name: 'Земфира' },
    }),
    prisma.artist.upsert({
      where: { name: 'Мумий Тролль' },
      update: {},
      create: { name: 'Мумий Тролль' },
    }),
    prisma.artist.upsert({
      where: { name: 'Би-2' },
      update: {},
      create: { name: 'Би-2' },
    }),
    prisma.artist.upsert({
      where: { name: 'Noize MC' },
      update: {},
      create: { name: 'Noize MC' },
    }),
  ]);

  console.log(`Created ${artists.length} artists`);

  // ============ Employers ============
  const employers = await Promise.all([
    prisma.employer.upsert({
      where: { inn: '7707083893' },
      update: {},
      create: { name: 'Universal Music Russia', inn: '7707083893', ogrn: '1027700132195' },
    }),
    prisma.employer.upsert({
      where: { inn: '7714456789' },
      update: {},
      create: { name: 'Sony Music Entertainment', inn: '7714456789', ogrn: '1037714067890' },
    }),
    prisma.employer.upsert({
      where: { inn: '7725123456' },
      update: {},
      create: { name: 'Warner Music Russia', inn: '7725123456', ogrn: '1047725012345' },
    }),
    prisma.employer.upsert({
      where: { inn: '7701987654' },
      update: {},
      create: { name: 'Gazgolder', inn: '7701987654', ogrn: '1057701098765' },
    }),
    prisma.employer.upsert({
      where: { inn: '7709876543' },
      update: {},
      create: { name: 'Black Star', inn: '7709876543', ogrn: '1067709087654' },
    }),
  ]);

  console.log(`Created ${employers.length} employers`);

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
