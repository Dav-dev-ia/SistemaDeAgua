/**
 * SCRIPT: seed-admin.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifica si el admin existe en Neon y lo crea/actualiza si es necesario.
 *
 * Uso:
 *   node scripts/seed-admin.js
 *   node scripts/seed-admin.js --reset    (resetea la contraseña del admin)
 *
 * Variables requeridas en api/.env:
 *   DATABASE_URL, DIRECT_URL
 * ─────────────────────────────────────────────────────────────────────────────
 */
module.paths.unshift(require('path').join(__dirname, '..', 'api', 'node_modules'));
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env') });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ─── Configuración del admin por defecto ──────────────────────────────────────
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin2026!';
const ADMIN_FULLNAME = process.env.ADMIN_FULLNAME || 'Administrador General';

const isReset = process.argv.includes('--reset');

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       AguaPago - Seed Admin Script           ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // 1. Verificar conexión
  try {
    await prisma.$connect();
    console.log('✅ Conexión a Neon PostgreSQL exitosa');
  } catch (err) {
    console.error('❌ Error de conexión a la BD:', err.message);
    console.error('\n⚠️  Verifica que DATABASE_URL esté correctamente configurado en api/.env');
    process.exit(1);
  }

  // 2. Buscar admin existente
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' }
  });

  if (existingAdmin && !isReset) {
    console.log('\n✅ Admin ya existe en la BD:');
    console.log(`   ID:       ${existingAdmin.id}`);
    console.log(`   Username: ${existingAdmin.username}`);
    console.log(`   Nombre:   ${existingAdmin.fullName}`);
    console.log(`   Activo:   ${existingAdmin.isActive}`);
    console.log(`   Creado:   ${existingAdmin.createdAt.toISOString()}`);
    console.log('\n💡 Usa --reset para resetear la contraseña del admin.');
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  if (existingAdmin && isReset) {
    // Resetear contraseña
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        passwordHash,
        isActive: true,
      }
    });
    console.log('\n✅ Contraseña del admin reseteada exitosamente:');
    console.log(`   Username:   ${existingAdmin.username}`);
    console.log(`   Contraseña: ${ADMIN_PASSWORD}`);
    console.log('\n🔐 Cambia la contraseña inmediatamente después de iniciar sesión.');
    return;
  }

  // Crear admin nuevo
  const admin = await prisma.user.create({
    data: {
      username: ADMIN_USERNAME,
      fullName: ADMIN_FULLNAME,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    }
  });

  console.log('\n✅ Admin creado exitosamente:');
  console.log(`   ID:         ${admin.id}`);
  console.log(`   Username:   ${admin.username}`);
  console.log(`   Nombre:     ${admin.fullName}`);
  console.log(`   Contraseña: ${ADMIN_PASSWORD}`);
  console.log('\n🔐 Cambia la contraseña inmediatamente después de iniciar sesión.');
}

main()
  .catch((err) => {
    console.error('❌ Error inesperado:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('\n🔌 Conexión cerrada.');
  });
