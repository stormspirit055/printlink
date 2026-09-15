import { describe, expect, test, vi } from 'vitest';
import { initializeAdmin } from './admin-initialization.js';
import { seedBaseData, seedDemoData } from './seed-data.js';

describe('production data initialization', () => {
  test('base seed only initializes catalog data and preserves existing values', async () => {
    const db = { material: { upsert: vi.fn() }, pricingRule: { upsert: vi.fn() }, colorOption: { upsert: vi.fn() } };
    await seedBaseData(db as never);
    expect(db.material.upsert).toHaveBeenCalledTimes(5);
    expect(db.pricingRule.upsert).toHaveBeenCalledTimes(6);
    expect(db.colorOption.upsert).toHaveBeenCalledTimes(7);
    for (const table of Object.values(db))
      for (const [args] of table.upsert.mock.calls) expect(args.update).toEqual({});
  });

  test.each(['production', undefined, '', 'staging'])('demo seed refuses %s before any write', async (env) => {
    await expect(seedDemoData({} as never, env)).rejects.toThrow('Demo seed requires');
  });

  test.each([undefined, '', '123', '13800000000', '13900000001', '13900000002'])(
    'admin bootstrap rejects %s before connecting',
    async (phone) => {
      await expect(initializeAdmin({} as never, phone)).rejects.toThrow();
    },
  );

  function setup(admins: { id: string; phone: string }[] = [], existing: { id: string } | null = null) {
    const tx = {
      $executeRaw: vi.fn(),
      user: {
        findMany: vi.fn().mockResolvedValue(admins),
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn().mockResolvedValue({ id: 'new-admin' }),
      },
    };
    const db = { $transaction: async (run: (client: typeof tx) => unknown) => run(tx) };
    return { db, tx };
  }

  test('creates one admin without demo identity or invitations', async () => {
    const { db, tx } = setup();
    await expect(initializeAdmin(db as never, '13712345678')).resolves.toEqual({ userId: 'new-admin', created: true });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.user.create).toHaveBeenCalledWith({
      data: { username: expect.stringMatching(/^admin_/), phone: '13712345678', nickname: '平台管理员', role: 'ADMIN' },
      select: { id: true },
    });
  });

  test('repeating bootstrap for the same admin is a no-op', async () => {
    const { db, tx } = setup([{ id: 'admin', phone: '13712345678' }]);
    await expect(initializeAdmin(db as never, '13712345678')).resolves.toEqual({ userId: 'admin', created: false });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  test('does not create an additional admin or promote an existing user', async () => {
    for (const { db, tx } of [setup([{ id: 'admin', phone: '13612345678' }]), setup([], { id: 'user' })]) {
      await expect(initializeAdmin(db as never, '13712345678')).rejects.toThrow();
      expect(tx.user.create).not.toHaveBeenCalled();
    }
  });
});
