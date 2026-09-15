import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { DemandService } from '../application/backend-services.js';
import type { AppConfig } from '../config.js';
import { apiError, asyncRoute, parse, routeParam, type AuthMiddleware } from '../middleware/http.js';

const demandSchema = z.object({
  title: z.string().trim().min(4).max(100),
  description: z.string().trim().max(5000).default(''),
  materialCode: z.string().min(1),
  colorName: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(1000),
  sizeX: z.coerce.number().positive(),
  sizeY: z.coerce.number().positive(),
  sizeZ: z.coerce.number().positive(),
  volumeCm3: z.coerce.number().positive(),
  estimatedWeight: z.coerce.number().nonnegative(),
  estimatedHours: z.coerce.number().nonnegative(),
  budget: z.coerce.number().positive(),
  deadline: z.string().optional(),
  addressId: z.string().min(1),
  authorizedPublic: z.preprocess((value) => value === true || value === 'true', z.boolean()).default(false),
});

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createDemandsRouter(service: DemandService, config: AppConfig, guards: AuthMiddleware) {
  const router = Router();
  const uploadTemp = path.resolve(config.UPLOAD_DIR, '.tmp');
  fs.mkdirSync(uploadTemp, { recursive: true });
  const upload = multer({
    dest: uploadTemp,
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => callback(null, path.extname(file.originalname).toLowerCase() === '.3mf'),
  });
  // Direct-upload clients generate `${prefix}/${uuid}.3mf` keys; the pattern
  // keeps untrusted keys inside the model prefix and blocks path traversal.
  const directDemandSchema = demandSchema.extend({
    modelKey: z
      .string()
      .regex(
        new RegExp(
          `^${escapeRegex(config.OSS_PREFIX)}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.3mf$`,
        ),
        '模型文件标识无效，请重新上传',
      ),
    modelName: z.string().trim().min(1).max(255),
  });
  router.get(
    '/',
    guards.optionalAuth,
    asyncRoute(async (req, res) => {
      const mine = typeof req.query.mine === 'string';
      if (mine && !req.user) return res.status(401).json({ error: '请先登录' });
      res.json(await service.list(mine ? req.user!.id : undefined));
    }),
  );
  router.get(
    '/:id',
    guards.auth,
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'private, no-store');
      res.json(await service.get(routeParam(req.params.id), req.user!));
    }),
  );
  router.post(
    '/',
    guards.auth,
    upload.single('model'),
    asyncRoute(async (req, res) => {
      if (req.is('multipart/form-data')) {
        if (!req.file) return apiError(res, 400, 'MODEL_FILE_REQUIRED', '请上传 3MF 模型文件');
        if (!req.file.size) return apiError(res, 400, 'MODEL_FILE_EMPTY', '模型文件为空，请重新选择 3MF 文件');
        try {
          res.status(201).json(await service.create(req.user!.id, parse(demandSchema, req.body), req.file));
        } finally {
          await fs.promises.rm(req.file.path, { force: true });
        }
        return;
      }
      // Non-multipart: direct-upload flow where the client already put the
      // object in storage and submits its key (validated above) as JSON.
      res.status(201).json(await service.createFromKey(req.user!.id, parse(directDemandSchema, req.body)));
    }),
  );
  router.post(
    '/:id/review',
    guards.auth,
    guards.admin,
    asyncRoute(async (req, res) => {
      const body = parse(
        z.object({ action: z.enum(['approve', 'reject']), reason: z.string().max(500).default('') }),
        req.body,
      );
      res.json(await service.review(routeParam(req.params.id), body.action, body.reason));
    }),
  );
  return router;
}
