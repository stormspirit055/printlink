import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export async function initializeAdmin(db: PrismaClient, phone: string | undefined) {
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) throw new Error('Set ADMIN_PHONE to a valid mobile phone number');
  if (['13800000000', '13900000001', '13900000002'].includes(phone))
    throw new Error('Demo phone numbers cannot be used for administrator initialization');

  return db.$transaction(async (tx) => {
    // Serialize bootstrap runs so two operators cannot create different first admins.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(731204891)`;
    const admins = await tx.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, phone: true } });
    if (admins.length) {
      if (admins.length === 1 && admins[0].phone === phone) return { userId: admins[0].id, created: false };
      throw new Error('An administrator already exists; bootstrap cannot create additional administrators');
    }
    const existing = await tx.user.findUnique({ where: { phone }, select: { id: true } });
    if (existing) throw new Error('This phone belongs to an existing user; bootstrap cannot promote users');
    const admin = await tx.user.create({
      data: { username: `admin_${randomUUID()}`, phone, nickname: '平台管理员', role: 'ADMIN' },
      select: { id: true },
    });
    return { userId: admin.id, created: true };
  });
}
