import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4311),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  COOKIE_SECURE: z.preprocess(
    (value) => (value === undefined ? undefined : value === true || value === 'true'),
    z.boolean().optional(),
  ),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  OTP_PROVIDER: z.enum(['console', 'aliyun', 'aliyun-pnvs', 'tencent']).default('console'),
  ALIYUN_PNVS_ACCESS_KEY_ID: z.string().optional(),
  ALIYUN_PNVS_ACCESS_KEY_SECRET: z.string().optional(),
  ALIYUN_PNVS_SIGN_NAME: z.string().optional(),
  ALIYUN_PNVS_TEMPLATE_CODE: z.string().optional(),
  // Aliyun Dysms credentials (required only when OTP_PROVIDER=aliyun).
  ALIYUN_SMS_ACCESS_KEY_ID: z.string().optional(),
  ALIYUN_SMS_ACCESS_KEY_SECRET: z.string().optional(),
  ALIYUN_SMS_SIGN_NAME: z.string().optional(),
  ALIYUN_SMS_TEMPLATE_CODE: z.string().optional(),
  // Tencent Cloud SMS credentials (required only when OTP_PROVIDER=tencent).
  TENCENT_SMS_SECRET_ID: z.string().optional(),
  TENCENT_SMS_SECRET_KEY: z.string().optional(),
  TENCENT_SMS_SDK_APP_ID: z.string().optional(),
  TENCENT_SMS_SIGN_NAME: z.string().optional(),
  TENCENT_SMS_TEMPLATE_ID: z.string().optional(),
  // Comma-separated dev-phone bypass list. Only honoured when NODE_ENV!=='production';
  // ignored in production even if set, so it stays a dev-only convenience.
  DEV_LOGIN_PHONES: z.string().default(''),
  // Per-phone resend cooldown in seconds; guards against SMS cost abuse on top of
  // the IP rate limiter.
  OTP_RESEND_COOLDOWN_SEC: z.coerce.number().int().min(10).max(600).default(60),
  STORAGE_PROVIDER: z.enum(['local', 'oss']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  OSS_REGION: z.string().optional(),
  OSS_BUCKET: z.string().optional(),
  OSS_ACCESS_KEY_ID: z.string().optional(),
  OSS_ACCESS_KEY_SECRET: z.string().optional(),
  // STS direct-upload credentials are issued per request via AssumeRole; there
  // is deliberately no static token option.
  OSS_STS_ROLE_ARN: z.string().optional(),
  OSS_STS_SESSION_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9.@_-]{2,64}$/)
    .default('printlink-upload'),
  OSS_STS_DURATION_SEC: z.coerce.number().int().min(900).max(3600).default(3600),
  OSS_STS_ENDPOINT: z.string().optional(),
  OSS_ENDPOINT: z.string().optional(),
  OSS_INTERNAL: z.preprocess((value) => value === true || value === 'true', z.boolean()).default(false),
  OSS_PREFIX: z.string().default('models'),
  OSS_SIGNED_URL_EXPIRES_SEC: z.coerce.number().int().min(60).max(3600).default(600),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(200).default(50),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
});

export type AppConfig = z.infer<typeof schema>;
export const config: AppConfig = schema.parse(process.env);

if (config.OTP_PROVIDER === 'aliyun-pnvs') {
  const missing = [
    !config.ALIYUN_PNVS_ACCESS_KEY_ID && 'ALIYUN_PNVS_ACCESS_KEY_ID',
    !config.ALIYUN_PNVS_ACCESS_KEY_SECRET && 'ALIYUN_PNVS_ACCESS_KEY_SECRET',
    !config.ALIYUN_PNVS_SIGN_NAME && 'ALIYUN_PNVS_SIGN_NAME',
    !config.ALIYUN_PNVS_TEMPLATE_CODE && 'ALIYUN_PNVS_TEMPLATE_CODE',
  ].filter(Boolean);
  if (missing.length) throw new Error(`SMS authentication credentials are not configured: ${missing.join(', ')}`);
}

if (config.STORAGE_PROVIDER === 'oss') {
  const missing = [
    !config.OSS_REGION && 'OSS_REGION',
    !config.OSS_BUCKET && 'OSS_BUCKET',
    !config.OSS_ACCESS_KEY_ID && 'OSS_ACCESS_KEY_ID',
    !config.OSS_ACCESS_KEY_SECRET && 'OSS_ACCESS_KEY_SECRET',
    !config.OSS_STS_ROLE_ARN && 'OSS_STS_ROLE_ARN',
  ].filter(Boolean);
  if (missing.length) throw new Error(`OSS credentials are not configured: ${missing.join(', ')}`);
}

if (config.NODE_ENV === 'production') {
  const unsafe = [
    config.OTP_PROVIDER === 'console' && 'OTP_PROVIDER',
    config.STORAGE_PROVIDER === 'local' && 'STORAGE_PROVIDER',
  ].filter(Boolean);
  if (unsafe.length) throw new Error(`Production providers are not configured: ${unsafe.join(', ')}`);

  const missingSms: string[] = [];
  if (config.OTP_PROVIDER === 'aliyun') {
    if (!config.ALIYUN_SMS_ACCESS_KEY_ID) missingSms.push('ALIYUN_SMS_ACCESS_KEY_ID');
    if (!config.ALIYUN_SMS_ACCESS_KEY_SECRET) missingSms.push('ALIYUN_SMS_ACCESS_KEY_SECRET');
    if (!config.ALIYUN_SMS_SIGN_NAME) missingSms.push('ALIYUN_SMS_SIGN_NAME');
    if (!config.ALIYUN_SMS_TEMPLATE_CODE) missingSms.push('ALIYUN_SMS_TEMPLATE_CODE');
  } else if (config.OTP_PROVIDER === 'tencent') {
    if (!config.TENCENT_SMS_SECRET_ID) missingSms.push('TENCENT_SMS_SECRET_ID');
    if (!config.TENCENT_SMS_SECRET_KEY) missingSms.push('TENCENT_SMS_SECRET_KEY');
    if (!config.TENCENT_SMS_SDK_APP_ID) missingSms.push('TENCENT_SMS_SDK_APP_ID');
    if (!config.TENCENT_SMS_SIGN_NAME) missingSms.push('TENCENT_SMS_SIGN_NAME');
    if (!config.TENCENT_SMS_TEMPLATE_ID) missingSms.push('TENCENT_SMS_TEMPLATE_ID');
  }
  if (missingSms.length) throw new Error(`SMS provider credentials are not configured: ${missingSms.join(', ')}`);
}
