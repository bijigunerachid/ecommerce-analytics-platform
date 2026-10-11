"""Applies a batch of validated events to the PostgreSQL analytics tables, exactly once.

Kafka delivery is at-least-once, and Spark may replay a micro-batch after a crash. Both are
handled inside one database transaction:

1. The (job, batch_id) row in analytics_stream_batches is claimed. A replayed batch finds it
   already present and is skipped entirely.
2. Each event id is inserted into analytics_processed_events with ON CONFLICT DO NOTHING. Only
   ids that were actually inserted (new events) are aggregated, so an event redelivered in a
   later batch is never counted twice.
3. Aggregate deltas computed by Spark are upserted, anomalies are detected, and the batch row
   is completed. If anything fails, the whole transaction rolls back and nothing is applied.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

from . import aggregations as agg
from .anomalies import detect_anomalies
from .schemas import ORDER_CREATED


@dataclass
class BatchResult:
    status: str  # "applied" or "skipped"
    events_total: int = 0
    events_valid: int = 0
    events_invalid: int = 0
    events_duplicate: int = 0
    events_applied: int = 0
    anomalies: int = 0


def _rows(df: DataFrame) -> list[tuple]:
    return [tuple(r) for r in df.collect()]


def _claim_events(cur: psycopg.Cursor, events: DataFrame) -> list[str]:
    """Records the events as processed; returns ids that were not processed before."""
    p = F.col("payload")
    is_order = F.col("event_type") == ORDER_CREATED
    rows = _rows(
        events.select(
            "event_id",
            "event_type",
            "occurred_at",
            F.when(is_order, p["customerId"]).alias("customer_id"),
            F.when(is_order, p["totalAmount"].try_cast("decimal(12,2)")).alias("amount"),
        )
    )
    if not rows:
        return []
    cur.execute(
        """CREATE TEMP TABLE incoming_events (
             event_id uuid, event_type text, occurred_at timestamptz,
             customer_id bigint, amount numeric(12,2)
           ) ON COMMIT DROP"""
    )
    with cur.copy(
        "COPY incoming_events (event_id, event_type, occurred_at, customer_id, amount) FROM STDIN"
    ) as copy:
        for row in rows:
            copy.write_row(row)
    cur.execute(
        """INSERT INTO analytics_processed_events
             (event_id, event_type, occurred_at, customer_id, amount)
           SELECT event_id, event_type, occurred_at, customer_id, amount FROM incoming_events
           ON CONFLICT (event_id) DO NOTHING
           RETURNING event_id::text"""
    )
    return [r[0] for r in cur.fetchall()]


def _upsert_aggregates(cur: psycopg.Cursor, events: DataFrame) -> None:
    cur.executemany(
        """INSERT INTO analytics_sales_hourly AS t
             (bucket_start, orders_count, gross_revenue, order_total_sq_sum, items_sold,
              cancelled_orders, cancelled_revenue)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (bucket_start) DO UPDATE SET
             orders_count       = t.orders_count + EXCLUDED.orders_count,
             gross_revenue      = t.gross_revenue + EXCLUDED.gross_revenue,
             order_total_sq_sum = t.order_total_sq_sum + EXCLUDED.order_total_sq_sum,
             items_sold         = t.items_sold + EXCLUDED.items_sold,
             cancelled_orders   = t.cancelled_orders + EXCLUDED.cancelled_orders,
             cancelled_revenue  = t.cancelled_revenue + EXCLUDED.cancelled_revenue,
             updated_at         = now()""",
        _rows(
            agg.sales_hourly(events).select(
                "bucket_start",
                "orders_count",
                "gross_revenue",
                "order_total_sq_sum",
                "items_sold",
                "cancelled_orders",
                "cancelled_revenue",
            )
        ),
    )
    cur.executemany(
        """INSERT INTO analytics_product_daily AS t
             (day, product_id, sku, category_id, units_sold, revenue, orders_count)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (day, product_id) DO UPDATE SET
             sku          = EXCLUDED.sku,
             category_id  = EXCLUDED.category_id,
             units_sold   = t.units_sold + EXCLUDED.units_sold,
             revenue      = t.revenue + EXCLUDED.revenue,
             orders_count = t.orders_count + EXCLUDED.orders_count""",
        _rows(
            agg.product_daily(events).select(
                "day", "product_id", "sku", "category_id", "units_sold", "revenue", "orders_count"
            )
        ),
    )
    cur.executemany(
        """INSERT INTO analytics_inventory_daily AS t
             (day, product_id, units_in, units_out, movements, last_stock, last_stock_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (day, product_id) DO UPDATE SET
             units_in   = t.units_in + EXCLUDED.units_in,
             units_out  = t.units_out + EXCLUDED.units_out,
             movements  = t.movements + EXCLUDED.movements,
             -- keep whichever stock level is more recent (events may arrive out of order)
             last_stock = CASE WHEN t.last_stock_at IS NULL
                                 OR EXCLUDED.last_stock_at >= t.last_stock_at
                               THEN EXCLUDED.last_stock ELSE t.last_stock END,
             last_stock_at = GREATEST(t.last_stock_at, EXCLUDED.last_stock_at)""",
        _rows(
            agg.inventory_daily(events).select(
                "day",
                "product_id",
                "units_in",
                "units_out",
                "movements",
                "last_stock",
                "last_stock_at",
            )
        ),
    )
    cur.executemany(
        """INSERT INTO analytics_order_status AS t (status, orders_count) VALUES (%s, %s)
           ON CONFLICT (status) DO UPDATE
             SET orders_count = t.orders_count + EXCLUDED.orders_count""",
        _rows(agg.order_status_deltas(events).select("status", "delta")),
    )
    cur.executemany(
        """INSERT INTO analytics_customers AS t
             (customer_id, first_order_at, last_order_at, orders_count, revenue)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (customer_id) DO UPDATE SET
             first_order_at = LEAST(t.first_order_at, EXCLUDED.first_order_at),
             last_order_at  = GREATEST(t.last_order_at, EXCLUDED.last_order_at),
             orders_count   = t.orders_count + EXCLUDED.orders_count,
             revenue        = t.revenue + EXCLUDED.revenue""",
        _rows(
            agg.customer_deltas(events).select(
                "customer_id", "first_order_at", "last_order_at", "orders_count", "revenue"
            )
        ),
    )


def apply_events(
    conn: psycopg.Connection, spark: SparkSession, events: DataFrame
) -> tuple[int, int]:
    """Claims and aggregates events inside the caller's transaction.

    Returns (events_applied, anomalies_detected). Events already processed are ignored.
    """
    with conn.cursor() as cur:
        new_ids = _claim_events(cur, events)
        if not new_ids:
            return 0, 0
        new_ids_df = spark.createDataFrame([(i,) for i in new_ids], "event_id string")
        applied = events.join(F.broadcast(new_ids_df), "event_id").cache()
        try:
            _upsert_aggregates(cur, applied)
            anomalies = detect_anomalies(cur, applied)
        finally:
            applied.unpersist()
        return len(new_ids), anomalies


def process_batch(
    conn: psycopg.Connection,
    spark: SparkSession,
    *,
    job: str,
    batch_id: int,
    events: DataFrame,
    total: int,
    invalid: int,
) -> BatchResult:
    """Applies one micro-batch of valid events exactly once (see module docstring).

    `events` must already be deduplicated by event_id within the batch.
    """
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO analytics_stream_batches
                     (job, batch_id, events_total, events_valid, events_invalid,
                      events_duplicate, events_applied)
                   VALUES (%s, %s, 0, 0, 0, 0, 0)
                   ON CONFLICT (job, batch_id) DO NOTHING""",
                (job, batch_id),
            )
            if cur.rowcount == 0:
                return BatchResult(status="skipped")

        valid = events.count()
        applied, anomalies = apply_events(conn, spark, events)
        result = BatchResult(
            status="applied",
            events_total=total,
            events_valid=valid,
            events_invalid=invalid,
            # valid records that were already processed, in this batch or an earlier one
            events_duplicate=(total - invalid) - applied,
            events_applied=applied,
            anomalies=anomalies,
        )
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE analytics_stream_batches
                   SET events_total = %s, events_valid = %s, events_invalid = %s,
                       events_duplicate = %s, events_applied = %s, processed_at = now()
                   WHERE job = %s AND batch_id = %s""",
                (
                    result.events_total,
                    result.events_valid,
                    result.events_invalid,
                    result.events_duplicate,
                    result.events_applied,
                    job,
                    batch_id,
                ),
            )
        return result
