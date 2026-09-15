import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { AliyunOssStorageAdapter, LocalStorageAdapter, type OssClient } from './storage.js';

const file = {
  originalname: 'bracket.3MF',
  path: '/tmp/upload-1',
  mimetype: 'model/3mf',
} as Express.Multer.File;

describe('AliyunOssStorageAdapter', () => {
  test('uploads a model under the configured prefix and returns a signed URL', async () => {
    const client: OssClient = {
      put: vi.fn().mockResolvedValue({}),
      signatureUrl: vi.fn().mockReturnValue('https://bucket.oss-cn-hangzhou.aliyuncs.com/signed'),
      head: vi.fn(),
    };
    const storage = new AliyunOssStorageAdapter(client, '/models/', 600);

    const result = await storage.save(file);

    expect(result.key).toMatch(/^models\/[0-9a-f-]+\.3mf$/);
    expect(path.extname(result.key)).toBe('.3mf');
    expect(client.put).toHaveBeenCalledWith(result.key, file.path, { mime: 'model/3mf' });
    expect(client.signatureUrl).toHaveBeenCalledWith(result.key, { expires: 600, method: 'GET' });
    expect(result.url).toContain('aliyuncs.com');
  });

  test('generates a fresh signed URL without changing the stored key', async () => {
    const client: OssClient = {
      put: vi.fn(),
      signatureUrl: vi.fn().mockReturnValue('https://example.test/signed'),
      head: vi.fn(),
    };
    const storage = new AliyunOssStorageAdapter(client, 'models', 120);

    await expect(storage.signedUrl('models/existing.3mf')).resolves.toBe('https://example.test/signed');
    expect(client.signatureUrl).toHaveBeenCalledWith('models/existing.3mf', { expires: 120, method: 'GET' });
  });

  test('reports object size from the head response', async () => {
    const client: OssClient = {
      put: vi.fn(),
      signatureUrl: vi.fn(),
      head: vi.fn().mockResolvedValue({ res: { headers: { 'content-length': '2048' } } }),
    };
    const storage = new AliyunOssStorageAdapter(client, 'models', 600);

    await expect(storage.stat('models/existing.3mf')).resolves.toEqual({ size: 2048 });
    expect(client.head).toHaveBeenCalledWith('models/existing.3mf');
  });

  test('treats a missing object as null but rethrows other head failures', async () => {
    const missing: OssClient = {
      put: vi.fn(),
      signatureUrl: vi.fn(),
      head: vi.fn().mockRejectedValue(Object.assign(new Error('not found'), { status: 404 })),
    };
    const broken: OssClient = {
      put: vi.fn(),
      signatureUrl: vi.fn(),
      head: vi.fn().mockRejectedValue(new Error('network down')),
    };

    await expect(new AliyunOssStorageAdapter(missing, 'models', 600).stat('models/gone.3mf')).resolves.toBeNull();
    await expect(new AliyunOssStorageAdapter(broken, 'models', 600).stat('models/x.3mf')).rejects.toThrow(
      'network down',
    );
  });
});

describe('LocalStorageAdapter', () => {
  test('reports the size of a saved object and null for missing or escaped keys', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printlink-storage-'));
    try {
      const tempFile = path.join(dir, 'upload-1');
      fs.writeFileSync(tempFile, 'printlink');
      const storage = new LocalStorageAdapter(dir);
      const saved = await storage.save({ ...file, path: tempFile });

      await expect(storage.stat(saved.key)).resolves.toEqual({ size: 'printlink'.length });
      await expect(storage.stat(`${crypto.randomUUID()}.3mf`)).resolves.toBeNull();
      await expect(storage.stat('../escape.3mf')).resolves.toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
