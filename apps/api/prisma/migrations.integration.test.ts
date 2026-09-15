import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, test } from 'vitest';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const cli = require.resolve('prisma/build/index.js');
const source = path.resolve('prisma');

describe.skipIf(!process.env.TEST_DATABASE_URL)('production migrations with PostgreSQL', () => {
  const resources: { schema: string; db: PrismaClient; directory: string }[] = [];
  async function setup() {
    const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set('schema', schema);
    const directory = await mkdtemp(path.join(tmpdir(), 'printlink-migration-'));
    await cp(source, directory, { recursive: true });
    const db = new PrismaClient({ datasourceUrl: url.toString() });
    resources.push({ schema, db, directory });
    const env = { ...process.env, DATABASE_URL: url.toString() };
    const run = (...args: string[]) => exec(process.execPath, [cli, ...args], { env });
    const schemaPath = path.join(directory, 'schema.prisma');
    const deploy = () => run('migrate', 'deploy', '--schema', schemaPath);
    const diff = () =>
      run(
        'migrate',
        'diff',
        '--from-schema-datasource',
        schemaPath,
        '--to-schema-datamodel',
        schemaPath,
        '--exit-code',
      );
    return { db, directory, env, schemaPath, run, deploy, diff };
  }
  afterEach(async () => {
    for (const { schema, db, directory } of resources.splice(0)) {
      try {
        await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await db.$disconnect();
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  test('empty database reaches the exact current schema and deploy is repeatable', async () => {
    const { db, deploy, diff } = await setup();
    await deploy();
    await diff();
    await db.user.create({ data: { username: 'preserved', nickname: 'Preserved' } });
    const second = await deploy();
    expect(second.stdout).toContain('No pending migrations');
    expect(await db.user.count()).toBe(1);
    const history = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    expect(Number(history[0].count)).toBe(8);
  }, 30_000);

  test('historical database upgrades without losing user, demand, or notification data', async () => {
    const { db, directory, schemaPath, run, deploy, diff } = await setup();
    const migrations = path.join(directory, 'migrations');
    for (const name of await readdir(migrations)) {
      if (name.startsWith('2026') && name > '20260819120000_add_user_role')
        await rm(path.join(migrations, name), { recursive: true });
    }
    await deploy();
    await db.$executeRaw`INSERT INTO "User" (id, phone, nickname, role) VALUES ('legacy', '13712345678', 'Legacy user', 'MAKER')`;
    await db.$executeRaw`INSERT INTO "Demand" (id, "userId", title, description, "materialCode", "colorName", budget) VALUES ('legacy-demand', 'legacy', 'Legacy demand', 'Keep this', 'PLA', 'White', 25)`;
    await db.$executeRaw`INSERT INTO "Notification" (id, "userId", type, title, body) VALUES ('legacy-notification', 'legacy', 'SYSTEM', 'Keep this', 'Existing notification')`;
    // Simulate an existing installation whose original schema was created outside Migrate.
    await db.$executeRaw`DELETE FROM "_prisma_migrations" WHERE migration_name = '20260801000000_initial_schema'`;
    // This fixture's structure is known to match the historical prefix above.
    await run('migrate', 'resolve', '--applied', '20260801000000_initial_schema', '--schema', schemaPath);
    await cp(path.join(source, 'migrations'), migrations, { recursive: true });
    await deploy();
    await diff();
    expect(await db.user.findUnique({ where: { id: 'legacy' } })).toMatchObject({
      username: '13712345678',
      phone: '13712345678',
      role: 'USER',
      avatarKey: null,
      wechatId: '',
    });
    expect(await db.demand.count()).toBe(1);
    expect(await db.notification.count()).toBe(1);
  }, 30_000);

  test('failed SQL fails deployment and blocks subsequent migrations', async () => {
    const { db, directory, deploy } = await setup();
    await deploy();
    const bad = path.join(directory, 'migrations', '20260910000000_invalid');
    const later = path.join(directory, 'migrations', '20260911000000_must_not_run');
    await mkdir(bad);
    await mkdir(later);
    await writeFile(path.join(bad, 'migration.sql'), 'SELECT missing_column FROM "User";');
    await writeFile(path.join(later, 'migration.sql'), 'CREATE TABLE "MustNotExist" (id INTEGER);');
    await expect(deploy()).rejects.toMatchObject({ code: 1 });
    await expect(deploy()).rejects.toMatchObject({ code: 1 });
    const rows = await db.$queryRaw<{ table: string | null }[]>`SELECT to_regclass('"MustNotExist"')::text AS "table"`;
    expect(rows[0].table).toBeNull();
  }, 30_000);

  test('adopts a matching db-push database, preserves data, and refuses drift', async () => {
    const { db, env, schemaPath, run, deploy } = await setup();
    await run('db', 'push', '--schema', schemaPath, '--skip-generate');
    await db.user.create({ data: { username: 'existing', nickname: 'Existing' } });
    const adopt = () =>
      exec(process.execPath, [require.resolve('tsx/cli'), path.join(source, 'adopt-current-schema.ts')], { env });
    await adopt();
    await adopt();
    expect((await deploy()).stdout).toContain('No pending migrations');
    expect(await db.user.count()).toBe(1);
    await db.$executeRaw`ALTER TABLE "User" DROP COLUMN "avatarKey"`;
    await expect(adopt()).rejects.toBeDefined();
    expect(await db.user.count()).toBe(1);
  }, 30_000);

  test('adoption refuses failed or modified history even when the structure matches', async () => {
    const { db, env, deploy } = await setup();
    await deploy();
    const adopt = () =>
      exec(process.execPath, [require.resolve('tsx/cli'), path.join(source, 'adopt-current-schema.ts')], { env });
    const name = '20260909000000_align_current_schema';
    const sql = await readFile(path.join(source, 'migrations', name, 'migration.sql'), 'utf8');
    expect(sql).toContain('avatarKey');
    const [original] = await db.$queryRaw<
      { checksum: string }[]
    >`SELECT checksum FROM "_prisma_migrations" WHERE migration_name = ${name}`;
    await db.$executeRaw`UPDATE "_prisma_migrations" SET checksum = 'modified' WHERE migration_name = ${name}`;
    await expect(adopt()).rejects.toBeDefined();
    await db.$executeRaw`UPDATE "_prisma_migrations" SET checksum = ${original.checksum}, finished_at = NULL WHERE migration_name = ${name}`;
    await expect(adopt()).rejects.toBeDefined();
  }, 30_000);
});
