export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Allowed next statuses; mirrors the backend's order lifecycle (src/domain/order-status.js). */
export const ORDER_TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export const MOVEMENT_REASON_LABELS = {
  order: 'Order',
  cancellation: 'Cancellation',
  restock: 'Restock',
  adjustment: 'Adjustment',
};
