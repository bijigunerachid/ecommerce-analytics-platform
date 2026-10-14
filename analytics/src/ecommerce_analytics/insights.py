"""Customer and sales insights computed by Spark from the event history.

- order_facts: one row per order with its final cancelled state.
- rfm: Recency, Frequency, Monetary scores (1-5) and a segment per customer.
- cohorts: weekly cohorts by first order and how many customers ordered again N weeks later.
- daily_net_revenue: net revenue per UTC day (input to the forecast).

Cancelled orders count for nothing: a customer who cancelled everything has no orders here.
All functions are pure DataFrame transformations (no I/O), so tests run them on small inputs.
"""

from __future__ import annotations

from pyspark.sql import DataFrame, Window
from pyspark.sql import functions as F

from .aggregations import cancellations, orders

SEGMENTS = ["champions", "loyal", "promising", "needs_attention", "at_risk", "hibernating"]


def order_facts(events: DataFrame) -> DataFrame:
    """Orders that were placed and not cancelled: order_id, customer_id, order_time, total."""
    placed = orders(events).select(
        "order_id", "customer_id", F.col("occurred_at").alias("order_time"), "total"
    )
    cancelled = cancellations(events).select("order_id").distinct()
    return placed.dropDuplicates(["order_id"]).join(cancelled, "order_id", "left_anti")


def _score(column: str, ascending: bool = True) -> F.Column:
    """1-5 by percentile rank; ties share a score (unlike ntile), so results are deterministic."""
    order = F.col(column).asc() if ascending else F.col(column).desc()
    rank = F.percent_rank().over(Window.orderBy(order))
    return F.least(F.floor(rank * 5) + 1, F.lit(5)).cast("smallint")


def segment_of(r: F.Column, f: F.Column, m: F.Column) -> F.Column:
    """Named segments from the scores, checked in this order (first match wins)."""
    return (
        F.when((r >= 4) & (f >= 4) & (m >= 4), "champions")
        .when((r >= 3) & (f >= 3), "loyal")
        .when(r >= 4, "promising")
        .when(r == 3, "needs_attention")
        .when(f >= 3, "at_risk")
        .otherwise("hibernating")
    )


def rfm(facts: DataFrame, as_of) -> DataFrame:
    """Per customer: recency in days (to `as_of`, a date), order count, spend, scores, segment.

    Recency is scored so that more recent = higher; frequency and spend so that more = higher.
    """
    per_customer = facts.groupBy("customer_id").agg(
        F.max("order_time").alias("last_order_at"),
        F.count("*").cast("int").alias("frequency"),
        F.sum("total").alias("monetary"),
    )
    scored = (
        per_customer.withColumn(
            "recency_days", F.datediff(F.lit(as_of), F.to_date("last_order_at")).cast("int")
        )
        .withColumn("r_score", _score("recency_days", ascending=False))
        .withColumn("f_score", _score("frequency"))
        .withColumn("m_score", _score("monetary"))
    )
    return scored.withColumn(
        "segment", segment_of(F.col("r_score"), F.col("f_score"), F.col("m_score"))
    ).select(
        "customer_id",
        "recency_days",
        "frequency",
        "monetary",
        "r_score",
        "f_score",
        "m_score",
        "segment",
        "last_order_at",
    )


def _week(column: str) -> F.Column:
    # date_trunc('week') starts weeks on Monday.
    return F.to_date(F.date_trunc("week", F.col(column)))


def cohorts(facts: DataFrame) -> DataFrame:
    """cohort_week, week_offset, cohort_size, active_customers (offset 0 = the first week)."""
    activity = facts.select("customer_id", _week("order_time").alias("week")).distinct()
    first = activity.groupBy("customer_id").agg(F.min("week").alias("cohort_week"))
    sizes = first.groupBy("cohort_week").agg(F.count("*").cast("int").alias("cohort_size"))
    return (
        activity.join(first, "customer_id")
        .withColumn("week_offset", (F.datediff("week", "cohort_week") / 7).cast("int"))
        .groupBy("cohort_week", "week_offset")
        .agg(F.countDistinct("customer_id").cast("int").alias("active_customers"))
        .join(sizes, "cohort_week")
        .select("cohort_week", "week_offset", "cohort_size", "active_customers")
    )


def daily_net_revenue(facts: DataFrame) -> DataFrame:
    """day (UTC date), revenue: net order value placed that day."""
    return facts.groupBy(F.to_date("order_time").alias("day")).agg(F.sum("total").alias("revenue"))
