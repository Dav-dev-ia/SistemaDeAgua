module.paths.unshift(require('path').join(__dirname, '..', 'api', 'node_modules'));
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, isActive: true } });
  const periods = await prisma.billingPeriod.findMany({ select: { id: true, code: true, status: true, totalCommonAmountBs: true, distributedTotalBs: true } });
  const allocations = await prisma.allocation.findMany({ select: { id: true, periodId: true, apartmentId: true, status: true, amountDueBs: true, amountPaidBs: true } });
  const payments = await prisma.payment.findMany({ select: { id: true, amountBs: true, paymentMethod: true } });

  console.log('USERS:', JSON.stringify(users));
  console.log('PERIODS:', JSON.stringify(periods, null, 2));
  console.log('ALLOCATIONS:', JSON.stringify(allocations));
  console.log('PAYMENTS:', JSON.stringify(payments));
  const ok = prisma.$queryRaw`SELECT 1`;
  console.log('DB OK');
}

main().finally(() => prisma.$disconnect());