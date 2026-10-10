# Database design

PostgreSQL is the system of record for all transactional data. Kafka and Spark only receive
copies of business events for analytics; they never own order or inventory state.

Migrations live in `backend/migrations/` as plain SQL files (`-- Up Migration` / `-- Down Migration`)
and are applied with [node-pg-migrate](https://github.com/salsita/node-pg-migrate). Applied
migrations are tracked in the `pgmigrations` table. Each run executes in a single transaction, so a
failing migration leaves the schema unchanged.

## Tables

| Table             | Purpose                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `users`           | Staff accounts. `role` is `admin` or `analyst`. Emails stored lowercase. |
| `categories`      | Product categories.                                                      |
| `products`        | Catalog with `price` and current `stock_quantity`.                       |
| `customers`       | Customer records (synthetic data only).                                  |
| `orders`          | Order header: customer, status, backend-computed `total_amount`.         |
| `order_items`     | Order lines with the unit price captured at order time.                  |
| `stock_movements` | Append-only inventory ledger: every stock change and its reason.         |
| `event_outbox`    | Business events waiting to be relayed to Kafka.                          |

```
categories 1──* products 1──* order_items *──1 orders *──1 customers
                    │                            │
                    └──* stock_movements *───────┘ (optional order link)
users ── created_by on orders and stock_movements
```

## Integrity rules enforced by the database

The service layer validates input first. These constraints are the safety net if a bug or a
race condition slips past it.

| Rule                                                 | Constraint                                  |
| ---------------------------------------------------- | ------------------------------------------- |
| Stock can never go negative (no overselling)         | `products_stock_nonnegative`                |
| Prices and totals are non-negative                   | `products_price_nonnegative`, `orders_total_nonnegative` |
| A line total always equals quantity × unit price     | `order_items_line_total_matches`            |
| Quantities are positive                              | `order_items_quantity_positive`             |
| A retried order request cannot create a second order | `orders_idempotency_key_unique`             |
| A retried stock change cannot be applied twice       | `stock_movements_idempotency_key_unique`    |
| Order status is one of pending/paid/shipped/delivered/cancelled | `orders_status_valid`            |
| User role is admin or analyst                        | `users_role_valid`                          |
| Categories, products, customers in use cannot be deleted | `ON DELETE RESTRICT` foreign keys        |

`updated_at` columns are maintained by the `set_updated_at()` trigger.

## Money

Monetary values use `numeric(12,2)`, never floating point. The `pg` driver returns `numeric`
columns as strings so no precision is lost in JavaScript.

## Transactional outbox

When an order is created, the order rows, the stock decrement, the stock movement, and an
`order.created` row in `event_outbox` are written in **one transaction**. A separate relay then
publishes unpublished outbox rows to Kafka and sets `published_at`. This guarantees that an event
is published if and only if its business change committed, even if Kafka is temporarily down.
`event_id` (UUID) is the deduplication key for the streaming pipeline. Event contracts are in
[events.md](events.md).

## Concurrency and idempotency

- **Overselling:** order creation locks the product rows (`SELECT ... FOR UPDATE`) before checking
  stock, so concurrent orders for the same product run one after another. Locks are always taken
  in ascending product id order, so two orders can never deadlock waiting on each other.
  `products_stock_nonnegative` is the final safety net.
- **Retried requests:** a transaction-scoped advisory lock on the idempotency key
  (`pg_advisory_xact_lock(hashtext(key))`) makes concurrent requests with the same key wait for
  each other. The waiting one then finds the committed order and returns it instead of creating
  another. The unique constraint on `idempotency_key` backs this up.
- **Status changes** lock the order row, so two simultaneous cancellations cannot both restore
  stock.
- **Ledger keys:** the order flow generates movement keys like `order-42-product-3` and
  `order-42-cancel-product-3`. Client keys for manual adjustments are stored as `client:<key>`, so
  the two can never collide.
