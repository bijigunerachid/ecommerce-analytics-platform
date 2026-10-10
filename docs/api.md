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
| `analyst` | Read operational data and analytics (added in later steps) |

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

## Security notes

- Passwords are hashed with bcrypt (cost `BCRYPT_ROUNDS`, default 12).
- JWTs are HS256-signed with `JWT_SECRET` (min 32 chars) and expire after `JWT_TTL_SECONDS`.
  Only HS256 is accepted when verifying, so unsigned (`alg: none`) tokens are rejected.
- `SameSite=Strict` cookies and a CORS allow-list (`CORS_ORIGIN`) protect against cross-site
  request forgery.
- Security headers are set with helmet.
