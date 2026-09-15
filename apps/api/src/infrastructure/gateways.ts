import { createRequire } from 'node:module';
import { sms as tencentSms } from 'tencentcloud-sdk-nodejs-sms';
import type { AppConfig } from '../config.js';
import { AppError } from '../core/errors.js';
import { AliyunSmsGateway, type AliyunSmsClient } from './sms/aliyun-sms-gateway.js';
import { TencentSmsGateway, type TencentSmsClient } from './sms/tencent-sms-gateway.js';
import { createPnvsGateway } from './sms/aliyun-pnvs-gateway.js';

const cjsRequire = createRequire(import.meta.url);

export interface OtpGateway {
  send(phone: string, code: string): Promise<{ devCode?: string }>;
}

/** Dev gateway: echoes the code back so local flows work without a real SMS channel. */
export class ConsoleOtpGateway implements OtpGateway {
  async send(_phone: string, code: string) {
    return { devCode: code };
  }
}

/**
 * Build the OTP gateway for the configured provider. Cloud SDK clients are cast
 * to the structural {@link AliyunSmsClient}/{@link TencentSmsClient} interfaces:
 * their model classes carry instance methods that make plain request objects
 * non-assignable, but the SDK only reads the request fields we pass at runtime.
 */
export function createOtpGateway(config: AppConfig): OtpGateway {
  switch (config.OTP_PROVIDER) {
    case 'aliyun-pnvs':
      return createPnvsGateway(config);
    case 'console':
      return new ConsoleOtpGateway();
    case 'aliyun': {
      const { ALIYUN_SMS_ACCESS_KEY_ID, ALIYUN_SMS_ACCESS_KEY_SECRET, ALIYUN_SMS_SIGN_NAME, ALIYUN_SMS_TEMPLATE_CODE } =
        config;
      if (
        !ALIYUN_SMS_ACCESS_KEY_ID ||
        !ALIYUN_SMS_ACCESS_KEY_SECRET ||
        !ALIYUN_SMS_SIGN_NAME ||
        !ALIYUN_SMS_TEMPLATE_CODE
      )
        throw new AppError(501, 'DEPENDENCY_UNAVAILABLE', '阿里云短信凭证未配置');
      // The SDK ships as CommonJS (`exports.default = Client`) whose ESM
      // namespace import is not itself a constructor, so load it via require
      // and read the `default` export. Typed loosely because the SDK model
      // classes carry instance methods that reject plain request objects, but
      // the runtime only reads the fields we pass.
      const aliyunModule = cjsRequire('@alicloud/dysmsapi20170525') as { default: unknown };
      const AliyunClient = aliyunModule.default as new (config: unknown) => AliyunSmsClient;
      const client = new AliyunClient({
        accessKeyId: ALIYUN_SMS_ACCESS_KEY_ID,
        accessKeySecret: ALIYUN_SMS_ACCESS_KEY_SECRET,
        endpoint: 'dysmsapi.aliyuncs.com',
      });
      return new AliyunSmsGateway(client, {
        signName: ALIYUN_SMS_SIGN_NAME,
        templateCode: ALIYUN_SMS_TEMPLATE_CODE,
      });
    }
    case 'tencent': {
      const {
        TENCENT_SMS_SECRET_ID,
        TENCENT_SMS_SECRET_KEY,
        TENCENT_SMS_SDK_APP_ID,
        TENCENT_SMS_SIGN_NAME,
        TENCENT_SMS_TEMPLATE_ID,
      } = config;
      if (
        !TENCENT_SMS_SECRET_ID ||
        !TENCENT_SMS_SECRET_KEY ||
        !TENCENT_SMS_SDK_APP_ID ||
        !TENCENT_SMS_SIGN_NAME ||
        !TENCENT_SMS_TEMPLATE_ID
      )
        throw new AppError(501, 'DEPENDENCY_UNAVAILABLE', '腾讯云短信凭证未配置');
      const SmsClient = tencentSms.v20190711.Client;
      const client = new SmsClient({
        credential: { secretId: TENCENT_SMS_SECRET_ID, secretKey: TENCENT_SMS_SECRET_KEY },
        profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com', reqTimeout: 10 } },
      });
      return new TencentSmsGateway(client as unknown as TencentSmsClient, {
        sdkAppId: TENCENT_SMS_SDK_APP_ID,
        signName: TENCENT_SMS_SIGN_NAME,
        templateId: TENCENT_SMS_TEMPLATE_ID,
      });
    }
  }
}
