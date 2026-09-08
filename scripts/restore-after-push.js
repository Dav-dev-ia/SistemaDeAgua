// Restaura los valores que db push recreó como defaults tras el cambio a enums
module.paths.unshift(require('path').join(__dirname, '..', 'api', 'node_modules'));
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env') });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  const backup = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'db-backup-before-push.json'), 'utf8'));

  for (const u of backup.users) {
    await prisma.user.update({ where: { id: u.id }, data: { role: u.role, isActive: u.isActive } });
    console.log(`[user] ${u.username} → role=${u.role}, isActive=${u.isActive}`);
  }

  for (const p of backup.periodStatuses) {
    await prisma.$executeRaw`UPDATE billing_periods SET status = ${p.status}::"PeriodStatus" WHERE id = ${p.id}`;
    console.log(`[period] ${p.id} → status=${p.status}`);
  }

  for (const a of backup.allocationStatuses) {
    await prisma.$executeRaw`UPDATE allocations SET status = ${a.status}::"AllocationStatus" WHERE id = ${a.id}`;
    console.log(`[allocation] ${a.id} → status=${a.status}`);
  }

  for (const pm of backup.paymentMethods) {
    await prisma.$executeRaw`UPDATE payments SET "paymentMethod" = ${pm.paymentMethod}::"PaymentMethod" WHERE id = ${pm.id}`;
    console.log(`[payment] ${pm.id} → method=${pm.paymentMethod}, amount=${pm.amountBs}`);
  }

  console.log('\nRestauración completada.');
}

main().finally(() => prisma.$disconnect());