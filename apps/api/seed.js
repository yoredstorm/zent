const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', passwordHash: hash, name: 'Admin', role: 'ADMIN' },
  });
  console.log('Usuario admin creado: admin@example.com / admin123');
  await prisma.$disconnect();
}

main();