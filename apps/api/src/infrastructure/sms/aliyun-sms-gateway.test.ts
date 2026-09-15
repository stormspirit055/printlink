import { describe, expect, test, vi } from 'vitest';
import { AliyunSmsGateway, type AliyunSmsClient } from './aliyun-sms-gateway.js';

const makeClient = (response: { body?: { code?: string; message?: string } }): AliyunSmsClient =>
  ({ sendSms: vi.fn().mockResolvedValue(response) }) as unknown as AliyunSmsClient;

describe('AliyunSmsGateway', () => {
  test('sends phone, sign name, template code and a JSON {code} template param', async () => {
    const client = makeClient({ body: { code: 'OK' } });
    const gateway = new AliyunSmsGateway(client, { signName: '印蛙', templateCode: 'SMS_123' });
    await gateway.send('13900001234', '123456');
    expect(client.sendSms).toHaveBeenCalledWith({
      phoneNumbers: '13900001234',
      signName: '印蛙',
      templateCode: 'SMS_123',
      templateParam: JSON.stringify({ code: '123456' }),
    });
  });

  test('returns no devCode on success', async () => {
    const gateway = new AliyunSmsGateway(makeClient({ body: { code: 'OK' } }), {
      signName: 's',
      templateCode: 't',
    });
    await expect(gateway.send('13900001234', '123456')).resolves.toEqual({});
  });

  test('throws 502 when the provider reports a business error', async () => {
    const gateway = new AliyunSmsGateway(
      makeClient({ body: { code: 'isv.BUSINESS_LIMIT_CONTROL', message: '频率过高' } }),
      { signName: 's', templateCode: 't' },
    );
    await expect(gateway.send('13900001234', '123456')).rejects.toMatchObject({
      status: 502,
      code: 'DEPENDENCY_UNAVAILABLE',
      message: '短信发送失败：频率过高',
    });
  });

  test('throws 502 when the response body is missing', async () => {
    const gateway = new AliyunSmsGateway(makeClient({}), { signName: 's', templateCode: 't' });
    await expect(gateway.send('13900001234', '123456')).rejects.toMatchObject({ status: 502 });
  });
});
