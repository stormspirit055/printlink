import { describe, expect, test, vi } from 'vitest';
import { NotificationService } from './backend-services.js';

function setup() {
  const prisma = {
    notification: {
      findMany: vi.fn().mockResolvedValue([{ id: 'n-1' }, { id: 'n-2' }]),
      count: vi
        .fn()
        .mockResolvedValueOnce(1) // unreadCount
        .mockResolvedValueOnce(3), // total
    },
  };
  const service = new NotificationService(prisma as never);
  return { service, prisma };
}

describe('NotificationService.notifications', () => {
  test('returns a page with pagination metadata', async () => {
    const { service, prisma } = setup();

    await expect(service.notifications('user-1', 2, 10)).resolves.toEqual({
      items: [{ id: 'n-1' }, { id: 'n-2' }],
      unreadCount: 1,
      total: 3,
      page: 2,
      limit: 10,
    });
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
  });
});
