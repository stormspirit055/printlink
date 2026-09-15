import type { Order } from '@prisma/client';
import { describe, expect, test } from 'vitest';
import { canApplyOrderAction } from './order.js';

const order = (status: Order['status']) => ({ id: 'order-1', buyerId: 'buyer-1', makerId: 'maker-1', status }) as Order;

describe('order action authorization', () => {
  test('only the maker can start a paid order', () => {
    expect(canApplyOrderAction(order('PAID'), 'maker-1', 'start')).toBe(true);
    expect(canApplyOrderAction(order('PAID'), 'buyer-1', 'start')).toBe(false);
  });
  test('only the maker can ship an order in production', () => {
    expect(canApplyOrderAction(order('PRINTING'), 'maker-1', 'ship')).toBe(true);
    expect(canApplyOrderAction(order('PAID'), 'maker-1', 'ship')).toBe(false);
  });
  test('only the buyer can complete a shipped order', () => {
    expect(canApplyOrderAction(order('SHIPPED'), 'buyer-1', 'complete')).toBe(true);
    expect(canApplyOrderAction(order('SHIPPED'), 'maker-1', 'complete')).toBe(false);
  });
  test('a dispute is limited to active fulfillment states', () => {
    expect(canApplyOrderAction(order('PRINTING'), 'buyer-1', 'dispute')).toBe(true);
    expect(canApplyOrderAction(order('PRINTING'), 'unrelated-user', 'dispute')).toBe(false);
    expect(canApplyOrderAction(order('COMPLETED'), 'buyer-1', 'dispute')).toBe(false);
  });
});
