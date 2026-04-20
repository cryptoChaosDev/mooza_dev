/**
 * Импортирует artists_ru_clean.json в БД.
 * Запуск: node scripts/import_artists.mjs
 * Из директории server/ (где есть node_modules/@prisma)
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const BATCH = 100;

async function main() {
  const raw = readFileSync(join(__dirname, 'artists_ru_clean.json'), 'utf-8');
  const artists = JSON.parse(raw);

  console.log(`Артистов в файле: ${artists.length}`);

  // Предзагрузим все существующие жанры
  const existingGenres = await prisma.genre.findMany();
  const genreMap = new Map(existingGenres.map(g => [g.name.toLowerCase(), g]));

  let created = 0, skipped = 0, errors = 0;

  for (let i = 0; i < artists.length; i += BATCH) {
    const batch = artists.slice(i, i + BATCH);

    for (const artist of batch) {
      try {
        // Проверяем — уже есть такой артист?
        const existing = await prisma.artist.findFirst({
          where: { name: { equals: artist.name, mode: 'insensitive' } },
        });
        if (existing) { skipped++; continue; }

        // Создаём артиста
        const created_artist = await prisma.artist.create({
          data: {
            name: artist.name,
            status: 'DRAFT',
            // Discogs thumb храним в avatar как внешний URL (для подсказок)
            avatar: artist.thumb || null,
          },
        });

        // Привязываем жанры
        for (const genreName of (artist.genres || [])) {
          let genre = genreMap.get(genreName.toLowerCase());
          if (!genre) {
            genre = await prisma.genre.upsert({
              where: { name: genreName },
              create: { name: genreName },
              update: {},
            });
            genreMap.set(genreName.toLowerCase(), genre);
          }
          await prisma.artistGenre.createMany({
            data: [{ artistId: created_artist.id, genreId: genre.id }],
            skipDuplicates: true,
          });
        }

        created++;
      } catch (e) {
        errors++;
        console.error(`  Ошибка для "${artist.name}":`, e.message);
      }
    }

    console.log(`  ${i + batch.length}/${artists.length} | создано: ${created}, пропущено: ${skipped}, ошибок: ${errors}`);
  }

  console.log(`\nГотово! Создано: ${created}, пропущено (дубли): ${skipped}, ошибок: ${errors}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
