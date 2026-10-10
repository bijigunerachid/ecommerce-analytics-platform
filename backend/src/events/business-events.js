// Builders for business events written to event_outbox (and later relayed to Kafka).
// Each builder returns { eventType, aggregateType, aggregateId, payload }. Payloads carry a
// schemaVersion so consumers can handle contract changes. Money values are decimal strings.
// The full contracts are documented in docs/events.md.

export const EVENT_SCHEMA_VERSION = 1;

export function orderCreated(order) {
  return {
    eventType: 'order.created',
    aggregateType: 'order',
    aggregateId: String(order.id),
    payload: {
      schemaVersion: EVENT_SCHEMA_VERSION,
      orderId: order.id,
      customerId: order.customerId,
      status: order.status,
      totalAmount: order.totalAmount,
      itemCount: order.items.length,
      items: order.items.map((i) => ({
        productId: i.productId,
        sku: i.sku,
        categoryId: i.categoryId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
      createdAt: order.createdAt,
    },
  };
}

export function orderStatusChanged({ order, fromStatus, changedAt }) {
  return {
    eventType: 'order.status_changed',
    aggregateType: 'order',
    aggregateId: String(order.id),
    payload: {
      schemaVersion: EVENT_SCHEMA_VERSION,
      orderId: order.id,
      customerId: order.customerId,
      fromStatus,
      toStatus: order.status,
      totalAmount: order.totalAmount,
      changedAt,
    },
  };
}

export function stockMovementRecorded(movement) {
  return {
    eventType: 'inventory.stock_changed',
    aggregateType: 'product',
    aggregateId: String(movement.productId),
    payload: {
      schemaVersion: EVENT_SCHEMA_VERSION,
      movementId: movement.id,
      productId: movement.productId,
      quantityChange: movement.quantityChange,
      stockAfter: movement.stockAfter,
      reason: movement.reason,
      orderId: movement.orderId,
      occurredAt: movement.createdAt,
    },
  };
}
