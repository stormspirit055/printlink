import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { publicUser, type AuthService } from '../application/backend-services.js';
import type { AppConfig } from '../config.js';
import { asyncRoute, parse, type AuthMiddleware } from '../middleware/http.js';

const phoneSchema = z
  .string()
  .trim()
  .regex(/^1\d{10}$/, '请输入有效的 11 位手机号');
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, '请输入 6 位数字验证码');
export function createAuthRouter(service: AuthService, config: AppConfig, redis: Redis, { auth }: AuthMiddleware) {
  const router = Router();
  // Backed by Redis so the per-IP limit holds across instances and survives
  // restarts, not just within one process's memory.
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: 'rl:auth:',
      sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as never,
    }),
  });
  const setSessionCookie = (res: Response, token: string) =>
    res.cookie('pl_session', token, {
      httpOnly: true,
      secure: config.COOKIE_SECURE ?? config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 86400000,
      path: '/',
    });

  router.post(
    '/auth/code',
    limiter,
    asyncRoute(async (req, res) => {
      const body = parse(z.object({ phone: phoneSchema }), req.body);
      const result = await service.requestCode(body.phone);
      res.json({ ok: true, ...result, message: '验证码已发送' });
    }),
  );
  router.post(
    '/auth/login',
    limiter,
    asyncRoute(async (req, res) => {
      // inviteCode is optional: returning users log in with phone + code only,
      // first-time logins (new phone) must supply a valid code to register.
      const body = parse(
        z.object({ phone: phoneSchema, code: codeSchema, inviteCode: z.string().trim().min(4).max(32).optional() }),
        req.body,
      );
      const result = await service.loginByPhone(body.phone, body.code, body.inviteCode);
      setSessionCookie(res, result.token);
      res.json({ user: result.user });
    }),
  );
  router.post(
    '/auth/logout',
    auth,
    asyncRoute(async (req, res) => {
      await service.logout(req.cookies.pl_session);
      res.clearCookie('pl_session', { path: '/' });
      res.json({ ok: true });
    }),
  );
  router.put(
    '/me',
    auth,
    asyncRoute(async (req, res) => {
      const body = parse(
        z.object({
          nickname: z.string().trim().min(2).max(30),
          wechatId: z.string().trim().min(1).max(50),
          bio: z.string().trim().max(300).default(''),
        }),
        req.body,
      );
      res.json({ user: await service.updateProfile(req.user!.id, body.nickname, body.wechatId, body.bio) });
    }),
  );
  router.get(
    '/me',
    asyncRoute(async (req, res) => {
      const user = await service.resolveSession(req.cookies.pl_session);
      res.json({ user: user ? publicUser(user) : null });
    }),
  );
  return router;
}
