from datetime import datetime, timedelta, timezone

import pytest

from conftest import query
from ecommerce_analytics.jobs.stream_events import make_batch_handler
from events import order_created, stock_changed

NOW = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)


@pytest.fixture
def handle(settings, conn, tmp_path):
    from dataclasses import replace

    handler = make_batch_handler(replace(settings, data_dir=str(tmp_path)), {})
    batch_ids = iter(range(10**6))
    return lambda kafka_df: handler(kafka_df, next(batch_ids))


def anomalies(conn):
    return query(
        conn,
        "SELECT anomaly_type, severity, entity_type, entity_id"
        " FROM analytics_anomalies ORDER BY id",
    )


def test_large_manual_stock_reduction_is_flagged(handle, kafka_batch, conn):
    handle(
        kafka_batch(
            [
                stock_changed(1, -9, 1, "adjustment", NOW),  # 90% of stock removed → high
                stock_changed(2, -120, 880, "adjustment", NOW),  # ≥100 units → medium
                stock_changed(3, -2, 18, "adjustment", NOW),  # 10% → normal
                stock_changed(4, -9, 1, "order", NOW),  # orders are not adjustments
            ]
        )
    )
    assert sorted(anomalies(conn)) == [
        ("large_stock_reduction", "high", "product", "1"),
        ("large_stock_reduction", "medium", "product", "2"),
    ]


def test_order_velocity_flags_bursts_from_one_customer(handle, kafka_batch, conn):
    burst = [
        order_created(100 + i, 42, [(1, 1, 1, "10.00")], NOW + timedelta(minutes=i))
        for i in range(5)
    ]
    normal = [
        order_created(200 + i, 43, [(1, 1, 1, "10.00")], NOW + timedelta(minutes=i))
        for i in range(4)
    ]
    handle(kafka_batch(burst[:3] + normal))
    assert anomalies(conn) == []  # 3 orders so far: below the threshold

    handle(kafka_batch(burst[3:]))  # the burst completes in a later batch
    assert anomalies(conn) == [("order_velocity", "medium", "customer", "42")]

    # Detection is idempotent: more orders in the same window do not add duplicates.
    handle(kafka_batch([order_created(300, 42, [(1, 1, 1, "10.00")], NOW + timedelta(minutes=6))]))
    assert len(anomalies(conn)) == 1


def test_high_value_order_is_flagged_against_recent_history(handle, kafka_batch, conn):
    # 200 ordinary orders between 40.00 and 59.00: the 99th percentile is 59.
    history = [
        order_created(
            i, 1000 + i, [(1, 1, 1, f"{40 + i % 20}.00")], NOW - timedelta(days=1, minutes=i)
        )
        for i in range(200)
    ]
    handle(kafka_batch(history))
    assert anomalies(conn) == []

    handle(
        kafka_batch(
            [
                order_created(500, 7, [(1, 1, 2, "55.00")], NOW),  # 110.00: about 2x p99, normal
                order_created(501, 8, [(1, 1, 50, "100.00")], NOW),  # 5000.00: about 85x p99
            ]
        )
    )
    assert anomalies(conn) == [("high_value_order", "high", "order", "501")]
    details = query(conn, "SELECT details FROM analytics_anomalies")[0][0]
    assert details["total"] == "5000.00"
    assert details["p99"] == 59
    assert details["ratioToP99"] > 80


def test_no_high_value_detection_without_enough_history(handle, kafka_batch, conn):
    handle(kafka_batch([order_created(1, 1, [(1, 1, 1, "10.00")], NOW)]))
    handle(kafka_batch([order_created(2, 2, [(1, 1, 1, "99999.00")], NOW)]))
    assert anomalies(conn) == []


def seed_daily_revenue(conn, days=14):
    """Two weeks of ordinary days, 900-1100 revenue each, before NOW's date."""
    conn.execute(
        """INSERT INTO analytics_sales_hourly (bucket_start, orders_count, gross_revenue)
           SELECT ((%s::timestamptz AT TIME ZONE 'UTC')::date - d + time '12:00')
                    AT TIME ZONE 'UTC',
                  10, 900 + (d %% 5) * 50
           FROM generate_series(1, %s) d""",
        (NOW, days),
    )


def test_daily_revenue_spike_is_flagged(handle, kafka_batch, conn):
    seed_daily_revenue(conn)
    spike = [
        order_created(900 + i, 900 + i, [(1, 1, 1, "750.00")], NOW + timedelta(minutes=i))
        for i in range(4)
    ]
    handle(kafka_batch(spike))  # 3000.00 today vs. ~1000 per day before
    rows = query(
        conn,
        """SELECT entity_type, entity_id, occurred_at, severity, details
           FROM analytics_anomalies WHERE anomaly_type = 'revenue_spike'""",
    )
    assert len(rows) == 1
    entity_type, entity_id, occurred_at, severity, details = rows[0]
    assert entity_type == "day"
    assert entity_id == NOW.date().isoformat()
    assert occurred_at == datetime.combine(NOW.date(), datetime.min.time(), tzinfo=timezone.utc)
    assert severity == "high"
    assert details["daysCompared"] == 14


def test_ordinary_days_are_not_flagged_as_spikes(handle, kafka_batch, conn):
    seed_daily_revenue(conn)
    handle(kafka_batch([order_created(1, 1, [(1, 1, 2, "500.00")], NOW)]))  # 1000.00 today
    assert query(
        conn, "SELECT count(*) FROM analytics_anomalies WHERE anomaly_type = 'revenue_spike'"
    ) == [(0,)]


def test_spike_detection_needs_a_week_of_history(handle, kafka_batch, conn):
    seed_daily_revenue(conn, days=5)
    handle(kafka_batch([order_created(1, 1, [(1, 1, 10, "500.00")], NOW)]))
    assert query(
        conn, "SELECT count(*) FROM analytics_anomalies WHERE anomaly_type = 'revenue_spike'"
    ) == [(0,)]
