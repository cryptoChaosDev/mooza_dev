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
  const catalogPath = path.join(__dirname, '../../../../muza_catalog.json');
  const catalog: CatalogEntry[] = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

  // Collect unique group names
  const groups = [...new Set(catalog.map((x) => x.group))];

  console.log(`Importing ${catalog.length} professions across ${groups.length} groups...`);

  for (const groupName of groups) {
    // Create FieldOfActivity (upsert by unique name)
    const field = await prisma.fieldOfActivity.upsert({
      where: { name: groupName },
      create: { name: groupName },
      update: {},
    });

    // Create Direction with the same name (upsert by name + fieldOfActivityId)
    const direction = await prisma.direction.upsert({
      where: {
        name_fieldOfActivityId: {
          name: groupName,
          fieldOfActivityId: field.id,
        },
      },
      create: { name: groupName, fieldOfActivityId: field.id },
      update: {},
    });

    // All professions in this group
    const entries = catalog.filter((x) => x.group === groupName);

    for (const entry of entries) {
      // Create Profession (upsert by name + directionId)
      const profession = await prisma.profession.upsert({
        where: {
          name_directionId: {
            name: entry.profession,
            directionId: direction.id,
          },
        },
        create: { name: entry.profession, directionId: direction.id },
        update: {},
      });

      // Create CustomFilters for this profession
      for (const filter of entry.filters) {
        await prisma.customFilter.upsert({
          where: {
            name_professionId: {
              name: filter.name,
              professionId: profession.id,
            },
          },
          create: {
            name: filter.name,
            filterValues: filter.values,
            professionId: profession.id,
          },
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
