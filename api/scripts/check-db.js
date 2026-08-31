require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true, isActive: true, createdAt: true }
    });
    console.log('=== USUARIOS EN BD ===');
    console.log(JSON.stringify(users, null, 2));
    
    const apartments = await prisma.apartment.count();
    console.log(`\n=== DEPARTAMENTOS: ${apartments} ===`);
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
