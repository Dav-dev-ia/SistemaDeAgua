/**
 * SCRIPT DE DIAGNÓSTICO - diagnose.js
 * Verifica el estado completo del sistema AguaPago
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

async function main() {
  console.log('\n========================================');
  console.log('  DIAGNÓSTICO AGUAPAGO');
  console.log('========================================\n');

  // 1. Variables de entorno
  console.log('--- 1. Variables de entorno ---');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 40) + '...' : '❌ NO DEFINIDA');
  console.log('DIRECT_URL:', process.env.DIRECT_URL ? process.env.DIRECT_URL.substring(0, 40) + '...' : '❌ NO DEFINIDA');
  console.log('JWT_SECRET_KEY:', process.env.JWT_SECRET_KEY ? '✅ definida (' + process.env.JWT_SECRET_KEY.length + ' chars)' : '❌ NO DEFINIDA');

  // 2. Conexión a BD
  console.log('\n--- 2. Conexión a Neon ---');
  try {
    await prisma.$connect();
    console.log('✅ Conexión exitosa');
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
    process.exit(1);
  }

  // 3. Usuario admin
  console.log('\n--- 3. Usuario ADMIN en BD ---');
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.log('❌ NO EXISTE usuario ADMIN en la BD');
  } else {
    console.log('✅ Admin encontrado:');
    console.log('  ID:', admin.id);
    console.log('  username:', admin.username);
    console.log('  fullName:', admin.fullName);
    console.log('  isActive:', admin.isActive);
    console.log('  passwordHash length:', admin.passwordHash ? admin.passwordHash.length : 'VACÍO');
    console.log('  passwordHash starts with:', admin.passwordHash ? admin.passwordHash.substring(0, 7) : 'N/A');

    // Probar contraseñas comunes
    console.log('\n--- 4. Test de contraseñas ---');
    const testPasswords = ['Admin2026!', 'admin', 'admin123', '123456', 'Admin123!', 'password'];
    for (const p of testPasswords) {
      try {
        const valid = await bcrypt.compare(p, admin.passwordHash);
        console.log('  Password [' + p + ']:', valid ? '✅ VÁLIDA' : '❌ incorrecta');
      } catch (e) {
        console.log('  Password [' + p + ']: ERROR -', e.message);
      }
    }
  }

  // 5. Test JWT
  console.log('\n--- 5. Test JWT ---');
  const secret = process.env.JWT_SECRET_KEY;
  if (secret) {
    const token = jwt.sign({ sub: 1, role: 'ADMIN', username: 'admin' }, secret, { expiresIn: '1h' });
    console.log('✅ JWT generado correctamente');
    const decoded = jwt.verify(token, secret);
    console.log('✅ JWT verificado:', JSON.stringify(decoded));
  } else {
    console.log('❌ No se puede probar JWT: secret no definida');
  }

  // 6. Simular login completo
  console.log('\n--- 6. Simulación de login ---');
  if (admin) {
    const testPass = 'Admin2026!';
    const valid = await bcrypt.compare(testPass, admin.passwordHash);
    if (valid) {
      console.log('✅ Login con Admin2026! funcionaría correctamente');
    } else {
      console.log('❌ La contraseña Admin2026! no coincide. Reseteando...');
    }
  }
}

main()
  .catch((err) => {
    console.error('\n❌ Error fatal:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('\n✅ Diagnóstico completo.\n');
  });
