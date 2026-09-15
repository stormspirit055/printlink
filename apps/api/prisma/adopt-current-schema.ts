import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const root = fileURLToPath(new URL('.', import.meta.url));
const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const schemaPath = `${root}schema.prisma`;
const prisma = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
const db = new PrismaClient();

try {
  // Adoption records history only. Refuse drift instead of silently skipping SQL.
  prisma('migrate', 'diff', '--from-schema-datasource', schemaPath, '--to-schema-datamodel', schemaPath, '--exit-code');
  const migrations = (await readdir(`${root}migrations`, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const checksums = new Map(
    await Promise.all(
      migrations.map(
        async (name) =>
          [
            name,
            createHash('sha256')
              .update(await readFile(`${root}migrations/${name}/migration.sql`))
              .digest('hex'),
          ] as const,
      ),
    ),
  );
  const [{ exists }] = await db.$queryRaw<
    { exists: boolean }[]
  >`SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS "exists"`;
  const history = exists
    ? await db.$queryRaw<
        { migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }[]
      >`
        SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`
    : [];
  const applied = new Set<string>();
  for (const row of history) {
    if (row.rolled_back_at) continue;
    if (!row.finished_at || checksums.get(row.migration_name) !== row.checksum)
      throw new Error(`Migration history requires manual review: ${row.migration_name}`);
    applied.add(row.migration_name);
  }
  for (const migration of migrations) {
    if (!applied.has(migration)) prisma('migrate', 'resolve', '--applied', migration, '--schema', schemaPath);
  }
  prisma('migrate', 'status', '--schema', schemaPath);
  console.info('Current schema adopted without changing business data.');
} finally {
  await db.$disconnect();
}
