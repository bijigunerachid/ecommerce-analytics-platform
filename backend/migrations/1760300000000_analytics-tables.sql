-- Up Migration

-- Tables written by the Spark streaming job (analytics/) and read by the dashboard API.
-- They hold derived data only: everything here can be rebuilt from the Parquet event history
-- with the batch rebuild job.

-- Every event the streaming job has applied. Inserting into this table in the same transaction
-- as the aggregate updates is what makes aggregation exactly-once: a redelivered event conflicts
-- here and is skipped. customer_id/amount support the order-velocity anomaly check.
CREATE TABLE analytics_processed_events (
  event_id      uuid          PRIMARY KEY,
  event_type    text          NOT NULL,
  occurred_at   timestamptz   NOT NULL,
  customer_id   bigint,
  amount        numeric(12,2),
  processed_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX analytics_processed_events_customer_idx
  ON analytics_processed_events (customer_id, occurred_at)
  WHERE customer_id IS NOT NULL;

-- Micro-batches already committed, so a replayed batch (after a crash) is skipped as a whole.
CREATE TABLE analytics_stream_batches (
  job               text        NOT NULL,
  batch_id          bigint      NOT NULL,
  processed_at      timestamptz NOT NULL DEFAULT now(),
  events_total      integer     NOT NULL,
  events_valid      integer     NOT NULL,
  events_invalid    integer     NOT NULL,
  events_duplicate  integer     NOT NULL,
  events_applied    integer     NOT NULL,
  PRIMARY KEY (job, batch_id)
);

-- Sales per hour (UTC), by order time. Cancellations are subtracted in the hour the order was
-- placed, so net revenue per hour is gross_revenue - cancelled_revenue.
-- order_total_sq_sum (sum of squared order totals) lets anomaly detection compute a standard
-- deviation of order values from these rows alone.
CREATE TABLE analytics_sales_hourly (
  bucket_start        timestamptz   PRIMARY KEY,
  orders_count        integer       NOT NULL DEFAULT 0,
  gross_revenue       numeric(14,2) NOT NULL DEFAULT 0,
  order_total_sq_sum  numeric(24,4) NOT NULL DEFAULT 0,
  items_sold          integer       NOT NULL DEFAULT 0,
  cancelled_orders    integer       NOT NULL DEFAULT 0,
  cancelled_revenue   numeric(14,2) NOT NULL DEFAULT 0,
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- Units and revenue per product per day (gross: at order time).
CREATE TABLE analytics_product_daily (
  day           date          NOT NULL,
  product_id    bigint        NOT NULL,
  sku           text          NOT NULL,
  category_id   bigint        NOT NULL,
  units_sold    integer       NOT NULL DEFAULT 0,
  revenue       numeric(14,2) NOT NULL DEFAULT 0,
  orders_count  integer       NOT NULL DEFAULT 0,
  PRIMARY KEY (day, product_id)
);
CREATE INDEX analytics_product_daily_product_idx ON analytics_product_daily (product_id);

-- Stock movement per product per day, and the stock level after the day's last movement.
CREATE TABLE analytics_inventory_daily (
  day            date        NOT NULL,
  product_id     bigint      NOT NULL,
  units_in       integer     NOT NULL DEFAULT 0,
  units_out      integer     NOT NULL DEFAULT 0,
  movements      integer     NOT NULL DEFAULT 0,
  last_stock     integer,
  last_stock_at  timestamptz,
  PRIMARY KEY (day, product_id)
);

-- Current number of orders in each status.
CREATE TABLE analytics_order_status (
  status        text    PRIMARY KEY,
  orders_count  integer NOT NULL DEFAULT 0
);

-- Purchase history per customer (net of cancellations).
CREATE TABLE analytics_customers (
  customer_id     bigint        PRIMARY KEY,
  first_order_at  timestamptz   NOT NULL,
  last_order_at   timestamptz   NOT NULL,
  orders_count    integer       NOT NULL DEFAULT 0,
  revenue         numeric(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX analytics_customers_first_order_idx ON analytics_customers (first_order_at);

-- Suspicious patterns flagged by the streaming job. The unique key makes detection idempotent.
CREATE TABLE analytics_anomalies (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anomaly_type  text        NOT NULL,
  severity      text        NOT NULL,
  entity_type   text        NOT NULL,
  entity_id     text        NOT NULL,
  occurred_at   timestamptz NOT NULL,
  detected_at   timestamptz NOT NULL DEFAULT now(),
  description   text        NOT NULL,
  details       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT analytics_anomalies_severity_valid CHECK (severity IN ('low', 'medium', 'high')),
  CONSTRAINT analytics_anomalies_unique UNIQUE (anomaly_type, entity_type, entity_id, occurred_at)
);
CREATE INDEX analytics_anomalies_detected_idx ON analytics_anomalies (detected_at DESC);

-- Down Migration

DROP TABLE IF EXISTS analytics_anomalies;
DROP TABLE IF EXISTS analytics_customers;
DROP TABLE IF EXISTS analytics_order_status;
DROP TABLE IF EXISTS analytics_inventory_daily;
DROP TABLE IF EXISTS analytics_product_daily;
DROP TABLE IF EXISTS analytics_sales_hourly;
DROP TABLE IF EXISTS analytics_stream_batches;
DROP TABLE IF EXISTS analytics_processed_events;
