# Real-Time E-Commerce Analytics Platform

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
- Node.js ≥ 20.19 (22 LTS recommended)
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

## Getting started

Setup and run instructions will be added as the services are implemented.
