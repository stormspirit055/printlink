import areas from '@province-city-china/area';
import cities from '@province-city-china/city';
import provinces from '@province-city-china/province';
import { Router } from 'express';
import { z } from 'zod';
import type { AddressService } from '../application/backend-services.js';
import { asyncRoute, parse, routeParam, type AuthMiddleware } from '../middleware/http.js';

const addressSchema = z
  .object({
    recipientName: z.string().trim().min(2).max(30),
    phone: z.string().regex(/^1\d{10}$/),
    province: z.string().trim().min(2).max(30),
    city: z.string().trim().min(2).max(30),
    district: z.string().trim().min(2).max(30),
    detail: z.string().trim().min(5).max(120),
    isDefault: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    const province = provinces.find((item) => item.name === value.province);
    const city = province && cities.find((item) => item.province === province.province && item.name === value.city);
    const district =
      city &&
      areas.find((item) => item.province === city.province && item.city === city.city && item.name === value.district);
    if (!province || !city || !district)
      context.addIssue({ code: 'custom', path: ['district'], message: '省市区组合无效' });
  });

export function createAddressesRouter(service: AddressService, { auth }: AuthMiddleware) {
  const router = Router();
  router.use(auth);
  router.get(
    '/',
    asyncRoute(async (req, res) => res.json(await service.list(req.user!.id))),
  );
  router.post(
    '/',
    asyncRoute(async (req, res) =>
      res.status(201).json(await service.create(req.user!.id, parse(addressSchema, req.body))),
    ),
  );
  router.put(
    '/:id',
    asyncRoute(async (req, res) =>
      res.json(await service.update(req.user!.id, routeParam(req.params.id), parse(addressSchema, req.body))),
    ),
  );
  router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
      await service.remove(req.user!.id, routeParam(req.params.id));
      res.json({ ok: true });
    }),
  );
  return router;
}
