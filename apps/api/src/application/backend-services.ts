import type { Prisma, PrismaClient, User } from '@prisma/client';
import { AppError } from '../core/errors.js';
import type { OtpGateway } from '../infrastructure/gateways.js';
import type { Redis } from 'ioredis';
import type { StsGatewayPort } from '../infrastructure/sts/aliyun-sts-gateway.js';
import { TokenCodec } from '../infrastructure/security.js';
import type { StoragePort } from '../infrastructure/storage.js';
import { printerCatalog } from '../printer-catalog.js';
import { avatarUrl, randomAvatarKey } from '../services/avatar-service.js';
import type { RealtimeService } from '../services/realtime-service.js';
import type { AppConfig } from '../config.js';

export type AddressInput = {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
};

export const publicUser = (user: User) => ({
  id: user.id,
  username: user.username,
  phone: user.phone,
  nickname: user.nickname,
  avatarUrl: avatarUrl(user.avatarKey, user.id),
  role: user.role,
  isAdmin: user.role === 'ADMIN',
  bio: user.bio,
  wechatId: user.wechatId,
});

export class AuthService {
  private readonly sessionTtlMs = 30 * 86400000;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: TokenCodec,
    private readonly redis?: Redis,
    private readonly otpGateway?: OtpGateway,
    private readonly config?: AppConfig,
  ) {}

  async requestCode(phone: string) {
    if (!this.redis || !this.otpGateway) throw new AppError(501, 'DEPENDENCY_UNAVAILABLE', '短信服务尚未配置');
    const devPhones = new Set(
      (this.config?.DEV_LOGIN_PHONES || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );
    const isDev = this.config?.NODE_ENV !== 'production' && devPhones.has(phone);
    const code = isDev ? '000000' : this.tokens.otp();
    const cooldownKey = `otp:cooldown:${phone}`;
    if (!(await this.redis.set(cooldownKey, '1', 'EX', this.config?.OTP_RESEND_COOLDOWN_SEC || 60, 'NX')))
      throw new AppError(429, 'OTP_RATE_LIMITED', '验证码发送过于频繁，请稍后再试');
    await this.redis.set(`otp:${phone}`, this.tokens.hash(code), 'EX', 300);
    return this.otpGateway.send(phone, code);
  }

  async loginByPhone(phone: string, code: string, inviteCode?: string) {
    if (!this.redis) throw new AppError(501, 'DEPENDENCY_UNAVAILABLE', '短信服务尚未配置');
    const devPhones = new Set(
      (this.config?.DEV_LOGIN_PHONES || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );
    const isDev = this.config?.NODE_ENV !== 'production' && devPhones.has(phone) && code === '000000';
    const stored = isDev ? null : await this.redis.get(`otp:${phone}`);
    if (!isDev && (!stored || stored !== this.tokens.hash(code)))
      throw new AppError(401, 'AUTHENTICATION_REQUIRED', '验证码错误或已过期');
    if (!isDev) await this.redis.del(`otp:${phone}`);
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) return this.createSession(existing);
    // Dev phones bypass invitation gating so the demo accounts work in a dev
    // environment even before the seed has run; production never sets isDev.
    if (isDev) return this.createSession(await this.createPhoneUser(phone));
    // First-time login is gated by an invitation code so phone numbers cannot
    // self-register at will.
    if (!inviteCode || !inviteCode.trim()) throw new AppError(400, 'INVITATION_CODE_INVALID', '首次登录需要邀请码');
    const invite = await this.resolveInvite(inviteCode.trim());
    const user = await this.prisma.$transaction(async (tx) => {
      await this.reserveInvite(tx, invite);
      return tx.user.create({
        data: {
          username: `phone_${phone}`,
          phone,
          nickname: `用户${phone.slice(-4)}`,
          avatarKey: randomAvatarKey(),
          role: 'USER',
          invitationCodeId: invite.id,
        },
      });
    });
    return this.createSession(user);
  }

  /** Loads an invitation code and validates it is active and unexpired. */
  private async resolveInvite(code: string) {
    const invite = await this.prisma.invitationCode.findUnique({ where: { code } });
    if (!invite || invite.disabled) throw new AppError(400, 'INVITATION_CODE_INVALID', '邀请码无效或已停用');
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now())
      throw new AppError(400, 'INVITATION_CODE_INVALID', '邀请码已过期');
    return invite;
  }

  /** Atomically reserves one use of an invitation code inside a transaction. The
   *  WHERE clause guards against concurrent over-use beyond maxUses without
   *  holding a row lock across the request. */
  private async reserveInvite(tx: Prisma.TransactionClient, invite: { id: string; maxUses: number }) {
    const reserved = await tx.invitationCode.updateMany({
      where: { id: invite.id, usedCount: { lt: invite.maxUses }, disabled: false },
      data: { usedCount: { increment: 1 } },
    });
    if (reserved.count === 0) throw new AppError(400, 'INVITATION_CODE_INVALID', '邀请码已达使用上限');
  }

  private async createPhoneUser(phone: string) {
    return this.prisma.user.create({
      data: {
        username: `phone_${phone}`,
        phone,
        nickname: `用户${phone.slice(-4)}`,
        avatarKey: randomAvatarKey(),
        role: 'USER',
      },
    });
  }

  private async createSession(user: User) {
    const token = this.tokens.sessionToken();
    await this.prisma.session.create({
      data: {
        tokenHash: this.tokens.hash(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + this.sessionTtlMs),
      },
    });
    return { token, user: publicUser(user) };
  }

  async logout(token: string) {
    await this.prisma.session.deleteMany({ where: { tokenHash: this.tokens.hash(token) } });
  }

  async updateProfile(userId: string, nickname: string, wechatId: string, bio: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { nickname, wechatId, bio },
    });
    return publicUser(user);
  }

  async resolveSession(token?: string): Promise<User | null> {
    if (!token) return null;
    const session = await this.prisma.session.findFirst({
      where: { tokenHash: this.tokens.hash(token), expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    return session?.user ?? null;
  }
}

export class InvitationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: TokenCodec,
  ) {}

  async create(createdById: string, maxUses: number, expiresAt?: Date) {
    let code = '';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      code = this.tokens.inviteCode();
      if (!(await this.prisma.invitationCode.findUnique({ where: { code } }))) break;
      code = '';
    }
    if (!code) throw new AppError(500, 'INTERNAL_ERROR', '邀请码生成失败，请重试');
    return this.prisma.invitationCode.create({
      data: { code, createdById, maxUses, expiresAt: expiresAt ?? null },
    });
  }

  list() {
    return this.prisma.invitationCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { nickname: true } } },
    });
  }

  async disable(id: string) {
    const result = await this.prisma.invitationCode.updateMany({ where: { id }, data: { disabled: true } });
    if (!result.count) throw new AppError(404, 'RESOURCE_NOT_FOUND', '邀请码不存在');
    return result.count;
  }
}

