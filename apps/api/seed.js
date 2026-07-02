/**
 * DEV ONLY — seed de usuario admin local.
 * Requiere variables de entorno; no ejecutar en producción con credenciales reales en el repo.
 *
 * Uso:
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=changeme node seed.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      'Faltan SEED_ADMIN_EMAIL y/o SEED_ADMIN_PASSWORD. Este script es solo para desarrollo local.',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash },
    create: { email, passwordHash: hash, name: 'Admin', role: 'ADMIN' },
  });
  console.log(`Usuario admin creado/actualizado: ${email}`);
  await prisma.$disconnect();
}

main();
