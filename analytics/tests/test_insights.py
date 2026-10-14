"""Segments, cohorts, and the insights job end to end (Parquet history → PostgreSQL)."""

from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from conftest import query
from ecommerce_analytics.insights import cohorts, order_facts, rfm, segment_of
from ecommerce_analytics.jobs.compute_insights import compute
from ecommerce_analytics.jobs.stream_events import make_batch_handler
from ecommerce_analytics.validation import parse_events, valid_events
from events import order_created, status_changed

NOW = datetime(2026, 3, 30, 12, 0, tzinfo=timezone.utc)
_order_ids = iter(range(1, 10**6))


def order(customer_id, days_ago, amount="10.00"):
    return order_created(
        next(_order_ids), customer_id, [(1, 1, 1, amount)], NOW - timedelta(days=days_ago)
    )


def events_df(spark, kafka_batch, records):
    return valid_events(parse_events(kafka_batch(records)))


def test_order_facts_drop_cancelled_orders_and_duplicates(spark, kafka_batch):
    placed = order(1, 3, "50.00")
    kept = order(1, 2, "20.00")
    cancel = status_changed(
        placed["payload"]["orderId"], 1, "pending", "cancelled", "50.00", NOW, NOW
    )
    facts = order_facts(events_df(spark, kafka_batch, [placed, kept, kept, cancel])).collect()
    assert [(r.order_id, r.total) for r in facts] == [
        (kept["payload"]["orderId"], Decimal("20.00"))
    ]


def test_rfm_scores_and_segments(spark, kafka_batch):
    records = (
        # Customer 1: recent, frequent, big spender.
        [order(1, d, "300.00") for d in (1, 3, 5, 8, 12)]
        # Customer 2: frequent but long ago.
        + [order(2, d, "40.00") for d in (60, 65, 70, 75)]
        # Customer 3: one small recent order.
        + [order(3, 2, "15.00")]
        # Customer 4: one small old order.
        + [order(4, 80, "12.00")]
        # Customer 5: average.
        + [order(5, d, "60.00") for d in (20, 30)]
    )
    facts = order_facts(events_df(spark, kafka_batch, records))
    rows = {r.customer_id: r for r in rfm(facts, NOW.date()).collect()}

    assert rows[1].recency_days == 1 and rows[1].frequency == 5
    assert rows[1].monetary == Decimal("1500.00")
    assert (rows[1].r_score, rows[1].f_score, rows[1].m_score) == (5, 5, 5)
    assert rows[1].segment == "champions"
    assert rows[2].segment == "at_risk"  # bought often, not lately
    assert rows[3].segment == "promising"  # recent, few orders
    assert rows[4].segment == "hibernating"
    assert all(1 <= r.r_score <= 5 and 1 <= r.f_score <= 5 for r in rows.values())


@pytest.mark.parametrize(
    ("r", "f", "m", "segment"),
    [
        (5, 5, 5, "champions"),
        (5, 5, 3, "loyal"),
        (3, 3, 1, "loyal"),
        (5, 1, 1, "promising"),
        (3, 2, 5, "needs_attention"),
        (2, 4, 4, "at_risk"),
        (1, 1, 1, "hibernating"),
    ],
)
def test_segment_rules(spark, r, f, m, segment):
    from pyspark.sql import functions as F

    row = spark.range(1).select(segment_of(F.lit(r), F.lit(f), F.lit(m)).alias("s")).first()
    assert row.s == segment


def test_weekly_cohorts(spark, kafka_batch):
    # Mondays: 2026-03-02, 03-09, 03-16.
    def at(d, customer):
        return order_created(
            next(_order_ids),
            customer,
            [(1, 1, 1, "10.00")],
            datetime(2026, 3, d, 10, tzinfo=timezone.utc),
        )

    records = [at(2, 1), at(4, 2), at(10, 1), at(17, 2), at(11, 3)]
    rows = sorted(
        (str(r.cohort_week), r.week_offset, r.cohort_size, r.active_customers)
        for r in cohorts(order_facts(events_df(spark, kafka_batch, records))).collect()
    )
    assert rows == [
        ("2026-03-02", 0, 2, 2),
        ("2026-03-02", 1, 2, 1),  # customer 1 came back the next week
        ("2026-03-02", 2, 2, 1),  # customer 2 two weeks later
        ("2026-03-09", 0, 1, 1),
    ]


def test_job_writes_all_insights_and_records_the_run(spark, settings, conn, kafka_batch, tmp_path):
    isolated = replace(settings, data_dir=str(tmp_path))
    handler = make_batch_handler(isolated, {})
    # 60 days of daily orders from 3 customers, so the forecast has enough history.
    records = [order(1 + d % 3, d, f"{100 + d}.00") for d in range(1, 61)]
    handler(kafka_batch(records), 0)

    summary = compute(spark, isolated, now=NOW)

    assert summary["customers"] == 3
    assert summary["forecast_days"] == 14
    assert summary["training_days"] == 60
    assert summary["backtest_wape"] is not None
    assert query(conn, "SELECT count(*) FROM analytics_customer_segments") == [(3,)]
    assert query(conn, "SELECT min(day), max(day) FROM analytics_sales_forecast") == [
        (date(2026, 3, 30), date(2026, 4, 12))
    ]
    assert query(
        conn, "SELECT count(DISTINCT cohort_week) > 0 FROM analytics_cohort_retention"
    ) == [(True,)]
    runs = query(conn, "SELECT status, as_of, customers FROM analytics_insights_runs")
    assert runs == [("ok", date(2026, 3, 30), 3)]

    # A second run replaces the results instead of adding to them.
    compute(spark, isolated, now=NOW)
    assert query(conn, "SELECT count(*) FROM analytics_customer_segments") == [(3,)]
    assert query(conn, "SELECT count(*) FROM analytics_sales_forecast") == [(14,)]


def test_job_skips_the_forecast_with_little_history(spark, settings, conn, kafka_batch, tmp_path):
    isolated = replace(settings, data_dir=str(tmp_path))
    make_batch_handler(isolated, {})(kafka_batch([order(1, 1), order(2, 2)]), 0)
    summary = compute(spark, isolated, now=NOW)
    assert summary["forecast_days"] == 0
    assert "forecastSkipped" in summary["details"]
    assert query(conn, "SELECT count(*) FROM analytics_sales_forecast") == [(0,)]


def test_failed_runs_are_recorded(spark, settings, conn, tmp_path):
    missing = replace(settings, data_dir=str(tmp_path / "nothing-here"))
    with pytest.raises(RuntimeError, match="No event history"):
        compute(spark, missing, now=NOW)
    assert query(
        conn, "SELECT status, error LIKE 'No event history%%' FROM analytics_insights_runs"
    ) == [("error", True)]
