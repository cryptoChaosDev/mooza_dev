/**
 * One-time migration: populate CustomFilterValue records from CustomFilter.filterValues string[].
 * Run once with: npx ts-node prisma/seeds/migrate-filter-values.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const filters = await prisma.customFilter.findMany({
    where: { filterValues: { isEmpty: false } },
    include: { values: { select: { id: true } } },
  });

  console.log(`Found ${filters.length} CustomFilters with filterValues`);

  let created = 0;
  let skipped = 0;

  for (const filter of filters) {
    if (filter.values.length > 0) {
      skipped++;
      continue; // already has CustomFilterValue records
    }
    for (let i = 0; i < filter.filterValues.length; i++) {
      await prisma.customFilterValue.create({
        data: {
          filterId: filter.id,
          value: filter.filterValues[i],
          sortOrder: i,
        },
      });
      created++;
    }
  }

  console.log(`Done. Created: ${created} values, Skipped: ${skipped} already-populated filters`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
