"""Basic anomaly detection over newly applied events.

Rules (thresholds are deliberately simple and documented in docs/analytics.md):

- high_value_order: an order total more than 3 standard deviations above the mean order value
  of the trailing 30 days (needs at least MIN_ORDERS_FOR_STATS orders of history).
- order_velocity: a customer placing VELOCITY_MAX_ORDERS or more orders within a 10-minute
  window (possible bot, fraud, or duplicate submissions).
- revenue_spike: an hour whose gross revenue is more than 3 standard deviations above the hourly
  mean of the previous 7 days (needs MIN_HOURS_FOR_STATS hours with sales).
- large_stock_reduction: a manual adjustment removing at least 50% of a product's stock, or
  LARGE_ADJUSTMENT_UNITS units or more (possible shrinkage or data-entry error).

Every insert uses ON CONFLICT DO NOTHING on (type, entity, time), so re-running detection
never duplicates an anomaly.
"""

from __future__ import annotations

import json

import psycopg
from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from . import aggregations as agg

MIN_ORDERS_FOR_STATS = 20
ORDER_Z_THRESHOLD = 3.0
VELOCITY_MAX_ORDERS = 5
VELOCITY_WINDOW = "10 minutes"
MIN_HOURS_FOR_STATS = 24
REVENUE_Z_THRESHOLD = 3.0
LARGE_ADJUSTMENT_UNITS = 100
LARGE_ADJUSTMENT_SHARE = 0.5

INSERT_SQL = """
  INSERT INTO analytics_anomalies
    (anomaly_type, severity, entity_type, entity_id, occurred_at, description, details)
  VALUES (%s, %s, %s, %s, %s, %s, %s)
  ON CONFLICT ON CONSTRAINT analytics_anomalies_unique DO NOTHING
"""


def _insert(cur: psycopg.Cursor, rows: list[tuple]) -> int:
    inserted = 0
    for row in rows:
        cur.execute(INSERT_SQL, row)
        inserted += cur.rowcount
    return inserted


def _high_value_orders(cur: psycopg.Cursor, events: DataFrame) -> list[tuple]:
    cur.execute(
        """SELECT sum(orders_count), sum(gross_revenue), sum(order_total_sq_sum)
           FROM analytics_sales_hourly
           WHERE bucket_start >= now() - interval '30 days'"""
    )
    n, total, sq_sum = cur.fetchone()
    if not n or n < MIN_ORDERS_FOR_STATS:
        return []
    mean = float(total) / n
    variance = max(float(sq_sum) / n - mean * mean, 0.0)
    std = variance**0.5
    if std == 0:
        return []
    threshold = mean + ORDER_Z_THRESHOLD * std

    rows = []
    for o in agg.orders(events).filter(F.col("total") > threshold).collect():
        z = (float(o.total) - mean) / std
        rows.append(
            (
                "high_value_order",
                "high" if z >= 5 else "medium",
                "order",
                str(o.order_id),
                o.occurred_at,
                f"Order total {o.total} is {z:.1f} standard deviations above the 30-day mean",
                json.dumps(
                    {
                        "orderId": o.order_id,
                        "customerId": o.customer_id,
                        "total": str(o.total),
                        "mean": round(mean, 2),
                        "stddev": round(std, 2),
                        "zScore": round(z, 2),
                    }
                ),
            )
        )
    return rows


