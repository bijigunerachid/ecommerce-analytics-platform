"""Batch job: customer segments, cohort retention, and the sales forecast.

Reads the Parquet event history (deduplicated by event_id), computes the insights with Spark
(see insights.py and forecast.py), and replaces the previous results in PostgreSQL in one
transaction. Every run, successful or not, is recorded in analytics_insights_runs.

Runs inside the streaming job every INSIGHTS_INTERVAL_MINUTES (reusing its Spark session), and
on demand:
    docker compose run --rm spark-insights
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.types.json import Jsonb

from .. import forecast as fc
from ..config import load_settings
from ..insights import SEGMENTS, cohorts, daily_net_revenue, order_facts, rfm
from ..spark import create_spark

log = logging.getLogger("compute_insights")


def _record_run(conn, started_at, status, **fields) -> None:
    conn.execute(
        """INSERT INTO analytics_insights_runs
             (started_at, status, as_of, customers, cohorts, forecast_days, training_days,
              backtest_wape, details, error)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            started_at,
            status,
            fields.get("as_of"),
            fields.get("customers"),
            fields.get("cohorts"),
            fields.get("forecast_days"),
            fields.get("training_days"),
            fields.get("backtest_wape"),
            Jsonb(fields.get("details", {})),
            fields.get("error"),
        ),
    )


def compute(spark, settings, now: datetime | None = None) -> dict:
    """Computes and stores the insights; returns a summary. Raises on failure (after recording)."""
    now = now or datetime.now(timezone.utc)
    started_at = now
    as_of = now.date()
    t0 = time.monotonic()
    try:
        if not os.path.isdir(settings.events_path):
            raise RuntimeError(f"No event history at {settings.events_path} yet")
        events = spark.read.parquet(settings.events_path).dropDuplicates(["event_id"])
        facts = order_facts(events).cache()

        segments = rfm(facts, as_of).collect()
        cohort_rows = cohorts(facts).collect()
        daily = {r.day: float(r.revenue) for r in daily_net_revenue(facts).collect()}
        facts.unpersist()

        # Train on complete days only: today is still in progress.
        yesterday = as_of - timedelta(days=1)
        history = fc.fill_days(daily, min(daily), yesterday) if daily else []
        prediction = fc.forecast(history, as_of)

        with psycopg.connect(**settings.pg_conninfo()) as conn, conn.transaction():
            conn.execute("DELETE FROM analytics_customer_segments")
            conn.execute("DELETE FROM analytics_cohort_retention")
            conn.execute("DELETE FROM analytics_sales_forecast")
            with conn.cursor() as cur:
                cur.executemany(
                    """INSERT INTO analytics_customer_segments
                         (customer_id, recency_days, frequency, monetary, r_score, f_score,
                          m_score, segment, last_order_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    [
                        (
                            r.customer_id,
                            r.recency_days,
                            r.frequency,
                            r.monetary,
                            r.r_score,
                            r.f_score,
                            r.m_score,
                            r.segment,
                            r.last_order_at,
                        )
                        for r in segments
                    ],
                )
                cur.executemany(
                    """INSERT INTO analytics_cohort_retention
                         (cohort_week, week_offset, cohort_size, active_customers)
                       VALUES (%s, %s, %s, %s)""",
                    [
                        (r.cohort_week, r.week_offset, r.cohort_size, r.active_customers)
                        for r in cohort_rows
                    ],
                )
                if prediction:
                    cur.executemany(
                        """INSERT INTO analytics_sales_forecast (day, forecast, lower, upper)
                           VALUES (%s, %s, %s, %s)""",
                        prediction.days,
                    )
            by_segment = {s: 0 for s in SEGMENTS}
            for r in segments:
                by_segment[r.segment] += 1
            summary = {
                "as_of": as_of,
                "customers": len(segments),
                "cohorts": len({r.cohort_week for r in cohort_rows}),
                "forecast_days": len(prediction.days) if prediction else 0,
                "training_days": prediction.training_days if prediction else len(history),
                "backtest_wape": prediction.backtest_wape if prediction else None,
                "details": {
                    "segments": by_segment,
                    "seconds": round(time.monotonic() - t0, 1),
                    **(
                        {}
                        if prediction
                        else {
                            "forecastSkipped": f"needs {fc.MIN_TRAINING_DAYS} days of history, "
                            f"has {len(history)}"
                        }
                    ),
                },
            }
            _record_run(conn, started_at, "ok", **summary)
        return summary
    except Exception as err:
        try:
            with psycopg.connect(**settings.pg_conninfo()) as conn:
                _record_run(conn, started_at, "error", as_of=as_of, error=str(err)[:2000])
        except Exception:  # noqa: BLE001 - the original error matters more
            log.exception("Could not record the failed insights run")
        raise


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = load_settings()
    spark = create_spark("ecommerce-compute-insights")
    spark.sparkContext.setLogLevel("WARN")
    try:
        log.info("Insights computed: %s", compute(spark, settings))
    finally:
        spark.stop()
