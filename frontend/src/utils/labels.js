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

/** Audit log actions; mirrors what the API records (see docs/api.md). */
export const AUDIT_ACTION_LABELS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.logout': 'Signed out',
  'account.profile_updated': 'Profile updated',
  'account.password_changed': 'Password changed',
  'account.sessions_revoked': 'Other sessions signed out',
  'user.created': 'User created',
  'user.updated': 'User updated',
  'user.password_reset': 'Password reset',
  'order.created': 'Order placed',
  'order.status_changed': 'Order status changed',
  'order.bulk_status_changed': 'Bulk status change',
  'order.note_added': 'Order note added',
  'inventory.adjusted': 'Stock adjusted',
  'product.created': 'Product created',
  'product.updated': 'Product updated',
  'product.deleted': 'Product deleted',
  'category.created': 'Category created',
  'category.updated': 'Category updated',
  'category.deleted': 'Category deleted',
  'customer.created': 'Customer created',
  'customer.updated': 'Customer updated',
  'customer.deleted': 'Customer deleted',
};
