import { PrismaClient } from '@prisma/client';
import { assertDemoEnvironment, seedDemoData } from './seed-data.js';

assertDemoEnvironment(process.env.NODE_ENV);
const db = new PrismaClient();
try {
  await db.$transaction((tx) => seedDemoData(tx, process.env.NODE_ENV));
  console.info('Development demo data initialized.');
} finally {
  await db.$disconnect();
}
