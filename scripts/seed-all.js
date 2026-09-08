module.paths.unshift(require('path').join(__dirname, '..', 'api', 'node_modules'));
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env') });
const prisma = require('../api/lib/prisma');
const { withRetry } = require('../api/lib/prisma');
const bcrypt = require('bcryptjs');


async function main() {
  console.log('--- Configurando usuarios de prueba y verificando BD ---');

  // 1. Admin (admin / admin123)
  const adminPasswordHash = await bcrypt.hash('admin123', 12);
  const admin = await withRetry(() => prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      isActive: true,
      fullName: 'Administrador General'
    },

    create: {
      username: 'admin',
      fullName: 'Administrador General',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      isActive: true
    }
  }), 5, 2000);
  console.log('✅ Usuario ADMIN configurado:', admin.username);

  // 2. Departamento para Juan
  const apt = await withRetry(() => prisma.apartment.upsert({
    where: { uq_apartment_block_number: { block: '2', number: '202' } },
    update: {
      ownerName: 'Juan Pérez',
      isActive: true,
      coefficient: 1.0
    },
    create: {
      block: '2',
      number: '202',
      ownerName: 'Juan Pérez',
      coefficient: 1.0,
      isActive: true,
      meters: {
        create: {
          code: 'M-202',
          isInverted: false,
          isActive: true
        }
      }
    },
    include: { meters: true }
  }), 5, 2000);

  if (apt.meters.length === 0) {
    await withRetry(() => prisma.meter.create({
      data: {
        code: 'M-202',
        apartmentId: apt.id,
        isInverted: false,
        isActive: true
      }
    }), 5, 2000);
  }
  console.log('✅ Departamento configurado:', `Bloque ${apt.block} - Dpto ${apt.number}`);

  // 3. Owner Juan (juan / juan123)
  const juanPasswordHash = await bcrypt.hash('juan123', 12);
  const juan = await withRetry(() => prisma.user.upsert({
    where: { username: 'juan' },
    update: {
      passwordHash: juanPasswordHash,
      role: 'OWNER',
      isActive: true,
      fullName: 'Juan Pérez',
      apartmentId: apt.id
    },
    create: {
      username: 'juan',
      fullName: 'Juan Pérez',
      passwordHash: juanPasswordHash,
      role: 'OWNER',
      isActive: true,
      apartmentId: apt.id
    }
  }), 5, 2000);
  console.log('✅ Usuario OWNER configurado:', juan.username);


  console.log('\n========================================');
  console.log('📋 CREDENCIALES CONFIGURADAS EXITOSAMENTE');
  console.log('========================================');
  console.log('👤 Administrador:');
  console.log('   Usuario:    admin');
  console.log('   Contraseña: admin123');
  console.log('----------------------------------------');
  console.log('👤 Propietario (Adjudicatario):');
  console.log('   Usuario:    juan');
  console.log('   Contraseña: juan123');
  console.log('   Bloque:     2');
  console.log('   Dpto:       202');
  console.log('========================================\n');
}


main()
  .catch((err) => {
    console.error('Error en seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