def _order_velocity(cur: psycopg.Cursor, events: DataFrame) -> list[tuple]:
    customers = [
        r.customer_id for r in agg.orders(events).select("customer_id").distinct().collect()
    ]
    if not customers:
        return []
    # Counts orders per customer in fixed 10-minute windows, over all processed history
    # (which already includes this batch's events).
    cur.execute(
        f"""SELECT customer_id,
                  date_bin(interval '{VELOCITY_WINDOW}', occurred_at, timestamptz 'epoch')
                    AS window_start,
                  count(*) AS orders, sum(amount) AS amount
           FROM analytics_processed_events
           WHERE event_type = 'order.created' AND customer_id = ANY(%s)
           GROUP BY 1, 2
           HAVING count(*) >= %s""",
        (customers, VELOCITY_MAX_ORDERS),
    )
    return [
        (
            "order_velocity",
            "high" if orders >= 2 * VELOCITY_MAX_ORDERS else "medium",
            "customer",
            str(customer_id),
            window_start,
            f"Customer placed {orders} orders within {VELOCITY_WINDOW}",
            json.dumps({"customerId": customer_id, "orders": orders, "amount": str(amount)}),
        )
        for customer_id, window_start, orders, amount in cur.fetchall()
    ]


def _revenue_spikes(cur: psycopg.Cursor, events: DataFrame) -> list[tuple]:
    hours = [r.bucket_start for r in agg.sales_hourly(events).select("bucket_start").collect()]
    if not hours:
        return []
    cur.execute(
        """SELECT h.bucket_start, h.gross_revenue, s.mean, s.stddev, s.hours
           FROM analytics_sales_hourly h
           CROSS JOIN LATERAL (
             SELECT avg(p.gross_revenue) AS mean, stddev_pop(p.gross_revenue) AS stddev,
                    count(*) AS hours
             FROM analytics_sales_hourly p
             WHERE p.bucket_start >= h.bucket_start - interval '7 days'
               AND p.bucket_start < h.bucket_start
               AND p.orders_count > 0
           ) s
           WHERE h.bucket_start = ANY(%s)
             AND s.hours >= %s AND s.stddev > 0
             AND h.gross_revenue > s.mean + %s * s.stddev""",
        (hours, MIN_HOURS_FOR_STATS, REVENUE_Z_THRESHOLD),
    )
    rows = []
    for bucket_start, revenue, mean, std, n_hours in cur.fetchall():
        z = float((revenue - mean) / std)
        rows.append(
            (
                "revenue_spike",
                "high" if z >= 5 else "medium",
                "hour",
                bucket_start.isoformat(),
                bucket_start,
                f"Hourly revenue {revenue} is {z:.1f} standard deviations above the 7-day mean",
                json.dumps(
                    {
                        "revenue": str(revenue),
                        "mean": str(round(mean, 2)),
                        "stddev": str(round(std, 2)),
                        "zScore": round(z, 2),
                        "hoursCompared": n_hours,
                    }
                ),
            )
        )
    return rows


def _large_stock_reductions(events: DataFrame) -> list[tuple]:
    changes = agg.stock_changes(events).filter(
        (F.col("reason") == "adjustment") & (F.col("quantity_change") < 0)
    )
    before = F.col("stock_after") - F.col("quantity_change")
    share = (-F.col("quantity_change")) / F.greatest(before, F.lit(1))
    flagged = changes.withColumn("share", share).filter(
        (F.col("share") >= LARGE_ADJUSTMENT_SHARE)
        | (-F.col("quantity_change") >= LARGE_ADJUSTMENT_UNITS)
    )
    return [
        (
            "large_stock_reduction",
            "high" if c.share >= 0.8 else "medium",
            "product",
            str(c.product_id),
            c.occurred_at,
            f"Manual adjustment removed {-c.quantity_change} units ({c.share:.0%} of stock)",
            json.dumps(
                {
                    "productId": c.product_id,
                    "movementId": c.movement_id,
                    "quantityChange": c.quantity_change,
                    "stockAfter": c.stock_after,
                }
            ),
        )
        for c in flagged.collect()
    ]


def detect_anomalies(cur: psycopg.Cursor, events: DataFrame) -> int:
    """Runs all rules for newly applied events. Must run after aggregates are updated."""
    rows = (
        _high_value_orders(cur, events)
        + _order_velocity(cur, events)
        + _revenue_spikes(cur, events)
        + _large_stock_reductions(events)
    )
    return _insert(cur, rows)
