import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface CatalogEntry {
  profession: string;
  group: string;
  filters: Array<{ name: string; values: string[] }>;
}

async function main() {
  const catalogPath = path.join(__dirname, 'muza_catalog.json');
  const catalog: CatalogEntry[] = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

  // Collect unique group names
  const groups = [...new Set(catalog.map((x) => x.group))];

  console.log(`Importing ${catalog.length} professions across ${groups.length} groups...`);

  for (const groupName of groups) {
    // Create Direction (Раздел) for each unique group — findFirst + create pattern
    // (upsert with null in composite unique key is not supported by Prisma)
    let direction = await prisma.direction.findFirst({
      where: { name: groupName, fieldOfActivityId: null },
    });
    if (!direction) {
      direction = await prisma.direction.create({
        data: { name: groupName, fieldOfActivityId: null, allowedFilterTypes: [] },
      });
    }

    // All professions in this group
    const entries = catalog.filter((x) => x.group === groupName);

    for (const entry of entries) {
      // Find or create Profession linked to this Direction
      let profession = await prisma.profession.findFirst({
        where: { name: entry.profession, directionId: direction.id },
      });
      if (!profession) {
        profession = await prisma.profession.create({
          data: { name: entry.profession, directionId: direction.id },
        });
      }

      // Create CustomFilters for this profession (filterValues = plain string array)
      for (const filter of entry.filters) {
        await prisma.customFilter.upsert({
          where: { name_professionId: { name: filter.name, professionId: profession.id } },
          create: { name: filter.name, filterValues: filter.values, professionId: profession.id },
          update: { filterValues: filter.values },
        });
      }
    }

    console.log(`  [${groupName}] — ${entries.length} professions imported`);
  }

  console.log(`\nDone. Imported ${catalog.length} professions total.`);
}

main()
  .catch((e) => {
    console.error('Catalog seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
