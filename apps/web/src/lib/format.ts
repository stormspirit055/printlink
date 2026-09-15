/**
 * Single source of truth for user-facing status copy. Demand, quote and order
 * statuses all flow through here so labels never drift between screens.
 */
export const statusLabel: Record<string, string> = {
  // demand
  PENDING_REVIEW: '待审核',
  OPEN: '开放报价',
  QUOTED: '已有报价',
  MATCHED: '已匹配',
  REJECTED: '未通过',
  CANCELLED: '已取消',
  // order / escrow
  AWAITING_PAYMENT: '待付款',
  PAID: '已托管',
  PRINTING: '打印中',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  DISPUTED: '争议中',
  REFUNDED: '已退款',
};

/** Back-compat alias; prefer `statusLabel` in new code. */
export const demandStatus = statusLabel;

export const money = (value: number | string) =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(Number(value));

export const statusText = (status: string | undefined | null): string =>
  (status && statusLabel[status]) || status || '';

/** Naive UI NTag `type` per status, for consistent status chips across screens. */
export const statusTagType: Record<string, 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'> = {
  PENDING_REVIEW: 'warning',
  OPEN: 'primary',
  QUOTED: 'primary',
  MATCHED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
  AWAITING_PAYMENT: 'warning',
  PAID: 'info',
  PRINTING: 'info',
  SHIPPED: 'info',
  COMPLETED: 'success',
  DISPUTED: 'warning',
  REFUNDED: 'error',
};

export const tagTypeFor = (status: string | undefined | null) => (status && statusTagType[status]) || 'default';
