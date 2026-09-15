import { describe, expect, test } from 'vitest';
import { demandStatus, money } from './format';

describe('shared presentation contracts', () => {
  test('maps persisted demand states to user-facing labels', () => {
    expect(demandStatus.PENDING_REVIEW).toBe('待审核');
    expect(demandStatus.COMPLETED).toBe('已完成');
  });

  test('formats monetary values as Chinese yuan', () => {
    expect(money(128.5)).toContain('128.50');
    expect(money(128.5)).toContain('¥');
  });
});
