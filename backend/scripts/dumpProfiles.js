const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const rows = await p.profile.findMany({
      include: { user: { select: { id: true, email: true, phone: true, name: true } } }
    });

    const reduced = rows.map(r => ({
      id: r.id,
      userId: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      avatarUrl: r.avatarUrl,
      bio: r.bio,
      workPlace: r.workPlace,
      skillsCsv: r.skillsCsv,
      interestsCsv: r.interestsCsv,
      portfolioJson: r.portfolioJson,
      portfolioFileName: r.portfolioFileName,
      portfolioFileType: r.portfolioFileType,
      city: r.city,
      country: r.country,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: r.user
    }));

    console.log(JSON.stringify(reduced, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await p.$disconnect();
  }
})();