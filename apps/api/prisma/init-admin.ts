import { PrismaClient } from '@prisma/client';
import { initializeAdmin } from './admin-initialization.js';

const db = new PrismaClient();
try {
  const result = await initializeAdmin(db, process.env.ADMIN_PHONE);
  console.info(JSON.stringify({ event: 'admin.bootstrap', time: new Date().toISOString(), ...result }));
} finally {
  await db.$disconnect();
}
