import { describe, expect, test, vi } from 'vitest';
import { TencentSmsGateway, type TencentSmsClient } from './tencent-sms-gateway.js';

const makeClient = (response: { SendStatusSet?: Array<{ Code?: string; Message?: string }> }): TencentSmsClient =>
  ({ SendSms: vi.fn().mockResolvedValue(response) }) as unknown as TencentSmsClient;

describe('TencentSmsGateway', () => {
  test('sends an E.164 phone, sdk app id, sign, template id and the code as the template param', async () => {
    const client = makeClient({ SendStatusSet: [{ Code: 'Ok' }] });
    const gateway = new TencentSmsGateway(client, {
      sdkAppId: '1400006666',
      signName: '印蛙',
      templateId: '12345',
    });
    await gateway.send('13900001234', '123456');
    expect(client.SendSms).toHaveBeenCalledWith({
      PhoneNumberSet: ['+8613900001234'],
      TemplateID: '12345',
      SmsSdkAppid: '1400006666',
      Sign: '印蛙',
      TemplateParamSet: ['123456'],
    });
  });

  test('returns no devCode on success', async () => {
    const gateway = new TencentSmsGateway(makeClient({ SendStatusSet: [{ Code: 'Ok' }] }), {
      sdkAppId: 'a',
      signName: 's',
      templateId: 't',
    });
    await expect(gateway.send('13900001234', '123456')).resolves.toEqual({});
  });

  test('throws 502 when the provider reports a non-Ok status', async () => {
    const gateway = new TencentSmsGateway(
      makeClient({ SendStatusSet: [{ Code: 'LimitExceeded.PhoneNumberDailyLimit', Message: '超出每日下发限制' }] }),
      { sdkAppId: 'a', signName: 's', templateId: 't' },
    );
    await expect(gateway.send('13900001234', '123456')).rejects.toMatchObject({
      status: 502,
      code: 'DEPENDENCY_UNAVAILABLE',
      message: '短信发送失败：超出每日下发限制',
    });
  });

  test('throws 502 when the status set is empty', async () => {
    const gateway = new TencentSmsGateway(makeClient({ SendStatusSet: [] }), {
      sdkAppId: 'a',
      signName: 's',
      templateId: 't',
    });
    await expect(gateway.send('13900001234', '123456')).rejects.toMatchObject({ status: 502 });
  });
});
