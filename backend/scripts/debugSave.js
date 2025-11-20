// Script to check profile saving/loading
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('\nChecking DB state...');
  
  // 1. Get all users
  const users = await prisma.user.findMany();
  console.log('\nUsers in DB:', users.map(u => ({ 
    id: u.id,
    email: u.email,
    phone: u.phone,
    name: u.name
  })));

  // 2. Get all profiles with user data
  const profiles = await prisma.profile.findMany({
    include: { user: true }
  });
  
  console.log('\nProfiles in DB:');
  profiles.forEach(p => {
    console.log(`\nProfile for user ${p.user.name} (${p.user.email || p.user.phone}):`);
    console.log('- Name:', p.firstName, p.lastName);
    console.log('- Bio:', p.bio);
    console.log('- Work:', p.workPlace);
    console.log('- Location:', p.city, p.country);
    console.log('- Skills:', p.skillsCsv);
    console.log('- Interests:', p.interestsCsv);
    if (p.portfolioJson) {
      try {
        const portfolio = JSON.parse(p.portfolioJson);
        console.log('- Portfolio:', portfolio);
      } catch (e) {
        console.log('- Portfolio: [invalid JSON]', p.portfolioJson);
      }
    }
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());