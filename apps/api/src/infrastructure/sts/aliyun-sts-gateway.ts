import { createRequire } from 'node:module';
import type { AppConfig } from '../../config.js';
import { AppError } from '../../core/errors.js';

/** Temporary credentials returned by Aliyun STS AssumeRole. */
export interface StsCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  /** ISO-8601 expiry timestamp of the credentials. */
  expiration: string;
}

/**
 * Port consumed by the application layer so the service can be unit-tested
 * without the SDK, mirroring {@link StoragePort}.
 */
export interface StsGatewayPort {
  assumeRole(sessionName: string): Promise<StsCredentials>;
}

/**
 * Structural subset of the Aliyun STS client. Defining our own interface keeps
 * this module independent of the SDK's model classes (which carry instance
 * methods that make plain objects non-assignable) and lets the unit tests mock
 * the client with plain objects.
 */
export interface AliyunStsClient {
  assumeRole(request: {
    roleArn: string;
    roleSessionName: string;
    durationSeconds?: number;
    policy?: string;
  }): Promise<{ body?: { credentials?: Partial<StsCredentials> } }>;
}

export interface AliyunStsGatewayOptions {
  roleArn: string;
  durationSeconds: number;
  /** Inline policy further restricting the assumed role to uploads only. */
  policy: string;
}

/**
 * STS gateway backed by Aliyun STS AssumeRole. Provider failures (network,
 * signing, malformed response) surface as 502 so callers can tell a dependency
 * outage from a bad request.
 */
export class AliyunStsGateway implements StsGatewayPort {
  constructor(
    private readonly client: AliyunStsClient,
    private readonly options: AliyunStsGatewayOptions,
  ) {}

  async assumeRole(sessionName: string) {
    let response: Awaited<ReturnType<AliyunStsClient['assumeRole']>>;
    try {
      response = await this.client.assumeRole({
        roleArn: this.options.roleArn,
        roleSessionName: sessionName,
        durationSeconds: this.options.durationSeconds,
        policy: this.options.policy,
      });
    } catch (error) {
      throw new AppError(502, 'DEPENDENCY_UNAVAILABLE', `获取上传凭证失败：${(error as Error).message}`);
    }
    const credentials = response?.body?.credentials;
    if (
      !credentials?.accessKeyId ||
      !credentials?.accessKeySecret ||
      !credentials?.securityToken ||
      !credentials?.expiration
    ) {
      throw new AppError(502, 'DEPENDENCY_UNAVAILABLE', '获取上传凭证失败：STS 返回内容不完整');
    }
    return {
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      securityToken: credentials.securityToken,
      expiration: credentials.expiration,
    };
  }
}

/**
 * Build the STS gateway from config. Reuses the OSS RAM user keys to sign the
 * AssumeRole call; the assumed role plus the inline policy below constrain the
 * issued credentials to PutObject on the model prefix only (downloads keep
 * going through server-signed URLs).
 */
export function createStsGateway(config: AppConfig): AliyunStsGateway {
  const { OSS_STS_ROLE_ARN, OSS_STS_DURATION_SEC, OSS_STS_ENDPOINT, OSS_BUCKET, OSS_PREFIX } = config;
  if (!OSS_STS_ROLE_ARN || !OSS_BUCKET || !config.OSS_ACCESS_KEY_ID || !config.OSS_ACCESS_KEY_SECRET)
    throw new AppError(501, 'DEPENDENCY_UNAVAILABLE', '阿里云 STS 上传凭证未配置');
  // The SDK ships as CommonJS (`exports.default = Client`) whose ESM namespace
  // import is not itself a constructor, so load it via require and read the
  // `default` export, exactly like the dysmsapi client in gateways.ts.
  const cjsRequire = createRequire(import.meta.url);
  const stsModule = cjsRequire('@alicloud/sts20150401') as {
    default: new (config: unknown) => { assumeRole(request: unknown): Promise<unknown> };
    AssumeRoleRequest: new (map: Record<string, unknown>) => unknown;
  };
  const client = new stsModule.default({
    accessKeyId: config.OSS_ACCESS_KEY_ID,
    accessKeySecret: config.OSS_ACCESS_KEY_SECRET,
    endpoint: OSS_STS_ENDPOINT ?? `sts.${config.OSS_REGION?.replace(/^oss-/, '')}.aliyuncs.com`,
  });
  // Unlike dysmsapi, the STS client calls request.validate() and therefore only
  // accepts its own AssumeRoleRequest model instance; adapt plain request
  // objects here so the gateway (and its tests) stay SDK-agnostic.
  const stsClient: AliyunStsClient = {
    assumeRole: (request) =>
      client.assumeRole(new stsModule.AssumeRoleRequest(request)) as Promise<{
        body?: { credentials?: Partial<StsCredentials> };
      }>,
  };
  const policy = JSON.stringify({
    Version: '1',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['oss:PutObject'],
        Resource: [`acs:oss:*:*:${OSS_BUCKET}/${OSS_PREFIX}/*`],
      },
    ],
  });
  return new AliyunStsGateway(stsClient, {
    roleArn: OSS_STS_ROLE_ARN,
    durationSeconds: OSS_STS_DURATION_SEC,
    policy,
  });
}
