# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Redesigned interface: Inter typography, refined surfaces and elevation, skeleton loading
  states, richer empty and error states, page headers with icons, numbered pagination, and a
  split-screen sign-in page with a password visibility toggle.
- App shell with a grouped, collapsible sidebar, breadcrumbs, and an account menu (theme choice,
  shortcuts, sign out).

### Added

- Command palette (`Ctrl`/`⌘` + `K`) to jump to pages, run quick actions, and search orders,
  products, and customers.
- Keyboard shortcuts (`g` then a page key, `?` for the list).
- Live pipeline status in the sidebar.
- Dashboard live mode (auto-refresh every 15 seconds) and trend lines in the KPI tiles.
- Order status history: every change records who made it and an optional note; existing orders
  get their history rebuilt from the outbox events. Order page with a progress tracker and an
  activity feed.
- Internal order notes (`GET`/`POST /api/orders/:id/notes`).
- Bulk status changes (`POST /api/orders/bulk-status`) with row selection on the Orders list;
  each order changes on its own and failures are reported per order.
- Printable invoices (`/orders/:id/invoice`).
- Customer pages: segment, lifetime value, monthly spend, most-bought products, and orders
  (`GET /api/customers/:id/insights`).
- Product pages: daily sales, end-of-day stock rebuilt from the ledger, days of stock left, and
  a one-click restock of the suggested quantity (`GET /api/products/:id/insights`).

## [1.0.0] - 2026-10-14

First complete release: an e-commerce operations app with a real-time analytics pipeline that
starts with `docker compose up -d --build --wait`.

### Operations app

- Staff sign-in with JWT in HttpOnly, SameSite=Strict cookies; admin and analyst roles enforced by
  the API; first admin created with a script (no public sign-up); login rate limiting.
- Products and categories, customers, orders, inventory ledger, and staff accounts, with search,
  filters, sorting, and pagination.
- Order placement with server-side pricing in integer cents, row locking against overselling,
  idempotent retries (`Idempotency-Key`), and a status lifecycle where cancelling restocks
  automatically.
- Every stock change recorded in an append-only ledger; manual restocks and adjustments, also
  idempotent.

### Event streaming and analytics

- Transactional outbox: business events (`order.created`, `order.status_changed`,
  `inventory.stock_changed`) written in the same transaction as the change; a relay publishes
  them to Kafka in order, at least once, and survives Kafka outages.
- Spark Structured Streaming job: validation with a quarantine for malformed events,
  deduplication by event id, Parquet history, and exactly-once aggregates in PostgreSQL; a batch
  job rebuilds every aggregate from the history.
- Anomaly detection: unusually large orders, order bursts, daily revenue spikes, and large stock
  write-offs, tuned on generated data to avoid false alarms.
- Pipeline health: outbox backlog, relay and Spark heartbeats, Kafka consumer lag.

### Dashboard

- KPIs with comparison to the previous period; revenue over time; best sellers and categories;
  order status; new vs returning customers; inventory watchlist; anomalies; pipeline health.
- Light and dark themes, responsive layout, a table view for every chart, and keyboard-accessible
  dialogs.

### Platform

- Docker Compose stack: PostgreSQL 17, Kafka 4.2 (KRaft), migrations, API, relay, Spark 4.1, and
  nginx serving the app with a strict Content-Security-Policy.
- Synthetic sample data generator (90 days of realistic, reproducible history).
- CI on every pull request: backend tests against PostgreSQL and Kafka, Spark tests, frontend
  tests and build, and a full-stack smoke test on a fresh Docker Compose stack.
- Container images apply OS security updates at build time; dependency audits (npm, pip-audit)
  report no known vulnerabilities in the project's own dependencies.
- Documentation: architecture, API, events, database, analytics, frontend, development setup,
  and troubleshooting.

[1.0.0]: https://github.com/bijigunerachid/ecommerce-analytics-platform/releases/tag/v1.0.0
