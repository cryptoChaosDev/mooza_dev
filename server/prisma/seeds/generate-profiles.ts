import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function rnd(n: number): number { return Math.floor(Math.random() * n); }
function sample<T>(arr: T[], k: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, Math.min(k, a.length));
}

const CITIES = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Краснодар', 'Ростов-на-Дону'];
const OCC = ['open', 'considering', 'closed'];

async function main() {
  // Generate for every real user except the team account and admins.
  const users = await prisma.user.findMany({
    where: { isAdmin: false, NOT: { email: 'team@moooza.ru' } },
    select: { id: true, firstName: true, lastName: true, occupancyStatus: true, city: true },
  });
  const professions = await prisma.profession.findMany({
    include: { customFilters: { include: { values: true } } },
  });
  const services = await prisma.service.findMany({
    include: {
      serviceProfessions: { select: { professionId: true } },
      customFilters: { include: { values: true } },
    },
  });

  console.log(`Generating profiles for ${users.length} users (${professions.length} professions, ${services.length} services)...`);

  let profCount = 0, svcCount = 0;

  for (const user of users) {
    // Idempotent: clear this user's existing selections first.
    await prisma.userService.deleteMany({ where: { userId: user.id } });
    await prisma.userProfession.deleteMany({ where: { userId: user.id } });

    // ── 2–3 professions, each with 1–2 values per filter ──────────────────────
    const chosenProfs = sample(professions, 2 + rnd(2)); // 2..3
    const userProfIds = new Set<string>();
    for (const prof of chosenProfs) {
      const valueIds: string[] = [];
      for (const f of prof.customFilters) {
        if (f.values.length) valueIds.push(...sample(f.values, 1 + rnd(2)).map((v) => v.id));
      }
      await prisma.userProfession.create({
        data: {
          userId: user.id,
          professionId: prof.id,
          selectedCustomFilterValues: { connect: [...new Set(valueIds)].map((id) => ({ id })) },
        },
      });
      userProfIds.add(prof.id);
      profCount++;
    }

    // ── 4–5 services, each with its own filter values ─────────────────────────
    const chosenSvcs = sample(services, 4 + rnd(2)); // 4..5
    for (const svc of chosenSvcs) {
      const svcProfIds = svc.serviceProfessions.map((sp) => sp.professionId);
      // Prefer a profession the user has; else the service's first profession; else any chosen.
      const professionId = svcProfIds.find((id) => userProfIds.has(id)) ?? svcProfIds[0] ?? chosenProfs[0]?.id;
      if (!professionId) continue;

      const valueIds: string[] = [];
      for (const f of svc.customFilters) {
        if (f.values.length) valueIds.push(...sample(f.values, 1 + rnd(2)).map((v) => v.id));
      }
      const priceFrom = (1 + rnd(10)) * 1000;
      const priceTo = priceFrom + (1 + rnd(10)) * 1000;

      await prisma.userService.create({
        data: {
          userId: user.id,
          serviceId: svc.id,
          professionId,
          status: 'active',
          priceFrom,
          priceTo,
          selectedCustomFilterValues: { connect: [...new Set(valueIds)].map((id) => ({ id })) },
        },
      });
      svcCount++;
    }

    // ── Fill basic profile fields if empty ────────────────────────────────────
    const data: any = {};
    if (!user.occupancyStatus) data.occupancyStatus = OCC[rnd(OCC.length)];
    if (!user.city) data.city = CITIES[rnd(CITIES.length)];
    if (Object.keys(data).length) await prisma.user.update({ where: { id: user.id }, data });
  }

  console.log(`Done. Created ${profCount} professions and ${svcCount} services across ${users.length} users.`);
}

main()
  .catch((e) => { console.error('generate-profiles error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
