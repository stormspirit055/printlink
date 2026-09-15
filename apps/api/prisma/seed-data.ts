import type { Prisma } from '@prisma/client';

export function assertDemoEnvironment(environment: string | undefined) {
  if (environment !== 'development' && environment !== 'test')
    throw new Error('Demo seed requires NODE_ENV=development or NODE_ENV=test');
}

export async function seedBaseData(db: Prisma.TransactionClient) {
  const materials = [
    ['PLA', 'PLA / PLA+', 'FDM', 0.07, '¥45-85/kg'],
    ['PETG', 'PETG', 'FDM', 0.07, '¥45-80/kg'],
    ['ABS', 'ABS', 'FDM', 0.08, '¥55-90/kg'],
    ['TPU', 'TPU', 'FDM', 0.12, '¥85-150/kg'],
    ['RESIN', '标准光敏树脂', 'RESIN', 0.1, '¥70-130/kg'],
  ] as const;
  for (const [code, name, category, pricePerGram, marketRange] of materials)
    await db.material.upsert({
      where: { code },
      update: {},
      create: { code, name, category, pricePerGram, marketRange },
    });
  for (const [key, label, value, unit] of [
    ['loss_single', '单色损耗系数', 1.1, '倍'],
    ['loss_multicolor', '多色损耗系数', 1.55, '倍'],
    ['machine_fdm', 'FDM 设备时价', 3, '元/小时'],
    ['machine_resin', '光固化设备时价', 4, '元/小时'],
    ['setup_fee', '开机基础费', 8, '元/单'],
    ['minimum_order', '最低订单额', 18, '元'],
  ] as const)
    await db.pricingRule.upsert({ where: { key }, update: {}, create: { key, label, value, unit } });
  for (const [name, hex, multiplier] of [
    ['黑色', '#171a1f', 1],
    ['白色', '#e8ece9', 1],
    ['机械灰', '#7b858c', 1],
    ['信号红', '#ef5757', 1],
    ['工业黄', '#f2ca52', 1],
    ['钴蓝', '#3a7bd5', 1],
    ['荧光绿', '#50e3a4', 1.15],
  ] as const)
    await db.colorOption.upsert({ where: { name }, update: {}, create: { name, hex, multiplier } });
}

export async function seedDemoData(db: Prisma.TransactionClient, environment: string | undefined) {
  assertDemoEnvironment(environment);
  await seedBaseData(db);
  const admin = await db.user.upsert({
    where: { phone: '13800000000' },
    update: { username: 'admin', role: 'ADMIN', wechatId: 'printlink_admin' },
    create: {
      username: 'admin',
      phone: '13800000000',
      nickname: '平台管理员',
      wechatId: 'printlink_admin',
      role: 'ADMIN',
    },
  });
  await db.user.upsert({
    where: { phone: '13900000001' },
    update: {
      username: 'alice',
      nickname: '测试用户 A',
      role: 'USER',
      wechatId: 'printlink_alice',
    },
    create: {
      username: 'alice',
      phone: '13900000001',
      nickname: '测试用户 A',
      role: 'USER',
      wechatId: 'printlink_alice',
    },
  });
  const maker = await db.user.upsert({
    where: { phone: '13900000002' },
    update: {
      username: 'bob',
      nickname: '测试用户 B',
      role: 'USER',
      wechatId: 'printlink_bob',
    },
    create: {
      username: 'bob',
      phone: '13900000002',
      nickname: '测试用户 B',
      role: 'USER',
      wechatId: 'printlink_bob',
    },
  });
  await db.invitationCode.upsert({
    where: { code: 'WELCOME1' },
    update: {},
    create: { code: 'WELCOME1', createdById: admin.id, maxUses: 100 },
  });
  const makerPrinter = await db.printer.findFirst({ where: { userId: maker.id, name: '测试设备 A' } });
  if (!makerPrinter)
    await db.printer.create({
      data: {
        userId: maker.id,
        name: '测试设备 A',
        model: 'Bambu Lab X1 Carbon',
        technology: 'FDM',
        maxX: 256,
        maxY: 256,
        maxZ: 256,
        colorMode: 'multi',
        maxColors: 4,
        materials: ['PLA', 'PETG', 'ABS'],
        nozzle: '0.4mm',
        enclosed: true,
        location: '杭州',
        description: '用于本地抢单流程测试',
      },
    });
}
