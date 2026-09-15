import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const compose = (...args) => {
  const result = spawnSync('docker', ['compose', '--profile', 'app', ...args], { cwd, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
};

// A fresh one-off migration is mandatory on every release, including redeploys.
compose('build', 'migrate', 'api', 'web');
compose('up', '-d', '--wait', 'postgres', 'redis');
compose('run', '--rm', '--no-deps', 'migrate');
// Only replace application containers after this release's migration succeeded.
compose('up', '-d', '--no-deps', 'api', 'web');
