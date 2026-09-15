import { createRequire } from 'node:module';
import type { AppConfig } from '../../config.js';
import { AppError } from '../../core/errors.js';
import type { OtpGateway } from '../gateways.js';

export interface PnvsRequest {
  phoneNumber: string;
  countryCode: string;
  signName: string;
  templateCode: string;
  templateParam: string;
  validTime: number;
  interval: number;
  returnVerifyCode: boolean;
}

export interface PnvsClient {
  send(request: PnvsRequest): Promise<{ body?: { code?: string; success?: boolean; requestId?: string } }>;
}

export class AliyunPnvsGateway implements OtpGateway {
  constructor(
    private readonly client: PnvsClient,
    private readonly options: { signName: string; templateCode: string; interval: number },
  ) {}

  async send(phone: string, code: string) {
    let response;
    try {
      response = await this.client.send({
        phoneNumber: phone,
        countryCode: '86',
        signName: this.options.signName,
        templateCode: this.options.templateCode,
        // Explicit codes are verified by PrintLink's Redis flow, not CheckSmsVerifyCode.
        templateParam: JSON.stringify({ code, min: '5' }),
        validTime: 300,
        interval: this.options.interval,
        returnVerifyCode: false,
      });
    } catch (error) {
      // SDK errors can contain signed requests; do not expose them to HTTP logs or clients.
      const sdkError = error as {
        code?: unknown;
        statusCode?: unknown;
        requestId?: unknown;
        data?: { Code?: unknown; RequestId?: unknown };
      };
      const providerCode = sdkError.code ?? sdkError.data?.Code;
      const requestId = sdkError.requestId ?? sdkError.data?.RequestId;
      throw new AppError(502, 'DEPENDENCY_UNAVAILABLE', '短信认证服务请求失败，请稍后重试', {
        ...(typeof providerCode === 'string' ? { providerCode } : {}),
        ...(typeof sdkError.statusCode === 'number' ? { providerStatus: sdkError.statusCode } : {}),
        ...(typeof requestId === 'string' ? { requestId } : {}),
      });
    }
    if (response.body?.code !== 'OK' || response.body.success !== true)
      throw new AppError(502, 'DEPENDENCY_UNAVAILABLE', '短信认证发送失败，请检查服务配置', {
        providerCode: response.body?.code,
        requestId: response.body?.requestId,
      });
    return {};
  }
}

export function createPnvsGateway(config: AppConfig): AliyunPnvsGateway {
  if (
    !config.ALIYUN_PNVS_ACCESS_KEY_ID ||
    !config.ALIYUN_PNVS_ACCESS_KEY_SECRET ||
    !config.ALIYUN_PNVS_SIGN_NAME ||
    !config.ALIYUN_PNVS_TEMPLATE_CODE
  )
    throw new AppError(501, 'DEPENDENCY_UNAVAILABLE', '阿里云短信认证凭证未配置');
  const require = createRequire(import.meta.url);
  const sdk = require('@alicloud/dypnsapi20170525') as typeof import('@alicloud/dypnsapi20170525');
  const openapi = require('@alicloud/openapi-client') as typeof import('@alicloud/openapi-client');
  const tea = require('@alicloud/tea-util') as typeof import('@alicloud/tea-util');
  const client = new sdk.default(
    new openapi.Config({
      accessKeyId: config.ALIYUN_PNVS_ACCESS_KEY_ID,
      accessKeySecret: config.ALIYUN_PNVS_ACCESS_KEY_SECRET,
      endpoint: 'dypnsapi.aliyuncs.com',
    }),
  );
  return new AliyunPnvsGateway(
    {
      send: (request) =>
        client.sendSmsVerifyCodeWithOptions(
          new sdk.SendSmsVerifyCodeRequest(request),
          new tea.RuntimeOptions({ connectTimeout: 5000, readTimeout: 10000, autoretry: false }),
        ),
    },
    {
      signName: config.ALIYUN_PNVS_SIGN_NAME,
      templateCode: config.ALIYUN_PNVS_TEMPLATE_CODE,
      interval: config.OTP_RESEND_COOLDOWN_SEC,
    },
  );
}
