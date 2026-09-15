import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import OSS from 'ali-oss';
import type { AppConfig } from '../config.js';

export interface StoragePort {
  save(file: Express.Multer.File): Promise<{ key: string; url: string }>;
  signedUrl(key: string): Promise<string>;
  /** Object metadata, or null when the key holds no object. */
  stat(key: string): Promise<{ size: number } | null>;
}

export interface OssClient {
  put(name: string, file: string, options?: { mime?: string }): Promise<unknown>;
  signatureUrl(name: string, options?: { expires?: number; method?: 'GET' }): string;
  head(name: string): Promise<{ res?: { headers?: object } }>;
}

const objectKey = (prefix: string, originalName: string) => {
  const directory = prefix.replace(/^\/+|\/+$/g, '');
  const filename = `${crypto.randomUUID()}${path.extname(originalName).toLowerCase()}`;
  return directory ? `${directory}/${filename}` : filename;
};

export class LocalStorageAdapter implements StoragePort {
  private readonly root: string;

  constructor(uploadDir: string) {
    this.root = path.resolve(uploadDir);
    fs.mkdirSync(this.root, { recursive: true });
  }

  async save(file: Express.Multer.File) {
    const key = `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`;
    await fs.promises.rename(file.path, path.join(this.root, key));
    return { key, url: `/uploads/${key}` };
  }

  async signedUrl(key: string) {
    return `/uploads/${encodeURIComponent(key)}`;
  }

  async stat(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) return null;
    try {
      const info = await fs.promises.stat(target);
      return { size: info.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}

export class AliyunOssStorageAdapter implements StoragePort {
  constructor(
    private readonly client: OssClient,
    private readonly prefix: string,
    private readonly signedUrlExpiresSec: number,
  ) {}

  async save(file: Express.Multer.File) {
    const key = objectKey(this.prefix, file.originalname);
    await this.client.put(key, file.path, { mime: file.mimetype || 'model/3mf' });
    return { key, url: await this.signedUrl(key) };
  }

  async signedUrl(key: string) {
    return this.client.signatureUrl(key, { expires: this.signedUrlExpiresSec, method: 'GET' });
  }

  async stat(key: string) {
    try {
      const response = await this.client.head(key);
      const headers = response?.res?.headers as Record<string, unknown> | undefined;
      return { size: Number(headers?.['content-length'] ?? 0) };
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404 || (error as Error).name === 'NoSuchKeyError') return null;
      throw error;
    }
  }
}

export function createStorage(config: AppConfig): StoragePort {
  if (config.STORAGE_PROVIDER === 'local') return new LocalStorageAdapter(config.UPLOAD_DIR);

  const client = new OSS({
    region: config.OSS_REGION!,
    bucket: config.OSS_BUCKET!,
    accessKeyId: config.OSS_ACCESS_KEY_ID!,
    accessKeySecret: config.OSS_ACCESS_KEY_SECRET!,
    ...(config.OSS_ENDPOINT ? { endpoint: config.OSS_ENDPOINT } : {}),
    internal: config.OSS_INTERNAL,
    secure: true,
    authorizationV4: true,
  });
  return new AliyunOssStorageAdapter(client, config.OSS_PREFIX, config.OSS_SIGNED_URL_EXPIRES_SEC);
}
