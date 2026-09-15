import { AppError } from '../../core/errors.js';
import type { OtpGateway } from '../gateways.js';

/**
 * Structural subset of the Aliyun dysmsapi client. Defining our own interface
 * keeps this module independent of the SDK's model classes (which carry
 * instance methods that make plain objects non-assignable) and lets the unit
 * tests mock the client with plain objects.
 */
export interface AliyunSmsClient {
  sendSms(request: {
    phoneNumbers: string;
    signName: string;
    templateCode: string;
    templateParam: string;
  }): Promise<{ body?: { code?: string; message?: string; bizId?: string } }>;
}

export interface AliyunSmsGatewayOptions {
  signName: string;
  templateCode: string;
}

/**
 * SMS OTP gateway backed by Aliyun Dysms. The template is expected to declare a
 * single `${code}` variable. A provider business error (body.code !== 'OK') is
 * surfaced as a 502 so callers can tell a misconfiguration from a bad request.
 */
export class AliyunSmsGateway implements OtpGateway {
  constructor(
    private readonly client: AliyunSmsClient,
    private readonly options: AliyunSmsGatewayOptions,
  ) {}

  async send(phone: string, code: string) {
    const response = await this.client.sendSms({
      phoneNumbers: phone,
      signName: this.options.signName,
      templateCode: this.options.templateCode,
      templateParam: JSON.stringify({ code }),
    });
    if (response?.body?.code !== 'OK') {
      throw new AppError(
        502,
        'DEPENDENCY_UNAVAILABLE',
        `短信发送失败：${response?.body?.message ?? response?.body?.code ?? '未知错误'}`,
      );
    }
    return {};
  }
}
