import { Router } from 'express';
import type { CatalogService } from '../application/backend-services.js';
import { asyncRoute } from '../middleware/http.js';

export function createConfigRouter(service: CatalogService) {
  const router = Router();
  router.get(
    '/',
    asyncRoute(async (_req, res) => res.json(await service.publicConfig())),
  );
  return router;
}
