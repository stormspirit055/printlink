import { Router } from 'express';
import { z } from 'zod';
import type { CatalogService, InvitationService } from '../application/backend-services.js';
import { asyncRoute, parse, routeParam, type AuthMiddleware } from '../middleware/http.js';

export function createAdminRouter(
  service: CatalogService,
  invitationService: InvitationService,
  { auth, admin }: AuthMiddleware,
) {
  const router = Router();
  router.use(auth, admin);
  router.get(
    '/reviews',
    asyncRoute(async (_req, res) => res.json(await service.reviews())),
  );
  router.get(
    '/config',
    asyncRoute(async (_req, res) => res.json(await service.adminConfig())),
  );
  router.put(
    '/materials/:id',
    asyncRoute(async (req, res) => {
      const body = parse(
        z.object({
          name: z.string().min(1).max(80),
          pricePerGram: z.coerce.number().positive(),
          marketRange: z.string().max(80),
          active: z.boolean(),
        }),
        req.body,
      );
      res.json(await service.updateMaterial(routeParam(req.params.id), body));
    }),
  );
  router.put(
    '/rules/:key',
    asyncRoute(async (req, res) => {
      const { value } = parse(z.object({ value: z.coerce.number().nonnegative() }), req.body);
      res.json(await service.updateRule(routeParam(req.params.key), value));
    }),
  );
  router.put(
    '/colors/:id',
    asyncRoute(async (req, res) => {
      const body = parse(
        z.object({
          name: z.string().min(1).max(40),
          hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          multiplier: z.coerce.number().positive(),
          active: z.boolean(),
        }),
        req.body,
      );
      res.json(await service.updateColor(routeParam(req.params.id), body));
    }),
  );
  router.get(
    '/invitations',
    asyncRoute(async (_req, res) => res.json(await invitationService.list())),
  );
  router.post(
    '/invitations',
    asyncRoute(async (req, res) => {
      const body = parse(
        z.object({
          maxUses: z.coerce.number().int().min(1).max(1000),
          expiresAt: z.string().datetime().optional(),
        }),
        req.body,
      );
      res
        .status(201)
        .json(
          await invitationService.create(
            req.user!.id,
            body.maxUses,
            body.expiresAt ? new Date(body.expiresAt) : undefined,
          ),
        );
    }),
  );
  router.post(
    '/invitations/:id/disable',
    asyncRoute(async (req, res) => res.json(await invitationService.disable(routeParam(req.params.id)))),
  );
  return router;
}
