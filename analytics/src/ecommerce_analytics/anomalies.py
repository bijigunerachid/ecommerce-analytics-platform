"""Basic anomaly detection over newly applied events.

Rules (thresholds are deliberately simple and documented in docs/analytics.md):

- high_value_order: an order total above HIGH_VALUE_MULTIPLE x the 99th percentile of order
  totals over the trailing 30 days (needs MIN_ORDERS_FOR_STATS orders of history). Percentiles
  are used rather than mean + k*stddev because order values are heavily skewed (cheap
  accessories next to laptops): a z-score flagged ordinary multi-laptop orders.
- order_velocity: a customer placing VELOCITY_MAX_ORDERS or more orders within a 10-minute
  window (possible bot, fraud, or duplicate submissions).
- revenue_spike: a day whose gross revenue is more than 3 standard deviations above the mean of
  the previous 14 days and at least 1.5x that mean (needs MIN_DAYS_FOR_STATS days with sales).
  Daily totals are used because single hours are too noisy: one large order at night would
  "spike" its hour.
- large_stock_reduction: a manual adjustment removing at least 50% of a product's stock, or
  LARGE_ADJUSTMENT_UNITS units or more (possible shrinkage or data-entry error).

Every insert uses ON CONFLICT DO NOTHING on (type, entity, time), so re-running detection
never duplicates an anomaly.
"""

from __future__ import annotations

import json
from datetime import datetime, time, timezone

import psycopg
from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from . import aggregations as agg

MIN_ORDERS_FOR_STATS = 200
HIGH_VALUE_MULTIPLE = 3.0
HIGH_VALUE_SEVERE_MULTIPLE = 10.0
VELOCITY_MAX_ORDERS = 5
VELOCITY_WINDOW = "10 minutes"
MIN_DAYS_FOR_STATS = 7
REVENUE_Z_THRESHOLD = 3.0
REVENUE_MIN_RATIO = 1.5
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
    # The 99th percentile needs a few hundred orders to be stable: with fewer, a single huge
    # order lands at the 99th percentile itself and hides. MIN_ORDERS_FOR_STATS guards that.
    cur.execute(
        """SELECT count(*), percentile_cont(0.99) WITHIN GROUP (ORDER BY amount)
           FROM analytics_processed_events
           WHERE event_type = 'order.created' AND amount IS NOT NULL
             AND occurred_at >= now() - interval '30 days'"""
    )
    n, p99 = cur.fetchone()
    if n < MIN_ORDERS_FOR_STATS or not p99:
        return []
    p99 = float(p99)
    threshold = HIGH_VALUE_MULTIPLE * p99

    rows = []
    for o in agg.orders(events).filter(F.col("total") > threshold).collect():
        ratio = float(o.total) / p99
        rows.append(
            (
                "high_value_order",
                "high" if ratio >= HIGH_VALUE_SEVERE_MULTIPLE else "medium",
                "order",
                str(o.order_id),
                o.occurred_at,
                f"Order total {o.total} is {ratio:.1f}x the 99th percentile of the last 30 days",
                json.dumps(
                    {
                        "orderId": o.order_id,
                        "customerId": o.customer_id,
                        "total": str(o.total),
                        "p99": round(p99, 2),
                        "ratioToP99": round(ratio, 2),
                        "ordersCompared": n,
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
    days = sorted(
        {r.bucket_start.date() for r in agg.sales_hourly(events).select("bucket_start").collect()}
    )
    if not days:
        return []
    cur.execute(
        """WITH daily AS (
             SELECT (bucket_start AT TIME ZONE 'UTC')::date AS day, sum(gross_revenue) AS revenue
             FROM analytics_sales_hourly
             GROUP BY 1
           )
           SELECT t.day, t.revenue, s.mean, s.stddev, s.days
           FROM daily t
           CROSS JOIN LATERAL (
             SELECT avg(p.revenue) AS mean, stddev_pop(p.revenue) AS stddev, count(*) AS days
             FROM daily p
             WHERE p.day >= t.day - 14 AND p.day < t.day AND p.revenue > 0
           ) s
           WHERE t.day = ANY(%s)
             AND s.days >= %s AND s.stddev > 0
             AND t.revenue > s.mean + %s * s.stddev
             AND t.revenue >= %s * s.mean""",
        (days, MIN_DAYS_FOR_STATS, REVENUE_Z_THRESHOLD, REVENUE_MIN_RATIO),
    )
    rows = []
    for day, revenue, mean, std, n_days in cur.fetchall():
        z = float((revenue - mean) / std)
        rows.append(
            (
                "revenue_spike",
                "high" if z >= 5 else "medium",
                "day",
                day.isoformat(),
                datetime.combine(day, time.min, tzinfo=timezone.utc),
                f"Daily revenue {revenue} is {z:.1f} standard deviations above the 14-day mean",
                json.dumps(
                    {
                        "revenue": str(revenue),
                        "mean": str(round(mean, 2)),
                        "stddev": str(round(std, 2)),
                        "zScore": round(z, 2),
                        "daysCompared": n_days,
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
