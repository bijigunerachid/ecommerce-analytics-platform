# Development setup

For working on the code with hot reload, run PostgreSQL and Kafka in Docker and the backend and
frontend directly on your machine. (To simply run the platform, use the Docker quick start in the
[README](../README.md).)

## Prerequisites (Windows 11)

- Git ≥ 2.40
- Docker Desktop (Compose v2)
- Node.js ≥ 22.13 (22 LTS)
- Python is **not** needed on the host: Spark and its tests run in containers.

Check your machine from the repo root in PowerShell:

```powershell
.\scripts\check-env.ps1
```

If PowerShell blocks the script, allow local scripts for your user once:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## 1. Infrastructure

```powershell
docker compose up -d postgres kafka
docker compose ps          # wait until both show "(healthy)"; Kafka takes ~20 seconds
```

On first start the PostgreSQL container also creates an `ecommerce_test` database for the
automated tests, so tests never touch your development data.

## 2. Backend

```powershell
cd backend
npm install
npm run migrate:up         # apply database migrations
npm run create-admin       # first account (asks for email, name, password)
npm run dev                # API on http://localhost:4000, restarts on file changes
```

In a second terminal (also `backend/`), publish events to Kafka:

```powershell
npm run relay
```

Notes:

- `create-admin` flags: Windows PowerShell drops the `--` in `npm run create-admin -- --email …`,
  so call Node directly: `node --env-file=../.env scripts/create-admin.js --email admin@example.com --name "Store Admin"`
  (add `--role analyst` for an analyst).
- Sample data (empty database only): `npm run generate-data`, or
  `node --env-file=../.env scripts/generate-sample-data.js --days 30 --orders-per-day 100 --seed 7`.
- A relay running in Docker and one on your machine can run together: only one publishes at a
  time; the other waits as a standby.

## 3. Frontend

```powershell
cd frontend
npm install
npm run dev                # http://localhost:5173, proxies /api to http://localhost:4000
```

## 4. Spark (optional while developing)

```powershell
docker compose up -d spark-streaming      # builds the image on first run (~1 GB)
docker compose logs -f spark-streaming    # one log line per micro-batch
```

## Tests and checks

| Where | Command | Needs |
| --- | --- | --- |
| `backend/` | `npm test` | PostgreSQL and Kafka running; `npm run migrate:test` once |
| `backend/` | `npx vitest run tests/integration/orders.test.js` | one file |
| `backend/` | `npx vitest run -t "never oversells"` | tests matching a name |
| `backend/` | `npm run lint`, `npm run format:check` | |
| `frontend/` | `npm test`, `npm run lint`, `npm run format:check`, `npm run build` | nothing (API is mocked) |
| repo root | `docker compose run --rm analytics-tests` | PostgreSQL; `npm run migrate:test` in `backend/` |
| repo root | `node scripts/smoke-test.mjs` | the full Docker stack running; `SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD` set |

## Backend commands (`backend/`)

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm start` | API with / without auto-reload |
| `npm run relay` | Outbox relay (keeps running) |
| `npm run create-admin` | Create an admin (or analyst) account |
| `npm run generate-data` | 90 days of synthetic history (empty database only) |
| `npm run migrate:up` / `migrate:down` / `migrate:test` | Migrations: apply / revert last / apply to the test DB |

## Resetting

```powershell
docker compose down -v     # removes containers AND all data volumes (database, Kafka, Parquet)
docker compose up -d postgres kafka
cd backend; npm run migrate:up; npm run create-admin
```

## Conventions

Branching, commit messages, and CI are described in [CONTRIBUTING.md](../CONTRIBUTING.md).
