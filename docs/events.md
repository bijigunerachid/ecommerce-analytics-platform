# Business event contracts

The backend records business events in the `event_outbox` table **in the same database transaction**
as the change they describe. The outbox relay (`npm run relay`) then publishes them to Kafka. An
event therefore exists if and only if its change was committed.

## Kafka topics

| Topic                 | Events                                         | Message key  | Partitions |
| --------------------- | ---------------------------------------------- | ------------ | ---------- |
| `ecommerce.orders`    | `order.created`, `order.status_changed`        | order id     | 3          |
| `ecommerce.inventory` | `inventory.stock_changed`                      | product id   | 3          |

The `ecommerce` prefix comes from `KAFKA_TOPIC_PREFIX`. Keying by entity id sends all events for
one order (or product) to the same partition, so consumers see them in the order they happened.
Topic auto-creation is disabled on the broker; the relay creates these topics on startup.

### Message format

The **value** is a JSON envelope:

```json
{
  "eventId": "5b0c2f0e-6a3e-4a59-9a43-6f2b2f6c7f10",
  "eventType": "order.created",
  "schemaVersion": 1,
  "aggregateType": "order",
  "aggregateId": "42",
  "occurredAt": "2026-10-10T20:15:00.000Z",
  "payload": { "...": "event-specific body, see below" }
}
```

**Headers:** `event_id`, `event_type`, `schema_version`, so consumers can route or filter without
parsing the value. The Kafka **timestamp** is `occurredAt`.

## Delivery guarantees

- **At-least-once.** Events are marked published only after Kafka acknowledges them (`acks=all`,
  idempotent producer). If the relay crashes after Kafka accepted a batch but before it recorded
  that, the batch is sent again. **Consumers must deduplicate on `eventId`.**
- **Ordered.** The relay publishes in outbox insertion order (`event_outbox.seq`). Only one relay
  publishes at a time (a PostgreSQL advisory lock); extra relays wait as hot standbys. A failed
  batch is retried before anything after it, so events are never reordered.
- **No loss while Kafka is down.** Events stay in PostgreSQL. The relay retries with exponential
  backoff (1 s, 2 s, 4 s, ... up to 30 s) and catches up when Kafka returns. Each failed attempt is
  recorded on the event (`attempts`, `last_error`) and shows up in `GET /api/pipeline/health`.
- An event that can never be published (e.g. larger than Kafka's message limit) would halt the
  relay rather than be skipped, which keeps ordering intact. It is visible through
  `last_error` in the health endpoint.

## Outbox table

Each outbox row has these columns:

| Column           | Description                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `event_id`       | UUID, unique per event. **Consumers deduplicate on this.**         |
| `event_type`     | e.g. `order.created`                                               |
| `aggregate_type` | `order` or `product`                                               |
| `aggregate_id`   | id of the order/product, as a string (Kafka partition key)         |
| `payload`        | JSON body described below                                          |
| `occurred_at`    | When the event was recorded (transaction time, UTC)                |
| `seq`            | Insertion order; the relay publishes in this order                 |
| `published_at`   | When Kafka acknowledged it; `NULL` while pending                   |
| `attempts`, `last_error` | Publish attempts and the most recent failure               |

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
