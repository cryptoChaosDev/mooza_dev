const { PrismaClient } = require('@prisma/client');

async function updateSchema() {
  const prisma = new PrismaClient();
  
  try {
    // Run the migration manually
    await prisma.$executeRaw`ALTER TABLE "Profile" ADD COLUMN "friendsCsv" TEXT NOT NULL DEFAULT '';`;
    console.log('Successfully added friendsCsv column to Profile table');
  } catch (error) {
    console.error('Error updating schema:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateSchema();