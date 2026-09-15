import { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import type { AuthService } from '../application/backend-services.js';
import { AppError } from '../core/errors.js';

export const asyncRoute =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void handler(req, res, next).catch(next);

export function createAuthMiddleware(authService: AuthService) {
  const auth = asyncRoute(async (req, res, next) => {
    const token = req.cookies.pl_session;
    if (!token) return res.status(401).json({ error: '请先登录' });
    const user = await authService.resolveSession(token);
    if (!user) return res.status(401).json({ error: '登录已过期' });
    req.user = user;
    next();
  });
  const optionalAuth = asyncRoute(async (req, _res, next) => {
    req.user = (await authService.resolveSession(req.cookies.pl_session)) ?? undefined;
    next();
  });
  const admin = (req: Request, res: Response, next: NextFunction) =>
    req.user?.role === 'ADMIN' ? next() : res.status(403).json({ error: '需要管理员权限' });
  return { auth, optionalAuth, admin };
}

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;

export const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => schema.parse(data);
export const routeParam = (value: string | string[]) => (Array.isArray(value) ? value[0] : value);
export const apiError = (res: Response, status: number, code: string, error: string, details?: unknown) =>
  res.status(status).json({ code, error, ...(details ? { details } : {}) });

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  req.log.error(error);
  if (error instanceof AppError) {
    return apiError(res, error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    req.log.warn({ issues: error.issues }, 'request validation failed');
    return apiError(res, 400, 'VALIDATION_ERROR', '请求参数无效', { issues: error.issues });
  }
  if (error instanceof Error && error.name === 'PrismaClientKnownRequestError') {
    const prismaCode = (error as Error & { code?: string }).code;
    req.log.error({ prismaCode, message: error.message }, 'database request failed');
    const mapped =
      prismaCode === 'P2022'
        ? ['DB_SCHEMA_OUTDATED', '数据库结构未同步，请执行数据库更新']
        : prismaCode === 'P2002'
          ? ['DB_UNIQUE_CONFLICT', '数据已存在，请勿重复提交']
          : prismaCode === 'P2003'
            ? ['DB_RELATION_CONFLICT', '关联数据不存在或已失效']
            : ['DB_WRITE_FAILED', '数据保存失败，请检查提交内容后重试'];
    return apiError(
      res,
      400,
      mapped[0],
      mapped[1],
      process.env.NODE_ENV === 'development' ? { prismaCode } : undefined,
    );
  }
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500;
  return apiError(
    res,
    status,
    status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED',
    status === 500 ? '服务器内部错误' : (error as Error).message,
  );
}
