const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash('Jaredcito2025@1', 10);
  await prisma.user.upsert({
    where: { email: 'the.ares.p@gmail.com' },
    update: { passwordHash: hash },
    create: { email: 'the.ares.p@gmail.com', passwordHash: hash, name: 'Admin', role: 'ADMIN' },
  });
  console.log('Usuario creado: the.ares.p@gmail.com');
  await prisma.$disconnect();
}

main();