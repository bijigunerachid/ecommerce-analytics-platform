-- Up Migration

-- Results of the Spark insights job (analytics/src/ecommerce_analytics/insights.py). Each run
-- replaces the previous results in one transaction, so readers always see one complete run.

-- RFM: how recently, how often, and how much each customer bought (cancelled orders excluded).
CREATE TABLE analytics_customer_segments (
  customer_id    bigint        PRIMARY KEY,
  recency_days   integer       NOT NULL,
  frequency      integer       NOT NULL,
  monetary       numeric(14,2) NOT NULL,
  r_score        smallint      NOT NULL,
  f_score        smallint      NOT NULL,
  m_score        smallint      NOT NULL,
  segment        text          NOT NULL,
  last_order_at  timestamptz   NOT NULL,
  CONSTRAINT analytics_customer_segments_scores CHECK (
    r_score BETWEEN 1 AND 5 AND f_score BETWEEN 1 AND 5 AND m_score BETWEEN 1 AND 5),
  CONSTRAINT analytics_customer_segments_segment_valid CHECK (segment IN (
    'champions', 'loyal', 'promising', 'needs_attention', 'at_risk', 'hibernating'))
);
CREATE INDEX analytics_customer_segments_segment_idx
  ON analytics_customer_segments (segment, monetary DESC);

-- Weekly cohorts: customers by the week (Monday, UTC) of their first order, and how many of
-- them ordered again N weeks later.
CREATE TABLE analytics_cohort_retention (
  cohort_week       date    NOT NULL,
  week_offset       integer NOT NULL,
  cohort_size       integer NOT NULL,
  active_customers  integer NOT NULL,
  PRIMARY KEY (cohort_week, week_offset),
  CONSTRAINT analytics_cohort_retention_counts CHECK (
    week_offset >= 0 AND active_customers BETWEEN 0 AND cohort_size)
);

-- Daily net revenue forecast with an 80% interval.
CREATE TABLE analytics_sales_forecast (
  day       date          PRIMARY KEY,
  forecast  numeric(14,2) NOT NULL,
  lower     numeric(14,2) NOT NULL,
  upper     numeric(14,2) NOT NULL,
  CONSTRAINT analytics_sales_forecast_interval CHECK (lower <= forecast AND forecast <= upper)
);

-- One row per run: when it ran, what it covered, and how accurate the forecast was in a
-- backtest. The latest successful run describes the tables above.
CREATE TABLE analytics_insights_runs (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at       timestamptz NOT NULL,
  finished_at      timestamptz NOT NULL DEFAULT now(),
  status           text        NOT NULL,
  as_of            date,
  customers        integer,
  cohorts          integer,
  forecast_days    integer,
  training_days    integer,
  backtest_wape    numeric(7,4),
  details          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error            text,
  CONSTRAINT analytics_insights_runs_status_valid CHECK (status IN ('ok', 'error'))
);
CREATE INDEX analytics_insights_runs_finished_idx ON analytics_insights_runs (finished_at DESC);

-- Down Migration

DROP TABLE IF EXISTS analytics_insights_runs;
DROP TABLE IF EXISTS analytics_sales_forecast;
DROP TABLE IF EXISTS analytics_cohort_retention;
DROP TABLE IF EXISTS analytics_customer_segments;
