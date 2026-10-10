# Business event contracts

The backend records business events in the `event_outbox` table **in the same database transaction**
as the change they describe. A relay (added in the Kafka step) publishes them to Kafka. An event
therefore exists if and only if its change was committed.

## Envelope

Each outbox row has these columns:

| Column           | Description                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `event_id`       | UUID, unique per event. **Consumers deduplicate on this.**         |
| `event_type`     | e.g. `order.created`                                               |
| `aggregate_type` | `order` or `product`                                               |
| `aggregate_id`   | id of the order/product, as a string (Kafka partition key)         |
| `payload`        | JSON body described below                                          |
| `occurred_at`    | When the event was recorded (transaction time, UTC)                |

## Conventions

- Every payload has a `schemaVersion` (currently `1`). Additive changes keep the version;
  breaking changes increment it.
- Money values are decimal strings with 2 decimals (`"19.99"`), never floats.
- Timestamps are ISO-8601 UTC strings.
- Ids are integers.

## `order.created`

Emitted when an order is placed. Retried requests do **not** emit a second event.

```json
{
  "schemaVersion": 1,
  "orderId": 42,
  "customerId": 7,
  "status": "pending",
  "totalAmount": "2059.95",
  "itemCount": 2,
  "items": [
    { "productId": 3, "sku": "LAP-1", "categoryId": 1, "quantity": 2, "unitPrice": "999.99", "lineTotal": "1999.98" },
    { "productId": 5, "sku": "MOU-1", "categoryId": 1, "quantity": 3, "unitPrice": "19.99", "lineTotal": "59.97" }
  ],
  "createdAt": "2026-10-10T20:15:00.000Z"
}
```

## `order.status_changed`

Emitted for every allowed status transition (`pending → paid`, `paid → shipped`, ...,
`→ cancelled`).

```json
{
  "schemaVersion": 1,
  "orderId": 42,
  "customerId": 7,
  "fromStatus": "paid",
  "toStatus": "cancelled",
  "totalAmount": "2059.95",
  "changedAt": "2026-10-10T21:00:00.000Z"
}
```

Analytics should count revenue from `order.created` and subtract it on a transition to
`cancelled`.

## `inventory.stock_changed`

Emitted for every inventory ledger entry: order placement (`order`), cancellation restock
(`cancellation`), manual `restock` and `adjustment`, and initial stock on product creation.
Partitioned by product.

```json
{
  "schemaVersion": 1,
  "movementId": 118,
  "productId": 3,
  "quantityChange": -2,
  "stockAfter": 3,
  "reason": "order",
  "orderId": 42,
  "occurredAt": "2026-10-10T20:15:00.000Z"
}
```

`orderId` is `null` for manual movements. `stockAfter` is the product's stock level right after
this movement was applied.
