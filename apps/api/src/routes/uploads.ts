import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Redis } from 'ioredis';
import type { UploadCredentialsService } from '../application/backend-services.js';
import { asyncRoute, type AuthMiddleware } from '../middleware/http.js';

export function createUploadsRouter(service: UploadCredentialsService, redis: Redis, { auth }: AuthMiddleware) {
  const router = Router();
  // Backed by Redis so the per-IP limit holds across instances; every call
  // costs an AssumeRole request against the Aliyun STS quota.
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: 'rl:uploads:',
      sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as never,
    }),
  });

  router.get(
    '/credentials',
    auth,
    limiter,
    asyncRoute(async (req, res) => res.json(await service.issue(req.user!.id))),
  );
  return router;
}
