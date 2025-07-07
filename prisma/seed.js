const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const hashedAdmin = await bcrypt.hash('admin123', 10);
  const hashedUser1 = await bcrypt.hash('user123', 10);
  const hashedUser2 = await bcrypt.hash('user456', 10);

  // Admin seed
  await prisma.user.upsert({
    where: { email: 'admin@admin.com' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@admin.com',
      password: hashedAdmin,
      role: 'admin',
    },
  });

  // User 1 seed
  await prisma.user.upsert({
    where: { email: 'user1@example.com' },
    update: {},
    create: {
      username: 'user1',
      email: 'user1@example.com',
      password: hashedUser1,
      role: 'user',
    },
  });

  // User 2 seed
  await prisma.user.upsert({
    where: { email: 'user2@example.com' },
    update: {},
    create: {
      username: 'user2',
      email: 'user2@example.com',
      password: hashedUser2,
      role: 'user',
    },
  });

  console.log('✅ Admin & Users seeded');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());