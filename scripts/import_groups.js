/**
 * Импортирует российские группы из russian_groups.json в базу данных Moooza.
 *
 * Запуск:
 *   node import_groups.js [путь_к_json]
 *
 * По умолчанию читает russian_groups.json из той же папки.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const jsonPath = process.argv[2] || path.join(__dirname, 'russian_groups.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`Файл не найден: ${jsonPath}`);
    process.exit(1);
  }

  const groups = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Загружено ${groups.length} групп из JSON\n`);

  // Получаем существующие жанры из БД для маппинга
  const dbGenres = await prisma.genre.findMany();
  const genreMap = new Map(dbGenres.map(g => [g.name.toLowerCase(), g.id]));
  console.log(`Жанров в БД: ${dbGenres.length}`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const group of groups) {
    try {
      // Проверяем, не существует ли уже группа с таким именем
      const existing = await prisma.artist.findFirst({
        where: { name: { equals: group.name, mode: 'insensitive' } },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Маппим жанры из Яндекса на жанры в БД
      const matchedGenreIds = (group.genres || [])
        .map(g => genreMap.get(g.toLowerCase()))
        .filter(Boolean);

      await prisma.artist.create({
        data: {
          name: group.name,
          type: 'GROUP',
          description: group.description || null,
          avatar: group.cover || null,
          listeners: 0,
          genres: matchedGenreIds.length > 0
            ? { create: matchedGenreIds.map(id => ({ genreId: id })) }
            : undefined,
        },
      });

      created++;
      if (created % 100 === 0) {
        console.log(`  Создано ${created}...`);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`  Ошибка для "${group.name}": ${err.message}`);
      }
    }
  }

  console.log(`\n✓ Готово:`);
  console.log(`  Создано:  ${created}`);
  console.log(`  Пропущено (уже есть): ${skipped}`);
  console.log(`  Ошибок:   ${errors}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
