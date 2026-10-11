# Real-Time E-Commerce Analytics Platform

[![CI](https://github.com/bijigunerachid/ecommerce-analytics-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/bijigunerachid/ecommerce-analytics-platform/actions/workflows/ci.yml)

A full-stack e-commerce operations app with a streaming analytics pipeline.

- **Transactional side:** a React + Express app over PostgreSQL for managing products, customers,
  orders, and inventory. Orders and stock changes are validated server-side and run in database
  transactions.
- **Analytical side:** the backend publishes business events to Kafka. Spark Structured Streaming
  validates and deduplicates them, writes history to Parquet, computes revenue and product metrics,
  flags anomalies, and stores dashboard-ready aggregates back in PostgreSQL.

> **Status:** under active development. This README grows as each build step lands.

## Architecture

```
 React (Vite)  ──HTTP/cookie──▶  Express API  ──SQL tx──▶  PostgreSQL ◀─────────────┐
                                                  (orders + event_outbox    aggregates,
                                                   in one transaction)      anomalies,
                                                         │                  heartbeats
                                               outbox relay (npm run relay)      │
                                                         ▼                       │
                                                       Kafka ──▶ Spark Structured Streaming
                                                                       │
                                                                       ▼
                                                           Parquet history + quarantine
```

The frontend is not built yet.

## Repository layout

| Path                 | Contents                                         |
| -------------------- | ------------------------------------------------ |
| `frontend/`          | React + Vite + Tailwind CSS v4 (JavaScript only) |
| `backend/`           | Express REST API, PostgreSQL access, Kafka producer |
| `analytics/`         | Python / PySpark streaming and batch jobs        |
| `data/samples/`      | Small synthetic sample datasets                  |
| `docs/`              | Architecture, API, and setup documentation       |
| `scripts/`           | Developer helper scripts                         |
| `.github/workflows/` | CI pipelines                                     |

## Tech stack

**Frontend:** React, Vite, Tailwind CSS v4, React Router, Recharts, Lucide icons
**Backend:** Node.js, Express, PostgreSQL, JWT in HttpOnly cookies, RBAC (admin/analyst)
**Data:** Apache Kafka, Python, Apache Spark Structured Streaming, Parquet
**Infra:** Docker Compose, GitHub Actions

## Prerequisites (Windows 11)

- Git ≥ 2.40
- Docker Desktop (Compose v2) — Kafka, Spark, and PostgreSQL all run in containers
- Node.js ≥ 22.13 (22 LTS)
- Python 3.10+ is optional on the host

Check your machine from the repo root in PowerShell:

```powershell
.\scripts\check-env.ps1
```

If PowerShell blocks the script, allow local scripts for your user once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Configuration

```powershell
Copy-Item .env.example .env
# then edit .env and replace every placeholder value
```

`.env` is git-ignored. Never commit real secrets or real customer data.

> **Windows note:** save `.env` as UTF-8 **without** BOM. Windows PowerShell 5.1's
> `Set-Content -Encoding utf8` adds a BOM, which breaks Node's `.env` parser. `Copy-Item`,
> VS Code, and Notepad on Windows 11 are all fine.

## Getting started

### 1. Start PostgreSQL and Kafka

```powershell
docker compose up -d postgres kafka
docker compose ps          # wait until both show "(healthy)"; Kafka takes ~20 seconds
```

The Spark streaming job is started separately (step 6) because its image is large.

On the first start the container also creates a separate `ecommerce_test` database that the
automated tests use, so tests never touch your development data.

### 2. Install backend dependencies and apply migrations

```powershell
cd backend
npm install
npm run migrate:up         # apply all pending migrations to the dev database
```

### 3. Create the first administrator

There is no public sign-up. Create the first admin from the command line:

```powershell
npm run create-admin
```

It asks for the email, full name, and password. The password isn't shown as you type and must be
at least 12 characters. That admin can then create more accounts through `POST /api/users`.

To pass the values as flags instead, call Node directly. Windows PowerShell drops the `--` in
`npm run create-admin -- --email ...`, so the flags never reach the script through npm:

```powershell
node --env-file=../.env scripts/create-admin.js --email admin@example.com --name "Store Admin"
# add --role analyst to create an analyst
```

### Optional: load realistic sample data

To see the dashboard with months of history, generate a synthetic dataset **into an empty
database** (no products yet). It takes about 2 minutes:

```powershell
npm run generate-data      # 90 days, ~60 orders/day (growing), fixed seed: same data every time
```

The generator writes orders, inventory movements, and business events the same way the app does,
spread over the past 90 days. It uses busier weekends, a daily traffic curve, popular and niche
products, returning customers, cancellations, restocks, and a few planted anomalies. All
customers are fictional (`@example.com`); the catalog is in
[data/samples/catalog.json](data/samples/catalog.json). Once the relay (step 5) and Spark (step 6)
are running, the history flows into the dashboard analytics within about a minute.

Other sizes: `node --env-file=../.env scripts/generate-sample-data.js --days 30 --orders-per-day 100 --seed 7`.
To start over: `docker compose down -v` (deletes all data), then `docker compose up -d postgres kafka`
and `npm run migrate:up`.

### 4. Run the API

```powershell
npm run dev                # restarts automatically when files change
```

Check it at <http://localhost:4000/api/health>. The endpoints are documented in
[docs/api.md](docs/api.md).

### 5. Run the outbox relay (event publishing)

In a **second terminal**, also from `backend/`:

```powershell
npm run relay
```

The relay publishes business events (orders, stock changes) from PostgreSQL to the Kafka topics
`ecommerce.orders` and `ecommerce.inventory`, creating the topics on first start. It keeps
running until you press Ctrl+C. If Kafka is down it keeps retrying, and no events are lost. See
[docs/events.md](docs/events.md) for the event formats and delivery guarantees.

Pipeline status is available at `GET /api/pipeline/health` (signed-in users).

### 6. Run the Spark analytics pipeline

```powershell
docker compose up -d spark-streaming      # first run builds the image (~1 GB, a few minutes)
docker compose logs -f spark-streaming    # one line per processed micro-batch
```

Spark reads the Kafka topics, validates and deduplicates events, keeps a Parquet history, and
maintains dashboard aggregates and anomalies in PostgreSQL. The Spark UI is at
<http://localhost:4040>. See [docs/analytics.md](docs/analytics.md) for the design, guarantees,
and the batch rebuild job.

| Command (from the repo root)                | What it does                                |
| ------------------------------------------- | ------------------------------------------- |
| `docker compose up -d spark-streaming`      | Start the streaming job                     |
| `docker compose run --rm spark-rebuild`     | Rebuild aggregates from Parquet history     |
| `docker compose run --rm analytics-tests`   | Ruff + pytest for the analytics code        |

### Backend commands (run from `backend/`)

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Start the API with auto-reload                      |
| `npm start`            | Start the API                                       |
| `npm run create-admin` | Create an admin (or analyst) account                |
| `npm run relay`        | Publish outbox events to Kafka (keeps running)      |
| `npm run generate-data` | Load 90 days of synthetic history (empty DB only)  |
| `npm run migrate:up`   | Apply all pending migrations                        |
| `npm run migrate:down` | Revert the most recent migration                    |
| `npm run migrate:test` | Apply migrations to the test database               |
| `npm test`             | Run the automated tests (needs PostgreSQL and Kafka) |
| `npm run lint`         | ESLint                                              |
| `npm run format:check` | Prettier check (`npm run format` to fix)            |

Run a single test file or test by name:

```powershell
npx vitest run tests/integration/schema.test.js
npx vitest run -t "rejects negative stock"
```

See [docs/database.md](docs/database.md) for the schema design and [docs/api.md](docs/api.md)
for every endpoint, including the dashboard analytics (`/api/analytics/*`).

### Resetting the database

```powershell
docker compose down -v     # stops containers AND deletes the database volume
docker compose up -d postgres
```

## Contributing and CI

Every change goes through a feature branch and a pull request. GitHub Actions runs two jobs on each
pull request: backend (format, lint, migrations, tests with PostgreSQL and Kafka) and analytics
(ruff and pytest inside the Spark image). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the branch naming, commit conventions, and how to protect
`main`.
