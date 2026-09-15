import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const failure of ['', 'build', 'dependencies', 'migrate']) {
  test(`deployment gate: ${failure || 'success'}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), 'printlink-deploy-'));
    const log = join(temp, 'calls.jsonl');
    try {
      await writeFile(
        join(temp, 'docker'),
        `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DEPLOY_TEST_LOG, JSON.stringify(args) + '\\n');
const stage = args.includes('build') ? 'build' : args.includes('run') ? 'migrate' : args.includes('--wait') ? 'dependencies' : 'app';
process.exit(process.env.DEPLOY_TEST_FAILURE === stage ? 23 : 0);
`,
        { mode: 0o755 },
      );
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('deploy.mjs', import.meta.url))], {
        env: {
          ...process.env,
          PATH: `${temp}:${process.env.PATH}`,
          DEPLOY_TEST_LOG: log,
          DEPLOY_TEST_FAILURE: failure,
        },
        encoding: 'utf8',
      });
      const calls = (await readFile(log, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.equal(result.status, failure ? 23 : 0, result.stderr);
      const startsApp = calls.some((args) => args.includes('up') && args.includes('api'));
      assert.equal(startsApp, !failure);
      if (!failure) {
        assert.deepEqual(calls[2], ['compose', '--profile', 'app', 'run', '--rm', '--no-deps', 'migrate']);
        assert.equal(calls.length, 4);
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
}
