require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, fullName: true, role: true, isActive: true, apartmentId: true }
  });
  console.log('--- USERS IN DB ---');
  console.log(JSON.stringify(users, null, 2));

  const apts = await prisma.apartment.findMany();
  console.log('\n--- APARTMENTS IN DB ---');
  console.log(JSON.stringify(apts, null, 2));

  const bcrypt = require('bcryptjs');
  const juan = await prisma.user.findUnique({ where: { username: 'juan' } });
  if (juan) {
    console.log('\nTesting passwords for juan:');
    for (const p of ['123456', 'Juan123!', 'Admin2026!', 'juan123', 'juan', 'password', '12345678']) {
      const match = await bcrypt.compare(p, juan.passwordHash);
      console.log(`Password "${p}":`, match);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

