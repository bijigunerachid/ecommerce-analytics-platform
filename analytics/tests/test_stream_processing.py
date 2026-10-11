"""End-to-end tests of one micro-batch: the same handler the streaming query runs, fed with
Kafka-shaped DataFrames, writing Parquet to a temp directory and aggregates to the test DB."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from conftest import query
from ecommerce_analytics import postgres_sink
from ecommerce_analytics.jobs.rebuild_aggregates import rebuild
from ecommerce_analytics.jobs.stream_events import make_batch_handler
from events import order_created, status_changed, stock_changed

T = datetime(2026, 3, 1, 10, 15, tzinfo=timezone.utc)


@pytest.fixture
def handler(settings, conn, tmp_path):
    from dataclasses import replace

    isolated = replace(settings, data_dir=str(tmp_path))
    stats: dict = {}
    return make_batch_handler(isolated, stats), stats, isolated


def sales(conn):
    return query(
        conn,
        """SELECT orders_count, gross_revenue, items_sold, cancelled_orders, cancelled_revenue
           FROM analytics_sales_hourly ORDER BY bucket_start""",
    )


def scenario():
    """Two orders, a cancellation, and the matching stock movements."""
    o1 = order_created(1, 7, [(1, 100, 2, "10.00")], T)
    o2 = order_created(2, 8, [(2, 200, 1, "99.00")], T + timedelta(minutes=5))
    return [
        o1,
        stock_changed(1, -2, 8, "order", T, order_id=1),
        o2,
        stock_changed(2, -1, 4, "order", T + timedelta(minutes=5), order_id=2),
        status_changed(
            2,
            8,
            "pending",
            "cancelled",
            "99.00",
            T + timedelta(hours=1),
            order_created_at=o2_time(),
        ),
        stock_changed(2, 1, 5, "cancellation", T + timedelta(hours=1), order_id=2),
    ]


def o2_time():
    return T + timedelta(minutes=5)


def test_a_batch_updates_every_aggregate(handler, kafka_batch, conn):
    handle, stats, _ = handler
    handle(kafka_batch(scenario()), 0)

    assert sales(conn) == [(2, Decimal("119.00"), 3, 1, Decimal("99.00"))]
    assert query(conn, "SELECT status, orders_count FROM analytics_order_status ORDER BY 1") == [
        ("cancelled", 1),
        ("pending", 1),
    ]
    assert query(
        conn, "SELECT product_id, units_sold, revenue FROM analytics_product_daily ORDER BY 1"
    ) == [(1, 2, Decimal("20.00")), (2, 1, Decimal("99.00"))]
    assert query(
        conn,
        "SELECT product_id, units_in, units_out, last_stock"
        " FROM analytics_inventory_daily ORDER BY 1",
    ) == [(1, 0, 2, 8), (2, 1, 1, 5)]
    assert query(
        conn, "SELECT customer_id, orders_count, revenue FROM analytics_customers ORDER BY 1"
    ) == [(7, 1, Decimal("20.00")), (8, 0, Decimal("0.00"))]
    assert stats["eventsApplied"] == 6
    assert stats["lastBatchStatus"] == "applied"


def test_replaying_a_batch_changes_nothing(handler, kafka_batch, conn):
    handle, stats, _ = handler
    batch = kafka_batch(scenario())
    handle(batch, 0)
    before = sales(conn)

    handle(batch, 0)  # Spark replays batch 0 after a crash

    assert sales(conn) == before
    assert stats["lastBatchStatus"] == "skipped"
    assert query(conn, "SELECT count(*) FROM analytics_stream_batches") == [(1,)]


def test_redelivered_events_in_a_later_batch_are_not_counted_twice(handler, kafka_batch, conn):
    handle, _, _ = handler
    events = scenario()
    handle(kafka_batch(events[:3]), 0)
    # Batch 1 redelivers the first three events (relay retry) plus the three new ones.
    handle(kafka_batch(events), 1)

    assert sales(conn) == [(2, Decimal("119.00"), 3, 1, Decimal("99.00"))]
    assert query(
        conn,
        "SELECT batch_id, events_total, events_applied, events_duplicate "
        "FROM analytics_stream_batches ORDER BY 1",
    ) == [(0, 3, 3, 0), (1, 6, 3, 3)]


def test_duplicates_within_a_batch_and_invalid_records(handler, kafka_batch, conn, spark):
    handle, stats, s = handler
    o1 = order_created(1, 7, [(1, 100, 1, "10.00")], T)
    handle(kafka_batch([o1, o1, "not json", {**o1, "eventId": "bad"}]), 0)

    assert sales(conn) == [(1, Decimal("10.00"), 1, 0, Decimal("0.00"))]
    assert query(
        conn,
        "SELECT events_total, events_valid, events_invalid, events_duplicate, events_applied "
        "FROM analytics_stream_batches",
    ) == [(4, 1, 2, 1, 1)]
    quarantined = spark.read.parquet(s.quarantine_path).collect()
    assert sorted(r.error_reason for r in quarantined) == ["invalid_event_id", "malformed_json"]
    assert stats["eventsInvalid"] == 2


def test_parquet_history_is_partitioned_and_idempotent_per_batch(handler, kafka_batch, spark):
    handle, _, s = handler
    batch = kafka_batch(scenario())
    handle(batch, 0)
    handle(batch, 0)  # replay overwrites the same directory instead of appending

    history = spark.read.parquet(s.events_path)
    assert history.count() == 6
    assert {"batch_id", "event_date", "event_id", "payload"} <= set(history.columns)
    assert {str(r.event_date) for r in history.select("event_date").distinct().collect()} == {
        "2026-03-01"
    }


def test_a_failure_rolls_back_the_whole_batch(handler, kafka_batch, conn, monkeypatch):
    handle, _, _ = handler

    def boom(*_args):
        raise RuntimeError("simulated crash during anomaly detection")

    monkeypatch.setattr(postgres_sink, "detect_anomalies", boom)
    with pytest.raises(RuntimeError, match="simulated crash"):
        handle(kafka_batch(scenario()), 0)

    for table in (
        "analytics_stream_batches",
        "analytics_processed_events",
        "analytics_sales_hourly",
    ):
        assert query(conn, f"SELECT count(*) FROM {table}") == [(0,)]

    monkeypatch.undo()
    handle(kafka_batch(scenario()), 0)  # the replay after the crash succeeds
    assert sales(conn) == [(2, Decimal("119.00"), 3, 1, Decimal("99.00"))]


def test_batch_rebuild_reproduces_the_streaming_aggregates(handler, kafka_batch, conn, spark):
    handle, _, s = handler
    events = scenario()
    handle(kafka_batch(events[:4]), 0)
    handle(kafka_batch(events[2:]), 1)  # overlapping redelivery
    streamed = {
        "sales": sales(conn),
        "products": query(conn, "SELECT * FROM analytics_product_daily ORDER BY 1, 2"),
        "status": query(conn, "SELECT * FROM analytics_order_status ORDER BY 1"),
        "customers": query(conn, "SELECT * FROM analytics_customers ORDER BY 1"),
    }

    summary = rebuild(spark, s)

    assert summary["records"] == 8  # 4 + 4 Parquet rows across the two batches
    assert summary["unique_events"] == 6
    assert summary["applied"] == 6
    assert sales(conn) == streamed["sales"]
    assert (
        query(conn, "SELECT * FROM analytics_product_daily ORDER BY 1, 2") == streamed["products"]
    )
    assert query(conn, "SELECT * FROM analytics_order_status ORDER BY 1") == streamed["status"]
    assert query(conn, "SELECT * FROM analytics_customers ORDER BY 1") == streamed["customers"]
