import { Router } from 'express';
import type { ContactRequestService } from '../application/backend-services.js';
import { asyncRoute, routeParam, type AuthMiddleware } from '../middleware/http.js';

export function createContactRequestsRouter(service: ContactRequestService, { auth }: AuthMiddleware) {
  const router = Router();
  router.use(auth);

  router.post(
    '/demands/:id/contact-requests',
    asyncRoute(async (req, res) =>
      res.status(201).json(await service.request(routeParam(req.params.id), req.user!.id)),
    ),
  );
  router.get(
    '/demands/:id/contact-requests',
    asyncRoute(async (req, res) => res.json(await service.listForDemand(routeParam(req.params.id), req.user!.id))),
  );
  router.get(
    '/demands/:id/contact-request',
    asyncRoute(async (req, res) => res.json(await service.getMine(routeParam(req.params.id), req.user!.id))),
  );
  router.post(
    '/contact-requests/:id/approve',
    asyncRoute(async (req, res) => res.json(await service.approve(routeParam(req.params.id), req.user!.id))),
  );
  return router;
}