export class AddressService {
  constructor(private readonly prisma: PrismaClient) {}
  list(userId: string) {
    return this.prisma.shippingAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }
  create(userId: string, body: AddressInput) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.shippingAddress.count({ where: { userId } });
      const isDefault = body.isDefault || count === 0;
      if (isDefault) await tx.shippingAddress.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.shippingAddress.create({ data: { ...body, isDefault, userId } });
    });
  }
  async update(userId: string, id: string, body: AddressInput) {
    const existing = await this.prisma.shippingAddress.findFirst({ where: { id, userId } });
    if (!existing) throw new AppError(404, 'RESOURCE_NOT_FOUND', '收货地址不存在');
    return this.prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.shippingAddress.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.shippingAddress.update({ where: { id }, data: body });
    });
  }
  async remove(userId: string, id: string) {
    const existing = await this.prisma.shippingAddress.findFirst({ where: { id, userId } });
    if (!existing) throw new AppError(404, 'RESOURCE_NOT_FOUND', '收货地址不存在');
    await this.prisma.$transaction(async (tx) => {
      await tx.shippingAddress.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.shippingAddress.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } });
        if (next) await tx.shippingAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }
}

const numberDemand = <T extends Record<string, unknown>>(demand: T) => ({
  ...demand,
  sizeX: demand.sizeX == null ? null : Number(demand.sizeX),
  sizeY: demand.sizeY == null ? null : Number(demand.sizeY),
  sizeZ: demand.sizeZ == null ? null : Number(demand.sizeZ),
  volumeCm3: demand.volumeCm3 == null ? null : Number(demand.volumeCm3),
  estimatedWeight: demand.estimatedWeight == null ? null : Number(demand.estimatedWeight),
  estimatedHours: demand.estimatedHours == null ? null : Number(demand.estimatedHours),
  budget: Number(demand.budget),
});

