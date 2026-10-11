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
    history = [
        order_created(
            i, 1000 + i, [(1, 1, 1, f"{40 + i % 20}.00")], NOW - timedelta(days=1, minutes=i)
        )
        for i in range(30)
    ]
    handle(kafka_batch(history))
    assert anomalies(conn) == []

    handle(
        kafka_batch(
            [
                order_created(500, 7, [(1, 1, 1, "55.00")], NOW),  # ordinary
                order_created(501, 8, [(1, 1, 50, "100.00")], NOW),  # 5000.00
            ]
        )
    )
    flagged = anomalies(conn)
    assert flagged == [("high_value_order", "high", "order", "501")]
    details = query(conn, "SELECT details FROM analytics_anomalies")[0][0]
    assert details["total"] == "5000.00"
    assert details["zScore"] > 5


def test_no_high_value_detection_without_enough_history(handle, kafka_batch, conn):
    handle(kafka_batch([order_created(1, 1, [(1, 1, 1, "10.00")], NOW)]))
    handle(kafka_batch([order_created(2, 2, [(1, 1, 1, "99999.00")], NOW)]))
    assert anomalies(conn) == []


def test_hourly_revenue_spike_is_flagged(handle, kafka_batch, conn):
    # Two days of ordinary hourly revenue (between 90 and 110 per hour).
    conn.execute(
        """INSERT INTO analytics_sales_hourly (bucket_start, orders_count, gross_revenue)
           SELECT %s - make_interval(hours => h), 2, 90 + (h %% 5) * 5
           FROM generate_series(1, 48) h""",
        (NOW,),
    )
    spike = [
        order_created(900 + i, 900 + i, [(1, 1, 1, "500.00")], NOW + timedelta(minutes=i))
        for i in range(4)
    ]
    handle(kafka_batch(spike))
    # (The 500.00 orders may also be flagged as high-value orders; only the spike matters here.)
    assert query(
        conn,
        """SELECT entity_type, occurred_at = %s, severity FROM analytics_anomalies
           WHERE anomaly_type = 'revenue_spike'""",
        (NOW,),
    ) == [("hour", True, "high")]


def test_ordinary_hours_are_not_flagged_as_spikes(handle, kafka_batch, conn):
    conn.execute(
        """INSERT INTO analytics_sales_hourly (bucket_start, orders_count, gross_revenue)
           SELECT %s - make_interval(hours => h), 2, 90 + (h %% 5) * 5
           FROM generate_series(1, 48) h""",
        (NOW,),
    )
    handle(kafka_batch([order_created(1, 1, [(1, 1, 1, "105.00")], NOW)]))
    assert query(
        conn, "SELECT count(*) FROM analytics_anomalies WHERE anomaly_type = 'revenue_spike'"
    ) == [(0,)]
