export const orderActions = ['start', 'ship', 'complete', 'dispute'] as const;
export type OrderAction = (typeof orderActions)[number];
export type OrderStatus =
  'AWAITING_PAYMENT' | 'PAID' | 'PRINTING' | 'SHIPPED' | 'COMPLETED' | 'DISPUTED' | 'CANCELLED' | 'REFUNDED';
export type EscrowStatus = 'UNPAID' | 'HELD' | 'RELEASED' | 'REFUNDED';

export interface OrderAggregate {
  id: string;
  orderNo: string;
  buyerId: string;
  makerId: string;
  status: OrderStatus;
  escrowStatus: EscrowStatus;
  carrier: string;
  trackingNo: string;
  disputeReason: string;
  version: number;
}

export function canApplyOrderAction(order: OrderAggregate, actorId: string, action: OrderAction) {
  if (action === 'start') return order.makerId === actorId && order.status === 'PAID';
  if (action === 'ship') return order.makerId === actorId && order.status === 'PRINTING';
  if (action === 'complete') return order.buyerId === actorId && order.status === 'SHIPPED';
  return (
    (order.buyerId === actorId || order.makerId === actorId) && ['PAID', 'PRINTING', 'SHIPPED'].includes(order.status)
  );
}

export const nextOrderStatus = (action: OrderAction): OrderStatus =>
  action === 'start' ? 'PRINTING' : action === 'ship' ? 'SHIPPED' : action === 'complete' ? 'COMPLETED' : 'DISPUTED';