export class DemandService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StoragePort,
    private readonly config?: AppConfig,
  ) {}
  async list(userId?: string) {
    const rows = await this.prisma.demand.findMany({
      where: userId ? { userId } : { status: { in: ['OPEN', 'QUOTED'] } },
      include: { user: { select: { nickname: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(
      ({ user, modelKey: _model, recipientName: _name, recipientPhone: _phone, shippingAddress: _address, ...row }) =>
        numberDemand({ ...row, nickname: user.nickname }),
    );
  }
  private assertReadable(demand: { userId: string; status: string }, viewer?: Pick<User, 'id' | 'role'>) {
    if (!viewer) throw new AppError(401, 'AUTHENTICATION_REQUIRED', '请先登录');
    if (viewer.id !== demand.userId && viewer.role !== 'ADMIN' && !['OPEN', 'QUOTED'].includes(demand.status))
      throw new AppError(404, 'RESOURCE_NOT_FOUND', '需求不存在');
  }
  async authorizeLocalModel(key: string, viewer: Pick<User, 'id' | 'role'>) {
    const demands = await this.prisma.demand.findMany({
      where: { modelKey: key },
      select: { userId: true, status: true },
    });
    if (!demands.length) throw new AppError(404, 'RESOURCE_NOT_FOUND', '模型不存在');
    // A shared legacy key must not bypass a private demand's access policy.
    for (const demand of demands) this.assertReadable(demand, viewer);
  }
  async get(id: string, viewer?: Pick<User, 'id' | 'role'>) {
    const demand = await this.prisma.demand.findUnique({
      where: { id },
      include: { user: { select: { nickname: true } }, demandActions: { select: { type: true } } },
    });
    if (!demand) throw new AppError(404, 'RESOURCE_NOT_FOUND', '需求不存在');
    this.assertReadable(demand, viewer);
    const {
      user,
      demandActions,
      modelKey,
      recipientName: _name,
      recipientPhone: _phone,
      shippingAddress: _address,
      ...rest
    } = demand;
    return numberDemand({
      ...rest,
      nickname: user.nickname,
      acceptCount: demandActions.filter((action) => action.type === 'ACCEPT').length,
      raiseCount: demandActions.filter((action) => action.type === 'RAISE').length,
      modelUrl: modelKey ? await this.storage.signedUrl(modelKey) : null,
    });
  }
  async create(
    userId: string,
    body: Record<string, unknown> & { addressId: string; deadline?: string },
    file: Express.Multer.File,
  ) {
    const address = await this.assertCreatable(userId, body.addressId);
    const saved = await this.storage.save(file);
    return this.persistDemand(userId, body, address, saved.key, file.originalname);
  }
  /** Creates a demand from an object the client uploaded directly to storage. */
  async createFromKey(
    userId: string,
    body: Record<string, unknown> & { addressId: string; deadline?: string; modelKey: string; modelName: string },
  ) {
    const address = await this.assertCreatable(userId, body.addressId);
    const stat = await this.storage.stat(body.modelKey);
    if (!stat) throw new AppError(400, 'MODEL_FILE_REQUIRED', '模型文件不存在，请重新上传');
    if (stat.size <= 0) throw new AppError(400, 'MODEL_FILE_EMPTY', '模型文件为空，请重新选择 3MF 文件');
    const maxUploadMb = this.config?.MAX_UPLOAD_MB ?? 50;
    if (stat.size > maxUploadMb * 1024 * 1024)
      throw new AppError(400, 'MODEL_FILE_TOO_LARGE', `模型文件不能超过 ${maxUploadMb}MB`);
    const { modelKey, modelName, ...rest } = body;
    return this.persistDemand(userId, rest, address, modelKey, modelName);
  }
  private async assertCreatable(userId: string, addressId: string) {
    const publisher = await this.prisma.user.findUnique({ where: { id: userId }, select: { wechatId: true } });
    if (!publisher?.wechatId.trim()) throw new AppError(409, 'CONTACT_REQUIRED', '请先在个人信息页填写微信号');
    const address = await this.prisma.shippingAddress.findFirst({ where: { id: addressId, userId } });
    if (!address) throw new AppError(400, 'RESOURCE_NOT_FOUND', '请选择当前账号下有效的收货地址');
    return address;
  }
  private persistDemand(
    userId: string,
    body: Record<string, unknown> & { deadline?: string },
    address: { recipientName: string; phone: string; province: string; city: string; district: string; detail: string },
    modelKey: string,
    modelName: string,
  ) {
    const { addressId: _, deadline, ...input } = body;
    return this.prisma.demand.create({
      data: {
        ...(input as Prisma.DemandUncheckedCreateInput),
        userId,
        recipientName: address.recipientName,
        recipientPhone: address.phone,
        shippingAddress: `${address.province}${address.city}${address.district}${address.detail}`,
        deadline: deadline ? new Date(deadline) : null,
        modelKey,
        modelName,
      },
    });
  }
  async review(id: string, action: 'approve' | 'reject', reason: string) {
    const result = await this.prisma.demand.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data: { status: action === 'approve' ? 'OPEN' : 'REJECTED', rejectReason: reason },
    });
    if (!result.count) throw new AppError(409, 'ORDER_STATE_CONFLICT', '需求当前不可审核');
    return this.prisma.demand.findUniqueOrThrow({ where: { id } });
  }
}

export class QuoteService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly realtime: RealtimeService,
  ) {}
  async act(demandId: string, userId: string, type: 'ACCEPT' | 'RAISE') {
    const demand = await this.prisma.demand.findUnique({ where: { id: demandId } });
    if (!demand || !['OPEN', 'QUOTED'].includes(demand.status))
      throw new AppError(409, 'ORDER_STATE_CONFLICT', '该需求当前不可接单');
    if (demand.userId === userId) throw new AppError(403, 'PERMISSION_DENIED', '不能操作自己的需求');
    try {
      const notification = await this.prisma.$transaction(async (tx) => {
        await tx.demandAction.create({ data: { demandId, userId, type } });
        await tx.demand.update({
          where: { id: demandId },
          data:
            type === 'ACCEPT' ? { acceptCount: { increment: 1 }, status: 'QUOTED' } : { raiseCount: { increment: 1 } },
        });
        return tx.notification.create({
          data: {
            userId: demand.userId,
            type: type === 'RAISE' ? 'DEMAND_BUDGET_LOW' : 'DEMAND_ACCEPTED',
            title: type === 'RAISE' ? '打印方反馈预算偏低' : '打印方愿意承接需求',
            body:
              type === 'RAISE'
                ? `你的需求“${demand.title}”收到预算偏低反馈，建议检查预算后重新评估。`
                : `你的需求“${demand.title}”收到新的接单意向，可前往需求详情查看。`,
          },
        });
      });
      this.realtime.publish({ userId: demand.userId, kind: 'notification', resourceId: notification.id });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002')
        throw new AppError(409, 'CONCURRENT_MODIFICATION', '你已经执行过该操作');
      throw error;
    }
  }
}

