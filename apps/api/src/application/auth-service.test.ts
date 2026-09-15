import { describe, expect, test, vi } from 'vitest';
import { AuthService } from './backend-services.js';
import { TokenCodec } from '../infrastructure/security.js';

const tokens = new TokenCodec('test-session-secret-at-least-32-characters');
const validInvite = { id: 'ic-1', code: 'WELCOME1', maxUses: 10, disabled: false, expiresAt: null };
type Invite = { id: string; code: string; maxUses: number; disabled: boolean; expiresAt: Date | null };

const phone = '13900001234';
const otpCode = '123456';
const phoneUser = {
  id: 'u-phone',
  username: `phone_${phone}`,
  phone,
  nickname: '用户1234',
  avatarKey: 'av1',
  role: 'USER',
  bio: '',
};

interface PhoneLoginSetup {
  existingUser?: { id: string; phone: string } | null;
  invite?: Invite | null;
  reservedCount?: number;
  createdUser?: typeof phoneUser;
  nodeEnv?: string;
  devPhones?: string;
}

function setupPhoneLogin({
  existingUser = null,
  invite = null,
  reservedCount = 1,
  createdUser: created = phoneUser,
  nodeEnv = 'production',
  devPhones = '',
}: PhoneLoginSetup = {}) {
  const tx = {
    invitationCode: { updateMany: vi.fn().mockResolvedValue({ count: reservedCount }) },
    user: { create: vi.fn().mockResolvedValue(created) },
  };
  const redis = {
    get: vi.fn().mockResolvedValue(tokens.hash(otpCode)),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(existingUser), create: vi.fn().mockResolvedValue(created) },
    invitationCode: { findUnique: vi.fn().mockResolvedValue(invite) },
    session: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const config = { NODE_ENV: nodeEnv, DEV_LOGIN_PHONES: devPhones } as never;
  const service = new AuthService(prisma as never, tokens, redis as never, undefined, config);
  return { service, prisma, tx, redis };
}

describe('AuthService.loginByPhone', () => {
  test('logs an existing user in without an invite code', async () => {
    const { service, prisma } = setupPhoneLogin({
      existingUser: { id: 'u1', phone },
      nodeEnv: 'test',
      devPhones: phone,
    });
    const result = await service.loginByPhone(phone, '000000');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { phone } });
    expect(prisma.session.create).toHaveBeenCalled();
    expect(result.user.phone).toBe(phone);
  });

  test('auto-registers a dev phone without an invite code (dev bypass)', async () => {
    const { service, prisma, tx } = setupPhoneLogin({
      nodeEnv: 'test',
      devPhones: phone,
    });
    const result = await service.loginByPhone(phone, '000000');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ invitationCodeId: expect.anything() }) }),
    );
    expect(tx.invitationCode.updateMany).not.toHaveBeenCalled();
    expect(result.user.role).toBe('USER');
  });

  test('rejects a first-time login without an invite code', async () => {
    const { service } = setupPhoneLogin();
    await expect(service.loginByPhone(phone, otpCode)).rejects.toMatchObject({
      status: 400,
      code: 'INVITATION_CODE_INVALID',
      message: '首次登录需要邀请码',
    });
  });

  test('rejects an invalid invitation code on first-time login', async () => {
    const { service } = setupPhoneLogin({ invite: null });
    await expect(service.loginByPhone(phone, otpCode, 'NOPE')).rejects.toMatchObject({
      status: 400,
      code: 'INVITATION_CODE_INVALID',
      message: '邀请码无效或已停用',
    });
  });

  test('rejects an exhausted invitation code on first-time login', async () => {
    const { service, tx } = setupPhoneLogin({ invite: validInvite, reservedCount: 0 });
    await expect(service.loginByPhone(phone, otpCode, 'WELCOME1')).rejects.toMatchObject({
      status: 400,
      code: 'INVITATION_CODE_INVALID',
      message: '邀请码已达使用上限',
    });
    expect(tx.invitationCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'ic-1', usedCount: { lt: 10 }, disabled: false },
      data: { usedCount: { increment: 1 } },
    });
  });

  test('registers a new phone with a valid invite code and binds it', async () => {
    const { service, tx } = setupPhoneLogin({ invite: validInvite });
    const result = await service.loginByPhone(phone, otpCode, 'WELCOME1');
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        username: `phone_${phone}`,
        phone,
        nickname: '用户1234',
        avatarKey: expect.any(String),
        role: 'USER',
        invitationCodeId: 'ic-1',
      },
    });
    expect(result.user.role).toBe('USER');
    expect(typeof result.token).toBe('string');
  });
});
