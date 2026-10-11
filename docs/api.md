# API reference

Base URL (local): `http://localhost:4000/api`

All requests and responses use JSON. Authentication uses an **HttpOnly session cookie**
(`access_token`) set by `POST /auth/login`; browsers send it automatically. From the frontend,
call the API with `credentials: 'include'`.

## Errors

Every error response has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [] } }
```

| Status | `code`              | When                                                      |
| ------ | ------------------- | --------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`  | Input failed validation; `details` lists each problem     |
| 400    | `INVALID_JSON`      | Body is not valid JSON                                    |
| 401    | `UNAUTHORIZED`      | Not logged in, session expired, or bad credentials        |
| 403    | `FORBIDDEN`         | Logged in, but your role is not allowed                   |
| 404    | `NOT_FOUND`         | Unknown route or resource                                 |
| 409    | `CONFLICT`          | Duplicate (e.g. email already in use)                     |
| 413    | `PAYLOAD_TOO_LARGE` | Body over 100 KB                                          |
| 429    | `TOO_MANY_REQUESTS` | Login rate limit hit                                      |
| 500    | `INTERNAL_ERROR`    | Unexpected server error (details are logged, not returned) |

Validation `details` items look like `{ "location": "body", "path": "email", "message": "..." }`.
Unknown body fields are rejected.

## Roles

| Role      | Can                                                    |
| --------- | ------------------------------------------------------ |
| `admin`   | Everything, including user management                  |
| `analyst` | Read operational data (categories, products, ...) and analytics |

The role is re-read from the database on every request, so deactivating a user or changing their
role takes effect immediately, even for existing sessions.

## Health

### `GET /health`

Readiness check, including the database. `200` when healthy, `503` when a dependency is down.

```json
{ "status": "ok", "uptimeSeconds": 42, "checks": { "database": "up" } }
```

### `GET /health/live`

Liveness check; `200` whenever the process is running. Does not touch the database.

## Authentication

### `POST /auth/login`

```json
{ "email": "admin@example.com", "password": "..." }
```

- `200` → `{ "user": { "id", "email", "fullName", "role", "isActive", "lastLoginAt", "createdAt", "updatedAt" } }`
  and sets the `access_token` cookie (`HttpOnly; SameSite=Strict; Path=/api`, plus `Secure` in
  production). The token is never returned in the body.
- `401` for a wrong password, unknown email, or deactivated account. The message is the same in
  every case so attackers cannot discover which emails exist.
- `429` after `LOGIN_RATE_LIMIT_MAX` attempts per IP per `LOGIN_RATE_LIMIT_WINDOW_MINUTES`.

### `POST /auth/logout`

Clears the session cookie. `204`. Works whether or not you are logged in.

### `GET /auth/me`

Returns `{ "user": { ... } }` for the current session, or `401`.

## Users (admin only)

### `GET /users`

`200` → `{ "users": [ ... ] }`. Password hashes are never returned.

### `POST /users`

```json
{ "email": "analyst@example.com", "password": "at-least-12-chars", "fullName": "Ana Lyst", "role": "analyst" }
```

- Email is trimmed and lowercased. Password must be 12–72 bytes. Role is `admin` or `analyst`.
- `201` → `{ "user": { ... } }`, `409` if the email is taken.

## Conventions for resource endpoints

- **Access:** any signed-in user (admin or analyst) can `GET`; only admins can `POST`, `PATCH`,
  or `DELETE` (others get `403`).
- **Ids** are positive integers; a non-numeric id returns `400`, an unknown one `404`.
- **Money** is a decimal string with up to 2 decimals, e.g. `"19.99"`. Numbers are accepted on
  input and returned as strings, so no precision is lost to floating point.
- **`PATCH`** updates only the fields you send. Sending `""` or `null` for `description` clears it.
  An empty body returns `400`.
- **Lists** accept these query parameters and return `{ data: [...], pagination }`:

| Parameter  | Default | Notes                                                    |
| ---------- | ------- | -------------------------------------------------------- |
| `page`     | `1`     | 1-based                                                  |
| `pageSize` | `20`    | 1–100                                                    |
| `sort`     | varies  | One of the resource's sort fields; anything else is `400` |
| `order`    | `asc`   | `asc` or `desc`                                          |
| `search`   |         | Case-insensitive substring; `%` and `_` match literally  |

```json
{ "data": [], "pagination": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }
```

## Categories

| Method & path            | Body / query                           | Success            |
| ------------------------ | -------------------------------------- | ------------------ |
| `GET /categories`        | list params; `sort`: `name`, `createdAt`, `productCount` | `200` list |
| `GET /categories/:id`    |                                        | `200 { category }` |
| `POST /categories`       | `{ name, description? }`               | `201 { category }` |
| `PATCH /categories/:id`  | any of `name`, `description`           | `200 { category }` |
| `DELETE /categories/:id` |                                        | `204`              |

