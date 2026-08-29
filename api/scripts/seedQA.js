const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando QA Seeding (20 usuarios)...');

  // Crear 20 departamentos de prueba
  let usersCreated = 0;
  for (let i = 1; i <= 20; i++) {
    const block = 'QA';
    const number = i.toString().padStart(3, '0'); // QA-001
    const username = `qa_user_${i}`;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      console.log(`Usuario ${username} ya existe, saltando...`);
      continue;
    }

    const passwordHash = await bcrypt.hash('password123', 10);
    const coefficient = (Math.random() * (1.5 - 0.8) + 0.8).toFixed(2);
    const isInverted = Math.random() > 0.8; // 20% invertidos

    await prisma.apartment.create({
      data: {
        block,
        number,
        ownerName: `Propietario de Prueba ${i}`,
        phone: `700000${i.toString().padStart(2, '0')}`,
        coefficient: parseFloat(coefficient),
        meters: {
          create: {
            code: `MED-QA-${i.toString().padStart(3, '0')}`,
            isInverted
          }
        },
        users: {
          create: {
            username,
            fullName: `Propietario de Prueba ${i}`,
            passwordHash,
            role: 'OWNER',
            isActive: true
          }
        }
      }
    });

    usersCreated++;
  }

  console.log(`✅ ${usersCreated} usuarios/departamentos creados con éxito.`);
  console.log('Puedes probar iniciar sesión con "qa_user_1" a "qa_user_20" y contraseña "password123"');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
