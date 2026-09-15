import { createRequire } from 'node:module';
import { describe, expect, test, vi } from 'vitest';
import { AliyunPnvsGateway, createPnvsGateway } from './aliyun-pnvs-gateway.js';

const options = { signName: 'System sign', templateCode: '100001', interval: 60 };

describe('Aliyun PNVS gateway', () => {
  test('sends the local code with matching validity and never returns a code', async () => {
    const send = vi.fn().mockResolvedValue({ body: { code: 'OK', success: true, model: { verifyCode: '123456' } } });
    const gateway = new AliyunPnvsGateway({ send }, options);
    await expect(gateway.send('13900001234', '123456')).resolves.toEqual({});
    expect(send).toHaveBeenCalledWith({
      phoneNumber: '13900001234',
      countryCode: '86',
      signName: 'System sign',
      templateCode: '100001',
      templateParam: JSON.stringify({ code: '123456', min: '5' }),
      validTime: 300,
      interval: 60,
      returnVerifyCode: false,
    });
  });

  test.each([{}, { body: { code: 'OK', success: false } }, { body: { code: 'DENIED', success: true } }])(
    'rejects incomplete or unsuccessful responses %j',
    async (response) => {
      const gateway = new AliyunPnvsGateway({ send: vi.fn().mockResolvedValue(response) }, options);
      await expect(gateway.send('13900001234', '123456')).rejects.toMatchObject({ status: 502 });
    },
  );

  test('sanitizes SDK exceptions that could contain credentials and codes', async () => {
    const error = Object.assign(new Error('secret-key 123456'), {
      code: 'Forbidden.NoPermission',
      statusCode: 403,
      requestId: 'safe-request-id',
    });
    const gateway = new AliyunPnvsGateway({ send: vi.fn().mockRejectedValue(error) }, options);
    await expect(gateway.send('13900001234', '123456')).rejects.toMatchObject({
      status: 502,
      message: '短信认证服务请求失败，请稍后重试',
      details: {
        providerCode: 'Forbidden.NoPermission',
        providerStatus: 403,
        requestId: 'safe-request-id',
      },
    });
  });

  test('constructs the installed SDK request model and disables automatic retries', async () => {
    const sdk = createRequire(import.meta.url)(
      '@alicloud/dypnsapi20170525',
    ) as typeof import('@alicloud/dypnsapi20170525');
    const send = vi
      .spyOn(sdk.default.prototype, 'sendSmsVerifyCodeWithOptions')
      .mockResolvedValue({ body: { code: 'OK', success: true } } as never);
    try {
      const gateway = createPnvsGateway({
        ALIYUN_PNVS_ACCESS_KEY_ID: 'test-id',
        ALIYUN_PNVS_ACCESS_KEY_SECRET: 'test-secret',
        ALIYUN_PNVS_SIGN_NAME: options.signName,
        ALIYUN_PNVS_TEMPLATE_CODE: options.templateCode,
        OTP_RESEND_COOLDOWN_SEC: 60,
      } as never);
      await gateway.send('13900001234', '123456');
      expect(send.mock.calls[0][0]).toBeInstanceOf(sdk.SendSmsVerifyCodeRequest);
      expect(send.mock.calls[0][1]).toMatchObject({ autoretry: false, connectTimeout: 5000, readTimeout: 10000 });
    } finally {
      send.mockRestore();
    }
  });
});
