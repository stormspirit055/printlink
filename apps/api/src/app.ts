import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { AppContainer } from './bootstrap/container.js';
import { createContainer } from './bootstrap/container.js';
import { apiError, asyncRoute, errorHandler, routeParam } from './middleware/http.js';
import { createAddressesRouter } from './routes/addresses.js';
import { createAdminRouter } from './routes/admin.js';
import { createAuthRouter } from './routes/auth.js';
import { createConfigRouter } from './routes/config.js';
import { createDemandsRouter } from './routes/demands.js';
import { createHealthRouter } from './routes/health.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createPrintersRouter } from './routes/printers.js';
import { createContactRequestsRouter } from './routes/quotes.js';
import { createUploadsRouter } from './routes/uploads.js';

export function createApp(container: AppContainer) {
  const app = express();
  const { config } = container;

  app.set('trust proxy', 1);
  app.use(pinoHttp({ redact: ['req.headers.cookie', 'req.body.password', 'req.body.inviteCode'] }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // In development the Vite dev server may land on any localhost port (5173 is
  // often taken by another project, so Vite falls back to 5174+). Reflect any
  // localhost origin so credentialed requests keep working regardless of the
  // port; in production the strict WEB_ORIGIN allowlist still applies.
  const corsOrigin =
    config.NODE_ENV === 'development'
      ? (origin: string | undefined, cb: (err: Error | null, allow?: boolean | string) => void) =>
          cb(null, origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : false)
      : config.WEB_ORIGIN;
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.get(
    '/uploads/:key',
    container.guards.auth,
    asyncRoute(async (req, res, next) => {
      const key = routeParam(req.params.key);
      if (config.STORAGE_PROVIDER !== 'local' || !/^[0-9a-f-]{36}\.3mf$/i.test(key))
        return apiError(res, 404, 'RESOURCE_NOT_FOUND', '模型不存在');
      await container.demandService.authorizeLocalModel(key, req.user!);
      res.setHeader('Cache-Control', 'private, no-store');
      res.sendFile(key, { root: path.resolve(config.UPLOAD_DIR), dotfiles: 'deny', cacheControl: false }, (error) => {
        if (error) next(error);
      });
    }),
  );
  app.use('/uploads', (_req, res) => apiError(res, 404, 'RESOURCE_NOT_FOUND', '模型不存在'));

  app.use(createHealthRouter(() => container.readiness()));
  app.use('/api', createAuthRouter(container.authService, config, container.redis, container.guards));
  app.use('/api/addresses', createAddressesRouter(container.addressService, container.guards));
  app.use('/api/config', createConfigRouter(container.catalogService));
  app.use('/api/demands', createDemandsRouter(container.demandService, config, container.guards));
  app.use('/api/uploads', createUploadsRouter(container.uploadCredentialsService, container.redis, container.guards));
  app.use('/api/admin', createAdminRouter(container.catalogService, container.invitationService, container.guards));
  // Reserved module boundary: replace these tombstones with the transaction
  // router only after orders, payments, fulfilment and compliance are complete.
  app.use(['/api/orders', '/api/payments'], (_req, res) =>
    res.status(404).json({ code: 'RESOURCE_NOT_FOUND', error: '接口不存在' }),
  );
  app.use('/api', createPrintersRouter(container.printerService, container.guards));
  app.use('/api', createContactRequestsRouter(container.contactRequestService, container.guards));
  app.use('/api', createNotificationsRouter(container.notificationService, container.realtime, container.guards));
  app.use('/api', (_req, res) => res.status(404).json({ code: 'RESOURCE_NOT_FOUND', error: '接口不存在' }));
  app.use(errorHandler);
  return app;
}

export const container = createContainer();
export const app = createApp(container);
