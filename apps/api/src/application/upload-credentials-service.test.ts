import { describe, expect, test, vi } from 'vitest';
import { UploadCredentialsService } from './backend-services.js';
import type { StsGatewayPort } from '../infrastructure/sts/aliyun-sts-gateway.js';

const credentials = {
  accessKeyId: 'STS.mock-key-id',
  accessKeySecret: 'mock-secret',
  securityToken: 'mock-token',
  expiration: '2026-09-02T12:00:00Z',
};

const makeConfig = (overrides: Record<string, unknown> = {}) =>
  ({
    OSS_STS_SESSION_NAME: 'printlink-upload',
    OSS_REGION: 'oss-cn-hangzhou',
    OSS_BUCKET: 'printlink-models',
    OSS_PREFIX: 'models',
    MAX_UPLOAD_MB: 50,
    ...overrides,
  }) as never;

const makeGateway = (): StsGatewayPort & { assumeRole: ReturnType<typeof vi.fn> } => {
  const gateway = { assumeRole: vi.fn().mockResolvedValue(credentials) };
  return gateway as unknown as StsGatewayPort & { assumeRole: ReturnType<typeof vi.fn> };
};

describe('UploadCredentialsService', () => {
  test('issues credentials scoped with a per-user session name plus upload parameters', async () => {
    const gateway = makeGateway();
    const service = new UploadCredentialsService(gateway, makeConfig());
    await expect(service.issue('u1')).resolves.toEqual({
      ...credentials,
      upload: {
        provider: 'oss',
        bucket: 'printlink-models',
        region: 'oss-cn-hangzhou',
        prefix: 'models',
        maxSizeMb: 50,
        allowedExtensions: ['.3mf'],
      },
    });
    expect(gateway.assumeRole).toHaveBeenCalledWith('printlink-upload-u1');
  });

  test('exposes the configured OSS endpoint when set', async () => {
    const service = new UploadCredentialsService(
      makeGateway(),
      makeConfig({ OSS_ENDPOINT: 'https://oss-cn-hangzhou.aliyuncs.com' }),
    );
    const result = await service.issue('u1');
    expect(result.upload).toMatchObject({ endpoint: 'https://oss-cn-hangzhou.aliyuncs.com' });
  });

  test('truncates long session names to the 64-character STS limit', async () => {
    const gateway = makeGateway();
    const service = new UploadCredentialsService(gateway, makeConfig());
    await service.issue('u'.repeat(80));
    expect(gateway.assumeRole).toHaveBeenCalledWith(`printlink-upload-${'u'.repeat(47)}`);
  });

  test('throws 501 when no gateway is configured (local storage provider)', async () => {
    const service = new UploadCredentialsService(undefined, makeConfig());
    await expect(service.issue('u1')).rejects.toMatchObject({
      status: 501,
      code: 'DEPENDENCY_UNAVAILABLE',
      message: '上传凭证服务未配置',
    });
  });

  test('propagates gateway failures', async () => {
    const gateway = { assumeRole: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as StsGatewayPort;
    const service = new UploadCredentialsService(gateway, makeConfig());
    await expect(service.issue('u1')).rejects.toThrow('boom');
  });
});
