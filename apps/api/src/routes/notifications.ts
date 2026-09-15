import { Router } from 'express';
import { z } from 'zod';
import type { NotificationService } from '../application/backend-services.js';
import type { RealtimeService } from '../services/realtime-service.js';
import { asyncRoute, parse, routeParam, type AuthMiddleware } from '../middleware/http.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function createNotificationsRouter(
  service: NotificationService,
  realtime: RealtimeService,
  { auth }: AuthMiddleware,
) {
  const router = Router();
  router.use(auth);
  router.get(
    '/notifications',
    asyncRoute(async (req, res) => {
      const { page, limit } = parse(listQuery, req.query);
      res.json(await service.notifications(req.user!.id, page, limit));
    }),
  );
  router.post(
    '/notifications/:id/read',
    asyncRoute(async (req, res) =>
      res.json({ updated: await service.readNotification(req.user!.id, routeParam(req.params.id)) }),
    ),
  );
  router.post(
    '/notifications/read-all',
    asyncRoute(async (req, res) => res.json({ updated: await service.readAllNotifications(req.user!.id) })),
  );
  router.get('/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const remove = realtime.addClient(req.user!.id, res);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      remove();
    });
  });
  return router;
}
