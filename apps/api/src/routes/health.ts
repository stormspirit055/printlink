import { Router } from 'express';
import { asyncRoute } from '../middleware/http.js';

export function createHealthRouter(readiness: () => Promise<void>) {
  const router = Router();
  router.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  router.get(
    '/health/ready',
    asyncRoute(async (_req, res) => {
      await readiness();
      res.json({ status: 'ready' });
    }),
  );
  return router;
}
