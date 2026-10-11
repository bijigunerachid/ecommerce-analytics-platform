"""Batch job: rebuilds every PostgreSQL aggregate from the Parquet event history.

Use it to recover from a lost or corrupted analytics database, after changing an aggregation,
or to backfill. The Parquet history is the source of truth: it holds every valid event the
streaming job has seen. Events that appear in several batches (Kafka redeliveries, replays) are
deduplicated by event_id before anything is counted.

Stop the streaming job before running this, so the two do not update the tables at once:
    docker compose stop spark-streaming
    docker compose run --rm spark-rebuild
    docker compose start spark-streaming
"""

from __future__ import annotations

import logging
import os

import psycopg
from pyspark.sql import functions as F

from ..config import load_settings
from ..postgres_sink import apply_events
from ..spark import create_spark

log = logging.getLogger("rebuild_aggregates")

AGGREGATE_TABLES = [
    "analytics_processed_events",
    "analytics_sales_hourly",
    "analytics_product_daily",
    "analytics_inventory_daily",
    "analytics_order_status",
    "analytics_customers",
]


def rebuild(spark, settings) -> dict:
    if not os.path.isdir(settings.events_path):
        raise RuntimeError(f"No event history at {settings.events_path}; nothing to rebuild")

    history = spark.read.parquet(settings.events_path)
    total = history.count()
    events = history.dropDuplicates(["event_id"]).drop("batch_id").cache()
    unique = events.count()
    log.info("History: %s records, %s unique events", total, unique)

    with psycopg.connect(**settings.pg_conninfo()) as conn, conn.transaction():
        # Anomalies are kept: detection is idempotent and they may have been reviewed.
        conn.execute(f"TRUNCATE {', '.join(AGGREGATE_TABLES)}")
        applied, anomalies = apply_events(conn, spark, events)

    by_type = {r.event_type: r["count"] for r in events.groupBy("event_type").count().collect()}
    events.unpersist()
    return {
        "records": total,
        "unique_events": unique,
        "applied": applied,
        "new_anomalies": anomalies,
        "by_type": by_type,
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = load_settings()
    spark = create_spark("ecommerce-rebuild-aggregates")
    spark.sparkContext.setLogLevel("WARN")
    try:
        summary = rebuild(spark, settings)
        log.info("Rebuild complete: %s", summary)
        first, last = (
            spark.read.parquet(settings.events_path)
            .agg(F.min("occurred_at"), F.max("occurred_at"))
            .first()
        )
        log.info("Events span %s to %s", first, last)
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
