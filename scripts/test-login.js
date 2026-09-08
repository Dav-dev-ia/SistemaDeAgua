module.paths.unshift(require('path').join(__dirname, '..', 'api', 'node_modules'));
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env') });
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../api/prisma');
const { withRetry } = require('../api/prisma');

async function testCredentials(username, password) {
  console.log(`\nProbando login para: ${username}...`);
  const usernameClean = String(username).trim().toLowerCase();

  const user = await withRetry(
    () => prisma.user.findFirst({
      where: {
        username: { equals: usernameClean, mode: 'insensitive' }
      },
      include: { apartment: true }
    }),
    3, 2000
  );

  if (!user) {
    console.log(`❌ Usuario "${username}" NO encontrado en BD`);
    return false;
  }

  if (!user.isActive) {
    console.log(`❌ Usuario "${username}" está INACTIVO`);
    return false;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    console.log(`❌ Contraseña incorrecta para "${username}"`);
    return false;
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, username: user.username },
    process.env.JWT_SECRET_KEY,
    { expiresIn: '8h' }
  );

  console.log(`✅ Login EXITOSO para "${user.username}"!`);
  console.log(`   Rol: ${user.role}`);
  console.log(`   Nombre: ${user.fullName}`);
  if (user.apartment) {
    console.log(`   Departamento: Bloque ${user.apartment.block} - Dpto ${user.apartment.number}`);
  }
  console.log(`   JWT Token generado: ${token.substring(0, 20)}...`);
  return true;
}

async function main() {
  console.log('========================================');
  console.log(' TEST DE AUTENTICACIÓN - AGUAPAGO');
  console.log('========================================');

  // Test 1: Admin
  const adminOk = await testCredentials('admin', 'admin123');

  // Test 2: Admin con mayúsculas
  const adminUpperOk = await testCredentials('Admin', 'admin123');

  // Test 3: Owner Juan
  const juanOk = await testCredentials('juan', 'juan123');

  // Test 4: Owner Juan con mayúsculas
  const juanUpperOk = await testCredentials('Juan', 'juan123');


  console.log('\n========================================');
  console.log(' RESUMEN:');
  console.log(`   Admin (admin):   ${adminOk ? '✅ OK' : '❌ FAIL'}`);
  console.log(`   Admin (Admin):   ${adminUpperOk ? '✅ OK (case-insensitive)' : '❌ FAIL'}`);
  console.log(`   Owner (juan):    ${juanOk ? '✅ OK' : '❌ FAIL'}`);
  console.log(`   Owner (Juan):    ${juanUpperOk ? '✅ OK (case-insensitive)' : '❌ FAIL'}`);
  console.log('========================================\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
