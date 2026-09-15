import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { initializeAdmin } from './admin-initialization.js';
import { seedBaseData } from './seed-data.js';

// Opt-in database test. Each run owns a fresh schema and removes only that schema.
describe.skipIf(!process.env.TEST_DATABASE_URL)('initialization with PostgreSQL', () => {
  const schema = `init_test_${randomUUID().replaceAll('-', '')}`;
  let db: PrismaClient | undefined;

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set('schema', schema);
    db = new PrismaClient({ datasourceUrl: url.toString() });
    const require = createRequire(import.meta.url);
    await promisify(execFile)(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
      },
    );
  }, 30_000);

  beforeEach(async () => {
    await db!.user.deleteMany();
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await db.$disconnect();
    }
  });

  test('base seed is idempotent, preserves pricing, and creates no demo records', async () => {
    await db!.$transaction((tx) => seedBaseData(tx));
    await db!.pricingRule.update({ where: { key: 'setup_fee' }, data: { value: 99 } });
    await db!.$transaction((tx) => seedBaseData(tx));
    expect(await db!.material.count()).toBe(5);
    expect(await db!.colorOption.count()).toBe(7);
    expect(await db!.pricingRule.count()).toBe(6);
    expect(Number((await db!.pricingRule.findUniqueOrThrow({ where: { key: 'setup_fee' } })).value)).toBe(99);
    expect(await db!.user.count()).toBe(0);
    expect(await db!.printer.count()).toBe(0);
    expect(await db!.invitationCode.count()).toBe(0);
  });

  test('concurrent bootstraps create only one administrator', async () => {
    const results = await Promise.allSettled([
      initializeAdmin(db!, '13712345678'),
      initializeAdmin(db!, '13612345678'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const admin = await db!.user.findFirstOrThrow();
    expect(await db!.user.count()).toBe(1);
    expect(admin.role).toBe('ADMIN');
    expect(await initializeAdmin(db!, admin.phone!)).toEqual({ userId: admin.id, created: false });
    expect(await db!.invitationCode.count()).toBe(0);
  });

  test('bootstrap cannot promote an existing ordinary user', async () => {
    const user = await db!.user.create({ data: { username: 'ordinary', phone: '13712345678', nickname: 'User' } });
    await expect(initializeAdmin(db!, user.phone!)).rejects.toThrow('cannot promote');
    expect((await db!.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER');
  });
});
