import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  AddressService,
  AuthService,
  CatalogService,
  ContactRequestService,
  DemandService,
  InvitationService,
  NotificationService,
  PrinterService,
  UploadCredentialsService,
} from '../application/backend-services.js';
import { config, type AppConfig } from '../config.js';
import { createCache } from '../infrastructure/cache.js';
import { createDatabase } from '../infrastructure/database.js';
import { createOtpGateway } from '../infrastructure/gateways.js';
import { TokenCodec } from '../infrastructure/security.js';
import { createStorage } from '../infrastructure/storage.js';
import { createStsGateway } from '../infrastructure/sts/aliyun-sts-gateway.js';
import { createAuthMiddleware, type AuthMiddleware } from '../middleware/http.js';
import { RealtimeService } from '../services/realtime-service.js';

export interface AppContainer {
  config: AppConfig;
  prisma: PrismaClient;
  redis: Redis;
  realtime: RealtimeService;
  guards: AuthMiddleware;
  authService: AuthService;
  addressService: AddressService;
  demandService: DemandService;
  contactRequestService: ContactRequestService;
  printerService: PrinterService;
  notificationService: NotificationService;
  catalogService: CatalogService;
  invitationService: InvitationService;
  uploadCredentialsService: UploadCredentialsService;
  readiness(): Promise<void>;
  initialize(): Promise<void>;
  close(): Promise<void>;
}

export function createContainer(appConfig: AppConfig = config): AppContainer {
  const prisma = createDatabase();
  const redis = createCache(appConfig.REDIS_URL);
  const tokens = new TokenCodec(appConfig.SESSION_SECRET);
  const storage = createStorage(appConfig);
  const realtime = new RealtimeService(redis);
  const authService = new AuthService(prisma, tokens, redis, createOtpGateway(appConfig), appConfig);
  // The STS gateway needs the OSS RAM user keys, so it only exists when the OSS
  // storage provider is active; otherwise issuing credentials fails with 501.
  const stsGateway = appConfig.STORAGE_PROVIDER === 'oss' ? createStsGateway(appConfig) : undefined;
  const uploadCredentialsService = new UploadCredentialsService(stsGateway, appConfig);

  return {
    config: appConfig,
    prisma,
    redis,
    realtime,
    guards: createAuthMiddleware(authService),
    authService,
    addressService: new AddressService(prisma),
    demandService: new DemandService(prisma, storage, appConfig),
    contactRequestService: new ContactRequestService(prisma, realtime),
    printerService: new PrinterService(prisma),
    notificationService: new NotificationService(prisma),
    catalogService: new CatalogService(prisma, storage),
    invitationService: new InvitationService(prisma, tokens),
    uploadCredentialsService,
    async readiness() {
      await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    },
    async initialize() {
      await prisma.$queryRaw`SELECT 1`;
      if (redis.status === 'wait') await redis.connect();
      await redis.ping();
    },
    async close() {
      await realtime.close();
      redis.disconnect();
      await prisma.$disconnect();
    },
  };
}
