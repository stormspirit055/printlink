import type { Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { DemandService } from './application/backend-services.js';
import { LocalStorageAdapter } from './infrastructure/storage.js';

let server: Server;
let baseUrl: string;
let uploadDir: string;
const key = '12345678-1234-1234-1234-123456789abc.3mf';
const findUnique = vi.fn();
const findMany = vi.fn();

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/printlink_test';
  process.env.REDIS_URL = 'redis://localhost:6379/15';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters';
  const { createApp, container } = await import('./app.js');
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'printlink-access-'));
  await fs.writeFile(path.join(uploadDir, key), 'private-model');
  vi.spyOn(container.authService, 'resolveSession').mockImplementation(async (token) => {
    if (!['owner', 'other', 'admin'].includes(token ?? '')) return null;
    return { id: token!, role: token === 'admin' ? 'ADMIN' : 'USER' } as never;
  });
  const app = createApp({
    ...container,
    config: { ...container.config, STORAGE_PROVIDER: 'local', UPLOAD_DIR: uploadDir },
    demandService: new DemandService({ demand: { findUnique, findMany } } as never, new LocalStorageAdapter(uploadDir)),
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  const { container } = await import('./app.js');
  await container.close();
  vi.restoreAllMocks();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

test.each(['/api/demands/private-id', `/uploads/${key}`])(
  'anonymous and expired sessions cannot access %s',
  async (url) => {
    for (const cookie of ['', 'pl_session=expired']) {
      const response = await fetch(`${baseUrl}${url}`, { headers: { Cookie: cookie } });
      expect(response.status).toBe(401);
    }
  },
);

for (const status of ['OPEN', 'QUOTED', 'PENDING_REVIEW', 'REJECTED', 'CANCELLED', 'MATCHED']) {
  test.each(['owner', 'other', 'admin'])(
    `${status}: %s detail and local download permissions match`,
    async (viewer) => {
      const demand = {
        id: 'demand',
        userId: 'owner',
        status,
        modelKey: key,
        budget: 20,
        user: { nickname: 'Owner' },
        demandActions: [],
      };
      findUnique.mockResolvedValue(demand);
      findMany.mockResolvedValue([demand]);
      const expected = viewer !== 'other' || ['OPEN', 'QUOTED'].includes(status) ? 200 : 404;
      for (const url of ['/api/demands/demand', `/uploads/${key}`]) {
        const response = await fetch(`${baseUrl}${url}`, { headers: { Cookie: `pl_session=${viewer}` } });
        expect(response.status).toBe(expected);
        if (expected === 200) {
          expect(response.headers.get('cache-control')).toContain('no-store');
          if (url.startsWith('/uploads')) expect(await response.text()).toBe('private-model');
          else expect((await response.json()).modelUrl).toBe(`/uploads/${key}`);
        }
      }
    },
  );
}

test.each(['/uploads/.tmp/file.3mf', '/uploads/%2e%2e%2f.env', '/uploads/unknown.txt'])(
  'upload directory does not expose %s',
  async (url) => {
    expect((await fetch(`${baseUrl}${url}`, { headers: { Cookie: 'pl_session=admin' } })).status).toBe(404);
  },
);

test('live health endpoint reports ok', async () => {
  const response = await fetch(`${baseUrl}/health/live`);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'ok' });
});

test('anonymous session endpoint preserves the public contract', async () => {
  const response = await fetch(`${baseUrl}/api/me`);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ user: null });
});

test('private demand listing requires authentication', async () => {
  const response = await fetch(`${baseUrl}/api/demands?mine=another-user-id`);
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: '请先登录' });
});

test('upload credentials require authentication', async () => {
  const response = await fetch(`${baseUrl}/api/uploads/credentials`);
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: '请先登录' });
});

test.each(['/api/orders', '/api/orders/order-1/payment', '/api/payments/sandbox/order-1/confirm'])(
  'inactive transaction endpoint %s is not exposed',
  async (path) => {
    const response = await fetch(`${baseUrl}${path}`, { method: path === '/api/orders' ? 'GET' : 'POST' });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ code: 'RESOURCE_NOT_FOUND', error: '接口不存在' });
  },
);
