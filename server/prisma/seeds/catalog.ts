import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface CatalogFilter {
  name: string;
  values: string[];
}

// muza_catalog.json — flat list of professions (group/id/sphere ignored)
interface CatalogEntry {
  profession: string;
  filters: CatalogFilter[];
  group?: string;
  id?: number | string;
  sphere?: string;
}

// services_catalog.json — services grouped into sections, linked to professions
interface ServiceEntry {
  service: string;
  section: string;
  professions: string[];
  filters: CatalogFilter[];
}

async function main() {
  const catalogPath = path.join(__dirname, 'muza_catalog.json');
  const servicesPath = path.join(__dirname, 'services_catalog.json');
  const catalog: CatalogEntry[] = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
  const services: ServiceEntry[] = JSON.parse(fs.readFileSync(servicesPath, 'utf-8'));

  console.log(`Loaded ${catalog.length} professions and ${services.length} services.`);

  // ── 1. Wipe user selections (confirmed acceptable) ──────────────────────────
  // UserService.serviceId / professionId are required FKs → must go before Service/Profession.
  await prisma.userService.deleteMany({});
  await prisma.userProfession.deleteMany({});
  console.log('Wiped user selections (userService, userProfession).');

  // ── 2. Wipe the catalog (respect FK order) ──────────────────────────────────
  // ConnectionService.serviceId is a required FK with onDelete: Cascade — clear it
  // explicitly so Service rows can be deleted. Review.serviceId and Deal.serviceId /
  // Deal.userServiceId are optional FKs with onDelete: SetNull, so they auto-null
  // when the referenced Service / UserService rows are deleted (no manual work needed).
  await prisma.connectionService.deleteMany({});
  console.log('Wiped connectionService (required FK to Service).');

  await prisma.customFilterValue.deleteMany({});
  await prisma.customFilter.deleteMany({});
  await prisma.serviceProfession.deleteMany({});
  await prisma.service.deleteMany({});
  await prisma.profession.deleteMany({});
  await prisma.section.deleteMany({});
  console.log('Wiped catalog (filters, services, professions, sections). Direction/FieldOfActivity left intact.');

  // ── 3. Professions (flat — directionId = null) + their filters ──────────────
  const profIdByName = new Map<string, string>();
  let profFilterCount = 0;
  let profFilterValueCount = 0;

  for (const entry of catalog) {
    let professionId = profIdByName.get(entry.profession);
    if (!professionId) {
      const profession = await prisma.profession.create({
        data: { name: entry.profession, directionId: null },
      });
      professionId = profession.id;
      profIdByName.set(entry.profession, professionId);
    }

    for (const filter of entry.filters) {
      // Guard against duplicate profession entries sharing a name (e.g. "Аудиоредактор"):
      // keep the first occurrence of each (profession, filterName) pair.
      const existing = await prisma.customFilter.findFirst({
        where: { professionId, name: filter.name },
        select: { id: true },
      });
      if (existing) continue;

      const created = await prisma.customFilter.create({
        data: { name: filter.name, filterValues: filter.values, professionId },
      });
      profFilterCount++;
      if (filter.values.length > 0) {
        await prisma.customFilterValue.createMany({
          data: filter.values.map((value, index) => ({
            value,
            sortOrder: index,
            filterId: created.id,
          })),
        });
        profFilterValueCount += filter.values.length;
      }
    }
  }
  console.log(`Created ${profIdByName.size} professions, ${profFilterCount} profession filters, ${profFilterValueCount} filter values.`);

  // ── 4. Sections (sortOrder = first-appearance order) ────────────────────────
  const sectionIdByName = new Map<string, string>();
  let sectionOrder = 0;
  for (const entry of services) {
    if (sectionIdByName.has(entry.section)) continue;
    const section = await prisma.section.create({
      data: { name: entry.section, sortOrder: sectionOrder++ },
    });
    sectionIdByName.set(entry.section, section.id);
  }
  console.log(`Created ${sectionIdByName.size} sections.`);

  // ── 5. Services (+ links to professions, + own filters) ─────────────────────
  let serviceProfessionCount = 0;
  let svcFilterCount = 0;
  let svcFilterValueCount = 0;
  let serviceOrder = 0;

  for (const entry of services) {
    const sectionId = sectionIdByName.get(entry.section) ?? null;
    const service = await prisma.service.create({
      data: { name: entry.service, sectionId, sortOrder: serviceOrder++ },
    });

    // Link professions
    const linkedProfIds = new Set<string>();
    for (const profName of entry.professions) {
      let professionId = profIdByName.get(profName);
      if (!professionId) {
        // Should not happen (verified), but create defensively if missing.
        const prof = await prisma.profession.create({
          data: { name: profName, directionId: null },
        });
        professionId = prof.id;
        profIdByName.set(profName, professionId);
      }
      if (linkedProfIds.has(professionId)) continue;
      linkedProfIds.add(professionId);
      await prisma.serviceProfession.create({
        data: { serviceId: service.id, professionId },
      });
      serviceProfessionCount++;
    }

    // Service's own filters
    for (const filter of entry.filters) {
      const existing = await prisma.customFilter.findFirst({
        where: { serviceId: service.id, name: filter.name },
        select: { id: true },
      });
      if (existing) continue;

      const created = await prisma.customFilter.create({
        data: { name: filter.name, filterValues: filter.values, serviceId: service.id },
      });
      svcFilterCount++;
      if (filter.values.length > 0) {
        await prisma.customFilterValue.createMany({
          data: filter.values.map((value, index) => ({
            value,
            sortOrder: index,
            filterId: created.id,
          })),
        });
        svcFilterValueCount += filter.values.length;
      }
    }
  }
  console.log(`Created ${serviceOrder} services, ${serviceProfessionCount} service↔profession links, ${svcFilterCount} service filters, ${svcFilterValueCount} filter values.`);

  console.log('\nCatalog import complete.');
}

main()
  .catch((e) => {
    console.error('Catalog seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
