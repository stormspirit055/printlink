import { AppError } from '../../core/errors.js';
import type { OtpGateway } from '../gateways.js';

/**
 * Structural subset of the Tencent Cloud SMS client. See {@link AliyunSmsClient}
 * for the rationale behind a local interface rather than the SDK types.
 */
export interface TencentSmsClient {
  SendSms(request: {
    PhoneNumberSet: string[];
    TemplateID: string;
    SmsSdkAppid: string;
    Sign?: string;
    TemplateParamSet?: string[];
  }): Promise<{ SendStatusSet?: Array<{ Code?: string; Message?: string; SerialNo?: string }> }>;
}

export interface TencentSmsGatewayOptions {
  sdkAppId: string;
  signName: string;
  templateId: string;
}

/**
 * SMS OTP gateway backed by Tencent Cloud SMS. Phone numbers are normalised to
 * E.164 (`+86...`) as the API requires. A provider business error
 * (SendStatusSet[0].Code !== 'Ok') is surfaced as a 502.
 */
export class TencentSmsGateway implements OtpGateway {
  constructor(
    private readonly client: TencentSmsClient,
    private readonly options: TencentSmsGatewayOptions,
  ) {}

  async send(phone: string, code: string) {
    const response = await this.client.SendSms({
      PhoneNumberSet: [`+86${phone}`],
      TemplateID: this.options.templateId,
      SmsSdkAppid: this.options.sdkAppId,
      Sign: this.options.signName,
      TemplateParamSet: [code],
    });
    const status = response?.SendStatusSet?.[0];
    if (status?.Code !== 'Ok') {
      throw new AppError(
        502,
        'DEPENDENCY_UNAVAILABLE',
        `短信发送失败：${status?.Message ?? status?.Code ?? '未知错误'}`,
      );
    }
    return {};
  }
}
