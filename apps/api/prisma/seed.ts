import { PrismaClient } from '@prisma/client';
import { seedBaseData } from './seed-data.js';

const db = new PrismaClient();
try {
  await db.$transaction((tx) => seedBaseData(tx));
  console.info('Base catalog initialized; no users, printers or invitations created.');
} finally {
  await db.$disconnect();
}
