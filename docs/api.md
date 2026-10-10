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

## Security notes

- Passwords are hashed with bcrypt (cost `BCRYPT_ROUNDS`, default 12).
- JWTs are HS256-signed with `JWT_SECRET` (min 32 chars) and expire after `JWT_TTL_SECONDS`.
  Only HS256 is accepted when verifying, so unsigned (`alg: none`) tokens are rejected.
- `SameSite=Strict` cookies and a CORS allow-list (`CORS_ORIGIN`) protect against cross-site
  request forgery.
- Security headers are set with helmet.
