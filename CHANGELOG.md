# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-10-15

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
- Browser end-to-end tests (Playwright) with axe-core accessibility checks in both themes,
  run in CI on a fresh stack.
- OpenAPI 3.1 document generated from the request schemas, with Swagger UI at `/api/docs/`
  and a test that keeps it in sync with the routes.
- Prometheus metrics (`/api/metrics`) and an optional Prometheus + Grafana setup with a
  provisioned dashboard (`docker compose --profile observability up -d`).
- Spark insights job: customer segments (RFM), weekly cohort retention, and a 14-day sales
  forecast with an 80% interval and a measured backtest accuracy; runs every 30 minutes inside
  the streaming job or on demand (`docker compose run --rm spark-insights`). New Insights page
  and `GET /api/analytics/{segments,cohorts,forecast}`.
- CSV exports (plain or Excel-friendly) of orders, products, customers, stock movements, the
  audit log, daily sales, and top products, using the filters on screen; protected against CSV
  injection, limited to 100,000 rows, and recorded in the audit log (`GET /api/exports/:name.csv`).
- Reports page: a printable sales report for any period.
- Account page: change your name and password, and sign out other sessions. Session versions
  make password changes, resets, and deactivation end existing sessions immediately.
- User administration: edit name, role, and active state, and reset passwords, with protection
  against removing the last active admin.
- Append-only audit log of sign-ins (including failed ones) and every change, with filters and
  before/after details (`GET /api/audit-log`).
- Live updates over Server-Sent Events (`GET /api/stream`), fed by PostgreSQL `LISTEN/NOTIFY`:
  a live activity feed on the dashboard and a notification bell for low stock, out of stock,
  and detected anomalies (created by database triggers; existing anomalies are backfilled).
- Product pages: daily sales, end-of-day stock rebuilt from the ledger, days of stock left, and
  a one-click restock of the suggested quantity (`GET /api/products/:id/insights`).

### Changed

- Redesigned interface (design system v2), inspired by modern SaaS dashboards:
  - Inter typography, neutral surfaces with an indigo accent, and refined elevation and
    spacing in both themes, with subtle motion that respects reduced-motion settings.
  - App shell with a grouped, collapsible sidebar (tooltips when collapsed), breadcrumbs, and
    an account menu (theme choice, shortcuts, sign out).
  - Create and edit forms (products, categories, customers, users, stock adjustments) open in a
    side drawer; confirmations show an icon and a loading state.
  - Row actions are icon buttons with tooltips; "Active" settings are switches; prices show the
    currency symbol in the field.
  - Orders filter by status with tabs, and list filters have a "Clear filters" button.
  - The dashboard is grouped into Sales, Products and customers, and Operations sections; the
    category panel shows the top seven categories plus "Other".
  - Skeleton loading states, richer empty and error states, numbered pagination, and toasts
    with an optional description and action that pause while hovered.
  - Split-screen sign-in page with a password visibility toggle.
- Brand: the Commerce Analytics logo in the sidebar, on the sign-in page, in the README, and as
  the favicon and home-screen icon.
- Accessibility: WCAG AA contrast for text, links, and primary buttons in both themes, keyboard
  access to scrolling tables, underlined inline links, and radio-group keyboard behavior (arrow
  keys) for tabs and segmented controls.
- Refreshed screenshots in `docs/screenshots/`.

### Fixed

- Live activity no longer drops an event that arrives while the list is loading, and the event
  stream opens only once the server listens for changes.
- Frontend tests render charts at a fixed size (no more Recharts size warnings).
- End-to-end tests reuse a single category instead of creating one per run.

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

[Unreleased]: https://github.com/bijigunerachid/ecommerce-analytics-platform/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/bijigunerachid/ecommerce-analytics-platform/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/bijigunerachid/ecommerce-analytics-platform/releases/tag/v1.0.0
