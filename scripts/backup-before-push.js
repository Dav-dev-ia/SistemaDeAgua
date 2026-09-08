// Backup de columnas que cambiarán de tipo (por seguridad antes del db push)
module.paths.unshift(require('path').join(__dirname, '..', 'api', 'node_modules'));
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env') });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, isActive: true } });
  const periodStatuses = await prisma.$queryRaw`SELECT id, status::text as status FROM billing_periods`;
  const allocationStatuses = await prisma.$queryRaw`SELECT id, status::text as status FROM allocations`;
  const paymentMethods = await prisma.$queryRaw`SELECT id, "paymentMethod"::text as "paymentMethod", "amountBs"::text as "amountBs" FROM payments`;

  const backup = { users, periodStatuses, allocationStatuses, paymentMethods };
  fs.writeFileSync(require('path').join(__dirname, 'db-backup-before-push.json'), JSON.stringify(backup, null, 2));
  console.log('Backup guardado en db-backup-before-push.json');
  console.log(JSON.stringify(backup, null, 2));
}

main().finally(() => prisma.$disconnect());