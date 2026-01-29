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

  const professions = [];
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
