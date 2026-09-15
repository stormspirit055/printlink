import { Router } from 'express';
import { z } from 'zod';
import type { PrinterService } from '../application/backend-services.js';
import { asyncRoute, parse, type AuthMiddleware } from '../middleware/http.js';
import { printerCatalog } from '../printer-catalog.js';

export function createPrintersRouter(service: PrinterService, { auth }: AuthMiddleware) {
  const router = Router();
  router.get(
    '/printers',
    auth,
    asyncRoute(async (req, res) => res.json(await service.list(req.user!.id))),
  );
  router.get('/printer-catalog', auth, (_req, res) => res.json(printerCatalog));
  router.post(
    '/printers',
    auth,
    asyncRoute(async (req, res) => {
      const body = parse(
        z.object({
          catalogId: z.string().min(1),
          name: z.string().min(2).max(80),
          materials: z.array(z.string()).min(1),
          nozzle: z.string().max(20).default('0.4mm'),
          location: z.string().max(50).default(''),
          description: z.string().max(1000).default(''),
        }),
        req.body,
      );
      res.status(201).json(await service.create(req.user!.id, body));
    }),
  );
  return router;
}
