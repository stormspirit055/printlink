import { describe, expect, test, vi } from 'vitest';
import { DemandService } from './backend-services.js';
import type { StoragePort } from '../infrastructure/storage.js';

describe('demand visibility', () => {
  const viewers = [
    undefined,
    { id: 'other', role: 'USER' as const },
    { id: 'owner', role: 'USER' as const },
    { id: 'admin', role: 'ADMIN' as const },
  ];
  for (const status of ['OPEN', 'QUOTED', 'PENDING_REVIEW', 'REJECTED', 'MATCHED', 'CANCELLED']) {
    test.each(viewers)(`${status}: viewer %j only gets a signed URL when authorized`, async (viewer) => {
      const demand = {
        id: 'demand',
        userId: 'owner',
        status,
        modelKey: 'private.3mf',
        budget: 20,
        user: { nickname: 'Owner' },
        demandActions: [],
        recipientName: 'private-name',
        recipientPhone: 'private-phone',
        shippingAddress: 'private-address',
      };
      const prisma = { demand: { findUnique: vi.fn().mockResolvedValue(demand) } };
      const storage = { signedUrl: vi.fn().mockResolvedValue('https://storage.example/signed') };
      const service = new DemandService(prisma as never, storage as never);
      const allowed =
        viewer && (viewer.id === 'owner' || viewer.role === 'ADMIN' || ['OPEN', 'QUOTED'].includes(status));
      if (allowed) {
        const result = await service.get('demand', viewer);
        expect(result.modelUrl).toBe('https://storage.example/signed');
        for (const key of ['modelKey', 'recipientName', 'recipientPhone', 'shippingAddress'])
          expect(result).not.toHaveProperty(key);
      } else {
        await expect(service.get('demand', viewer)).rejects.toMatchObject({ status: viewer ? 404 : 401 });
        expect(storage.signedUrl).not.toHaveBeenCalled();
      }
    });
  }

  test('local orphan files and shared keys cannot bypass private demand access', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new DemandService({ demand: { findMany } } as never, {} as never);
    const viewer = { id: 'other', role: 'USER' as const };
    await expect(service.authorizeLocalModel('orphan.3mf', viewer)).rejects.toMatchObject({ status: 404 });
    findMany.mockResolvedValue([
      { userId: 'owner', status: 'OPEN' },
      { userId: 'owner', status: 'REJECTED' },
    ]);
    await expect(service.authorizeLocalModel('shared.3mf', viewer)).rejects.toMatchObject({ status: 404 });
  });
});

const address = {
  recipientName: '张三',
  phone: '13900001234',
  province: '浙江省',
  city: '杭州市',
  district: '西湖区',
  detail: '文一西路 100 号',
};

const body = {
  title: '一个测试需求标题',
  materialCode: 'PLA',
  colorName: '白色',
  quantity: 1,
  sizeX: 10,
  sizeY: 10,
  sizeZ: 10,
  volumeCm3: 1,
  estimatedWeight: 0.3,
  estimatedHours: 0.5,
  budget: 20,
  addressId: 'addr-1',
  modelKey: 'models/0f8c1a2b-3c4d-4e5f-9a8b-7c6d5e4f3a2b.3mf',
  modelName: 'bracket.3mf',
};

function setup(statResult: { size: number } | null, created = { id: 'demand-1' }) {
  const storage = { save: vi.fn(), signedUrl: vi.fn(), stat: vi.fn().mockResolvedValue(statResult) };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ wechatId: 'wx-1' }) },
    shippingAddress: { findFirst: vi.fn().mockResolvedValue(address) },
    demand: { create: vi.fn().mockResolvedValue(created) },
  };
  const config = { MAX_UPLOAD_MB: 1 };
  const service = new DemandService(prisma as never, storage as unknown as StoragePort, config as never);
  return { service, storage, prisma };
}

describe('DemandService.createFromKey', () => {
  test('persists the client-provided key and name for an existing object', async () => {
    const { service, prisma } = setup({ size: 1024 });

    await expect(service.createFromKey('user-1', body)).resolves.toEqual({ id: 'demand-1' });
    expect(prisma.demand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        modelKey: body.modelKey,
        modelName: 'bracket.3mf',
        recipientName: '张三',
        shippingAddress: '浙江省杭州市西湖区文一西路 100 号',
      }),
    });
  });

  test('rejects when the object is missing', async () => {
    const { service } = setup(null);
    await expect(service.createFromKey('user-1', body)).rejects.toMatchObject({
      status: 400,
      code: 'MODEL_FILE_REQUIRED',
    });
  });

  test('rejects an empty object', async () => {
    const { service } = setup({ size: 0 });
    await expect(service.createFromKey('user-1', body)).rejects.toMatchObject({
      status: 400,
      code: 'MODEL_FILE_EMPTY',
    });
  });

  test('rejects an object above the configured upload limit', async () => {
    const { service } = setup({ size: 2 * 1024 * 1024 });
    await expect(service.createFromKey('user-1', body)).rejects.toMatchObject({
      status: 400,
      code: 'MODEL_FILE_TOO_LARGE',
      message: '模型文件不能超过 1MB',
    });
  });
});