export class ContactRequestService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly realtime: RealtimeService,
  ) {}

  async request(demandId: string, requesterId: string) {
    const demand = await this.prisma.demand.findUnique({ where: { id: demandId } });
    if (!demand || !['OPEN', 'QUOTED'].includes(demand.status))
      throw new AppError(409, 'ORDER_STATE_CONFLICT', '该需求当前不可申请联系方式');
    if (demand.userId === requesterId) throw new AppError(403, 'PERMISSION_DENIED', '不能申请自己的联系方式');

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const contactRequest = await tx.contactRequest.create({
          data: { demandId, requesterId, ownerId: demand.userId },
        });
        const requester = await tx.user.findUniqueOrThrow({ where: { id: requesterId }, select: { nickname: true } });
        const notification = await tx.notification.create({
          data: {
            userId: demand.userId,
            demandId,
            type: 'CONTACT_REQUESTED',
            title: '收到微信联系方式申请',
            body: `${requester.nickname} 希望承接“${demand.title}”，请前往需求详情处理。`,
          },
        });
        return { contactRequest, notification };
      });
      this.realtime.publish({ userId: demand.userId, kind: 'notification', resourceId: result.notification.id });
      return result.contactRequest;
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002')
        throw new AppError(409, 'CONCURRENT_MODIFICATION', '你已经申请过该需求的联系方式');
      throw error;
    }
  }

  async listForDemand(demandId: string, ownerId: string) {
    const demand = await this.prisma.demand.findFirst({ where: { id: demandId, userId: ownerId } });
    if (!demand) throw new AppError(404, 'RESOURCE_NOT_FOUND', '需求不存在');
    return this.prisma.contactRequest.findMany({
      where: { demandId },
      include: { requester: { select: { nickname: true, avatarKey: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMine(demandId: string, requesterId: string) {
    return this.prisma.contactRequest.findUnique({
      where: { demandId_requesterId: { demandId, requesterId } },
      select: { id: true, status: true, createdAt: true, approvedAt: true },
    });
  }

  async approve(id: string, ownerId: string) {
    const contactRequest = await this.prisma.contactRequest.findFirst({
      where: { id, ownerId },
      include: { demand: { select: { id: true, title: true } }, owner: { select: { wechatId: true, nickname: true } } },
    });
    if (!contactRequest) throw new AppError(404, 'RESOURCE_NOT_FOUND', '联系方式申请不存在');
    if (contactRequest.status !== 'PENDING') throw new AppError(409, 'ORDER_STATE_CONFLICT', '该申请已经处理');
    if (!contactRequest.owner.wechatId.trim())
      throw new AppError(409, 'CONTACT_REQUIRED', '请先在个人信息页填写微信号');

    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.contactRequest.updateMany({
        where: { id, ownerId, status: 'PENDING' },
        data: { status: 'APPROVED', approvedAt: new Date() },
      });
      if (!changed.count) throw new AppError(409, 'CONCURRENT_MODIFICATION', '该申请已经处理');
      const notification = await tx.notification.create({
        data: {
          userId: contactRequest.requesterId,
          demandId: contactRequest.demand.id,
          type: 'CONTACT_APPROVED',
          title: '需求方已同意你的微信申请',
          body: `${contactRequest.owner.nickname} 的微信号：${contactRequest.owner.wechatId}。请添加好友并说明来自印蛙需求“${contactRequest.demand.title}”。`,
        },
      });
      return { notification, request: await tx.contactRequest.findUniqueOrThrow({ where: { id } }) };
    });
    this.realtime.publish({
      userId: contactRequest.requesterId,
      kind: 'notification',
      resourceId: result.notification.id,
    });
    return result.request;
  }
}

export class PrinterService {
  constructor(private readonly prisma: PrismaClient) {}
  list(userId: string) {
    return this.prisma.printer.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
  async create(userId: string, body: Record<string, unknown> & { catalogId: string }) {
    const catalog = printerCatalog.find((item) => item.id === body.catalogId);
    if (!catalog) throw new AppError(400, 'VALIDATION_ERROR', '请选择目录中的有效设备型号');
    const { catalogId: _, ...input } = body;
    return this.prisma.printer.create({
      data: {
        ...(input as Prisma.PrinterUncheckedCreateInput),
        model: `${catalog.brand} ${catalog.model}`,
        technology: catalog.technology,
        maxX: catalog.maxX,
        maxY: catalog.maxY,
        maxZ: catalog.maxZ,
        colorMode: catalog.colorMode,
        maxColors: catalog.maxColors,
        enclosed: catalog.enclosed,
        userId,
      },
    });
  }
}

export class NotificationService {
  constructor(private readonly prisma: PrismaClient) {}
  async notifications(userId: string, page: number, limit: number) {
    const where = { userId };
    const [items, unreadCount, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, unreadCount, total, page, limit };
  }
  async readNotification(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    if (!result.count) throw new AppError(404, 'RESOURCE_NOT_FOUND', '通知不存在');
    return result.count;
  }
  async readAllNotifications(userId: string) {
    return (
      await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
    ).count;
  }
}

export class CatalogService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StoragePort,
  ) {}
  async publicConfig() {
    const [materials, colors, rules] = await Promise.all([
      this.prisma.material.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.colorOption.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      this.prisma.pricingRule.findMany(),
    ]);
    return {
      materials: materials.map((item) => ({ ...item, pricePerGram: Number(item.pricePerGram) })),
      colors: colors.map((item) => ({ ...item, multiplier: Number(item.multiplier) })),
      rules: Object.fromEntries(rules.map((rule) => [rule.key, { ...rule, value: Number(rule.value) }])),
    };
  }
  async adminConfig() {
    const [materials, colors, rules] = await Promise.all([
      this.prisma.material.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.colorOption.findMany(),
      this.prisma.pricingRule.findMany(),
    ]);
    return {
      materials: materials.map((item) => ({ ...item, pricePerGram: Number(item.pricePerGram) })),
      colors: colors.map((item) => ({ ...item, multiplier: Number(item.multiplier) })),
      rules: rules.map((item) => ({ ...item, value: Number(item.value) })),
    };
  }
  async reviews() {
    const demands = await this.prisma.demand.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: { user: { select: { nickname: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      demands.map(async (demand) =>
        numberDemand({ ...demand, modelUrl: demand.modelKey ? await this.storage.signedUrl(demand.modelKey) : null }),
      ),
    );
  }
  updateMaterial(id: string, data: Prisma.MaterialUpdateInput) {
    return this.prisma.material.update({ where: { id }, data });
  }
  updateRule(key: string, value: number) {
    return this.prisma.pricingRule.update({ where: { key }, data: { value } });
  }
  updateColor(id: string, data: Prisma.ColorOptionUpdateInput) {
    return this.prisma.colorOption.update({ where: { id }, data });
  }
}

/**
 * Issues short-lived STS credentials so clients can upload models directly to
 * OSS. The gateway is only wired when STORAGE_PROVIDER=oss; otherwise issuing
 * fails with 501 and clients keep using the server-mediated upload path.
 */
export class UploadCredentialsService {
  constructor(
    private readonly gateway: StsGatewayPort | undefined,
    private readonly config: AppConfig,
  ) {}

  async issue(userId: string) {
    if (!this.gateway) throw new AppError(501, 'DEPENDENCY_UNAVAILABLE', '上传凭证服务未配置');
    // Per-user session name (≤64 chars, [a-zA-Z0-9.@-_]) so Aliyun action logs
    // can trace an upload back to the account that obtained the credentials.
    const credentials = await this.gateway.assumeRole(`${this.config.OSS_STS_SESSION_NAME}-${userId}`.slice(0, 64));
    return {
      ...credentials,
      upload: {
        provider: 'oss',
        bucket: this.config.OSS_BUCKET!,
        region: this.config.OSS_REGION!,
        ...(this.config.OSS_ENDPOINT ? { endpoint: this.config.OSS_ENDPOINT } : {}),
        prefix: this.config.OSS_PREFIX,
        maxSizeMb: this.config.MAX_UPLOAD_MB,
        allowedExtensions: ['.3mf'],
      },
    };
  }
}