A category looks like
`{ id, name, description, productCount, createdAt, updatedAt }`.

- `409` if the name is already used (case-sensitive).
- `409` when deleting a category that still has products.

## Products

| Method & path          | Body / query                         | Success           |
| ---------------------- | ------------------------------------ | ----------------- |
| `GET /products`        | list params + filters below          | `200` list        |
| `GET /products/:id`    |                                      | `200 { product }` |
| `POST /products`       | see below                            | `201 { product }` |
| `PATCH /products/:id`  | any create field except `initialStock` | `200 { product }` |
| `DELETE /products/:id` |                                      | `204`             |

**List filters:** `categoryId`, `isActive` (`true`/`false`), `lowStock` (`true` = stock at or
below the reorder level), `minPrice`, `maxPrice`. `sort`: `name` (default), `sku`, `price`,
`stockQuantity`, `createdAt`. `search` matches name or SKU.

**Create body:**

```json
{
  "sku": "LAP-1",
  "name": "Laptop Pro",
  "description": "Optional",
  "categoryId": 1,
  "price": "1299.00",
  "reorderLevel": 10,
  "isActive": true,
  "initialStock": 50
}
```

- `sku`: 2–40 letters, digits, `-` or `_`; stored uppercase and unique (`409` on duplicates).
- `reorderLevel` defaults to `10`, `isActive` to `true`, `initialStock` to `0`.
- `initialStock` is recorded as a `restock` entry in the inventory ledger in the same transaction
  as the product, so stock history is always complete.
- An unknown `categoryId` returns `400` with `details[0].path = "categoryId"`.

**Stock cannot be set through this endpoint.** `stockQuantity` is rejected on create and update;
it changes only through inventory movements and orders.

A product looks like:

```json
{
  "id": 1, "sku": "LAP-1", "name": "Laptop Pro", "description": null,
  "categoryId": 1, "categoryName": "Electronics", "price": "1299.00",
  "stockQuantity": 50, "reorderLevel": 10, "isLowStock": false, "isActive": true,
  "createdAt": "...", "updatedAt": "..."
}
```

**Deleting:** a product that already has order or inventory history cannot be deleted (`409`);
set `isActive` to `false` to retire it instead.

## Customers

Standard resource routes (`GET`/`POST /customers`, `GET`/`PATCH`/`DELETE /customers/:id`).

**Body:** `{ email, firstName, lastName, phone?, city?, country? }`. Emails are stored lowercase
and unique (`409`). Phone allows digits, spaces, `+ ( ) -`. Send `""` to clear optional fields.

**List:** `search` matches full name or email; `country` filter (case-insensitive);
`sort`: `name` (last, first; default), `email`, `createdAt`, `orderCount`, `totalSpent`.

A customer includes purchase statistics, **excluding cancelled orders**:

```json
{ "id": 1, "email": "...", "firstName": "Alice", "lastName": "Martin", "phone": null,
  "city": "Lyon", "country": "France", "orderCount": 2, "totalSpent": "75.00",
  "lastOrderAt": "...", "createdAt": "...", "updatedAt": "..." }
```

Customers with orders cannot be deleted (`409`).

## Idempotency keys

Operations that must never run twice require an `Idempotency-Key` header: `POST /orders` and
`POST /inventory/adjustments`. Generate a fresh random value (a UUID works) for each new operation
and **reuse the same value when retrying** it (e.g. after a timeout).

- First request → `201` with the result.
- Same key and same request again → `200` with the **original** result and the header
  `Idempotent-Replayed: true`. Nothing is applied a second time, even if the retries arrive
  concurrently.
- Same key with a different request → `409 IDEMPOTENCY_KEY_REUSED`.
- Missing or malformed key (must be 8–100 letters, digits, `-`, `_`) → `400`.

## Orders

| Method & path               | Access | Notes                                    |
| --------------------------- | ------ | ---------------------------------------- |
| `GET /orders`               | any    | list (see filters)                       |
| `GET /orders/:id`           | any    | includes `items`                         |
| `POST /orders`              | admin  | requires `Idempotency-Key`               |
| `PATCH /orders/:id/status`  | admin  | `{ "status": "paid" }`                   |

Orders are never deleted; cancel them instead.

### `POST /orders`

```json
{ "customerId": 7, "items": [ { "productId": 3, "quantity": 2 }, { "productId": 5, "quantity": 3 } ] }
```

The client sends only products and quantities. **Prices and totals are calculated by the server**
from current product prices; sending `unitPrice` or `totalAmount` is rejected as unknown fields.
Each product may appear once per order.

In one transaction the server locks the products, checks them, records the order and its lines,
deducts stock through the inventory ledger, and writes an `order.created` event. If anything
fails, nothing is saved.

