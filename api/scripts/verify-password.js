require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // Verificar contraseña actual del admin
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) { console.log('❌ Admin no existe'); return; }
  
  const tests = ['Admin2026!', 'admin123', 'admin', 'password'];
  for (const pw of tests) {
    const ok = await bcrypt.compare(pw, admin.passwordHash);
    console.log(`${ok ? '✅' : '❌'} "${pw}" → ${ok ? 'CORRECTA' : 'incorrecta'}`);
  }
}

main().finally(() => prisma.$disconnect());
