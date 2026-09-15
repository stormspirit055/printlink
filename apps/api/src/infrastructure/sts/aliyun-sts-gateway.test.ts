import { describe, expect, test, vi } from 'vitest';
import { AliyunStsGateway, type AliyunStsClient } from './aliyun-sts-gateway.js';

const credentials = {
  accessKeyId: 'STS.mock-key-id',
  accessKeySecret: 'mock-secret',
  securityToken: 'mock-token',
  expiration: '2026-09-02T12:00:00Z',
};

const makeClient = (response: unknown): AliyunStsClient =>
  ({ assumeRole: vi.fn().mockResolvedValue(response) }) as unknown as AliyunStsClient;

const makeGateway = (client: AliyunStsClient) =>
  new AliyunStsGateway(client, {
    roleArn: 'acs:ram::1234567890:role/printlink-upload',
    durationSeconds: 900,
    policy: '{"Version":"1"}',
  });

describe('AliyunStsGateway', () => {
  test('calls assumeRole with the role ARN, session name, duration and inline policy', async () => {
    const client = makeClient({ body: { credentials } });
    await makeGateway(client).assumeRole('printlink-upload-u1');
    expect(client.assumeRole).toHaveBeenCalledWith({
      roleArn: 'acs:ram::1234567890:role/printlink-upload',
      roleSessionName: 'printlink-upload-u1',
      durationSeconds: 900,
      policy: '{"Version":"1"}',
    });
  });

  test('returns the credentials on success', async () => {
    await expect(makeGateway(makeClient({ body: { credentials } })).assumeRole('s')).resolves.toEqual(credentials);
  });

  test('throws 502 when the credentials in the response are incomplete', async () => {
    const gateway = makeGateway(makeClient({ body: { credentials: { accessKeyId: 'k' } } }));
    await expect(gateway.assumeRole('s')).rejects.toMatchObject({
      status: 502,
      code: 'DEPENDENCY_UNAVAILABLE',
      message: '获取上传凭证失败：STS 返回内容不完整',
    });
  });

  test('throws 502 when the SDK rejects', async () => {
    const client = { assumeRole: vi.fn().mockRejectedValue(new Error('invalid role')) } as unknown as AliyunStsClient;
    await expect(makeGateway(client).assumeRole('s')).rejects.toMatchObject({
      status: 502,
      code: 'DEPENDENCY_UNAVAILABLE',
      message: '获取上传凭证失败：invalid role',
    });
  });
});
