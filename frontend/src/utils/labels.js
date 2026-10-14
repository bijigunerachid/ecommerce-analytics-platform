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

/** Button text for moving an order to a status. */
export const ORDER_ACTION_LABELS = {
  paid: 'Mark as paid',
  shipped: 'Mark as shipped',
  delivered: 'Mark as delivered',
  cancelled: 'Cancel order',
};

export const MOVEMENT_REASON_LABELS = {
  order: 'Order',
  cancellation: 'Cancellation',
  restock: 'Restock',
  adjustment: 'Adjustment',
};

/** Customer segments; rules in the backend's insights service (see docs/api.md). */
export const SEGMENT_LABELS = {
  prospect: 'No orders yet',
  new: 'New customer',
  returning: 'Returning',
  loyal: 'Loyal',
  lapsed: 'Lapsed',
};