| Status | `code`                   | When                                                     |
| ------ | ------------------------ | -------------------------------------------------------- |
| `201`  |                          | Order created; body `{ order }`                          |
| `200`  |                          | Idempotent replay of an earlier request                  |
| `400`  | `VALIDATION_ERROR`       | Bad body, unknown `customerId` or `productId`            |
| `409`  | `INSUFFICIENT_STOCK`     | `details`: `[{ productId, sku, requested, available }]`  |
| `409`  | `PRODUCT_UNAVAILABLE`    | A product is inactive                                    |
| `409`  | `IDEMPOTENCY_KEY_REUSED` | Key already used for a different order                   |

Concurrent orders for the same products are serialized with row locks (always taken in product-id
order, so they cannot deadlock). Stock can never be oversold.

An order looks like:

```json
{
  "id": 42, "customerId": 7, "customerName": "Jane Doe", "customerEmail": "jane@example.com",
  "status": "pending", "totalAmount": "2059.95", "itemCount": 2, "createdBy": 1,
  "createdAt": "...", "updatedAt": "...",
  "items": [
    { "productId": 3, "sku": "LAP-1", "productName": "Laptop Pro", "categoryId": 1,
      "quantity": 2, "unitPrice": "999.99", "lineTotal": "1999.98" }
  ]
}
```

`items` is included on `GET /orders/:id` and on create/status responses, not in lists.

### `PATCH /orders/:id/status`

Allowed transitions; anything else is `409 INVALID_STATUS_TRANSITION`:

```
pending ──► paid ──► shipped ──► delivered
   │          │
   └──────────┴──► cancelled
```

Cancelling returns every line's quantity to stock through the ledger (`cancellation`
movements). A cancelled order cannot be cancelled again, so stock is never restored twice.
Each change emits an `order.status_changed` event.

### `GET /orders`

Filters: `status`, `customerId`, `dateFrom`, `dateTo` (`YYYY-MM-DD`, UTC, both inclusive),
`minTotal`, `maxTotal`. `search` matches customer name or email, or the exact order number.
`sort`: `createdAt` (default, **newest first**), `totalAmount`, `status`.

## Inventory

### `GET /inventory/movements`

The inventory ledger: every stock change with its reason. Any role.

Filters: `productId`, `orderId`, `reason` (`order`, `restock`, `adjustment`, `cancellation`),
`dateFrom`, `dateTo`. `sort`: `createdAt` (default, newest first), `quantityChange`.

```json
{ "id": 118, "productId": 3, "sku": "LAP-1", "productName": "Laptop Pro", "quantityChange": -2,
  "reason": "order", "orderId": 42, "note": null, "createdBy": 1, "createdAt": "..." }
```

### `POST /inventory/adjustments` (admin, requires `Idempotency-Key`)

```json
{ "productId": 3, "quantityChange": 15, "reason": "restock", "note": "Supplier delivery" }
```

- `reason`: `restock` (must be positive) or `adjustment` (positive or negative, e.g. damaged
  goods or a stock count correction). `order` and `cancellation` are reserved for the order flow.
- `201 { movement }`; `409 INSUFFICIENT_STOCK` if the result would be negative; `400` for an
  unknown product.

See [events.md](events.md) for the events these operations emit.

## Pipeline health

### `GET /pipeline/health` (any signed-in user)

Status of event publishing, read from the outbox table and component heartbeats.

```json
{
  "status": "healthy",
  "outbox": {
    "pending": 0, "failing": 0, "oldestPendingAgeSeconds": null,
    "lastPublishedAt": "...", "publishedLastHour": 128, "lastError": null
  },
  "components": [
    { "component": "outbox-relay", "status": "up", "lastSeenAt": "...",
      "details": { "status": "ok", "publishedTotal": 128, "consecutiveFailures": 0,
                   "lastError": null, "lastPublishedAt": "..." } }
  ],
  "checkedAt": "..."
}
```

- `pending`: events not yet in Kafka. `oldestPendingAgeSeconds` is the publishing lag.
- `failing`: pending events with at least one failed attempt; `lastError` is the latest error.
- Components: `outbox-relay` and, once the Spark job has started, `spark-streaming` (its
  `details` include `kafkaLag` and processing totals; see [analytics.md](analytics.md)).
- Component `status`: `up`, `degraded` (reporting errors), `down` (no heartbeat for 30 s, or
  stopped), `unknown` (never reported).
- Overall `status`:
  - `healthy`: relay up, no failures, nothing waiting longer than 60 s
  - `degraded`: any of those conditions is not met
  - `unhealthy`: relay down while events are waiting

## Security notes

- Passwords are hashed with bcrypt (cost `BCRYPT_ROUNDS`, default 12).
- JWTs are HS256-signed with `JWT_SECRET` (min 32 chars) and expire after `JWT_TTL_SECONDS`.
  Only HS256 is accepted when verifying, so unsigned (`alg: none`) tokens are rejected.
- `SameSite=Strict` cookies and a CORS allow-list (`CORS_ORIGIN`) protect against cross-site
  request forgery.
- Security headers are set with helmet.
