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

## Architecture (planned)

```
 React (Vite)  ──HTTP/cookie──▶  Express API  ──SQL tx──▶  PostgreSQL (OLTP)
                                     │                         ▲
                                     │ events                  │ aggregates
                                     ▼                         │
                                   Kafka  ──▶  Spark Structured Streaming
                                                     │
                                                     ▼
                                              Parquet (history)
```

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

### 1. Start PostgreSQL

```powershell
docker compose up -d postgres
docker compose ps          # wait until STATUS shows "(healthy)"
```

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

### 4. Run the API

```powershell
npm run dev                # restarts automatically when files change
```

Check it at <http://localhost:4000/api/health>. The endpoints are documented in
[docs/api.md](docs/api.md).

### Backend commands (run from `backend/`)

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Start the API with auto-reload                      |
| `npm start`            | Start the API                                       |
| `npm run create-admin` | Create an admin (or analyst) account                |
| `npm run migrate:up`   | Apply all pending migrations                        |
| `npm run migrate:down` | Revert the most recent migration                    |
| `npm run migrate:test` | Apply migrations to the test database               |
| `npm test`             | Run the automated tests (needs PostgreSQL running)  |
| `npm run lint`         | ESLint                                              |
| `npm run format:check` | Prettier check (`npm run format` to fix)            |

Run a single test file or test by name:

```powershell
npx vitest run tests/integration/schema.test.js
npx vitest run -t "rejects negative stock"
```

See [docs/database.md](docs/database.md) for the schema design.

### Resetting the database

```powershell
docker compose down -v     # stops containers AND deletes the database volume
docker compose up -d postgres
```

## Contributing and CI

Every change goes through a feature branch and a pull request. GitHub Actions runs formatting,
lint, migration, and test checks against a fresh PostgreSQL database on each pull request. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the branch naming, commit conventions, and how to protect
`main`.
