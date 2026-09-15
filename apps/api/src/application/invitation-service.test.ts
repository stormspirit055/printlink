import { describe, expect, test, vi } from 'vitest';
import { InvitationService } from './backend-services.js';
import { TokenCodec } from '../infrastructure/security.js';

const tokens = new TokenCodec('test-session-secret-at-least-32-chars');

function createPrismaMock() {
  return {
    invitationCode: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('InvitationService', () => {
  test('create persists a fresh 8-char code tied to the creator', async () => {
    const prisma = createPrismaMock();
    prisma.invitationCode.findUnique.mockResolvedValue(null);
    prisma.invitationCode.create.mockResolvedValue({ id: 'ic-1', code: 'ABCDEFGH' });

    const service = new InvitationService(prisma as never, tokens);
    const result = await service.create('admin-1', 50);

    expect(prisma.invitationCode.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.invitationCode.create).toHaveBeenCalledWith({
      data: { code: expect.any(String), createdById: 'admin-1', maxUses: 50, expiresAt: null },
    });
    expect(result.code).toBe('ABCDEFGH');
  });

  test('create accepts an optional expiry and forwards it', async () => {
    const prisma = createPrismaMock();
    prisma.invitationCode.findUnique.mockResolvedValue(null);
    prisma.invitationCode.create.mockResolvedValue({ id: 'ic-1', code: 'ZZZZZZZZ' });

    const service = new InvitationService(prisma as never, tokens);
    const expiresAt = new Date('2027-01-01T00:00:00.000Z');
    await service.create('admin-1', 1, expiresAt);

    expect(prisma.invitationCode.create).toHaveBeenCalledWith({
      data: { code: expect.any(String), createdById: 'admin-1', maxUses: 1, expiresAt },
    });
  });

  test('create retries when the generated code already exists', async () => {
    const prisma = createPrismaMock();
    prisma.invitationCode.findUnique.mockResolvedValueOnce({ id: 'taken' }).mockResolvedValueOnce(null);
    prisma.invitationCode.create.mockResolvedValue({ id: 'ic-2', code: 'ZZZZZZZZ' });

    const service = new InvitationService(prisma as never, tokens);
    await service.create('admin-1', 1);

    expect(prisma.invitationCode.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.invitationCode.create).toHaveBeenCalledTimes(1);
  });

  test('disable throws RESOURCE_NOT_FOUND when the code does not exist', async () => {
    const prisma = createPrismaMock();
    prisma.invitationCode.updateMany.mockResolvedValue({ count: 0 });

    const service = new InvitationService(prisma as never, tokens);
    await expect(service.disable('missing')).rejects.toMatchObject({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
    });
    expect(prisma.invitationCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'missing' },
      data: { disabled: true },
    });
  });

  test('list returns codes with the creator nickname included', async () => {
    const prisma = createPrismaMock();
    prisma.invitationCode.findMany.mockResolvedValue([
      { id: 'ic-1', code: 'A', createdBy: { nickname: '平台管理员' } },
    ]);

    const service = new InvitationService(prisma as never, tokens);
    const result = await service.list();

    expect(result[0].createdBy.nickname).toBe('平台管理员');
    expect(prisma.invitationCode.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { nickname: true } } },
    });
  });
});
