from datetime import datetime, timedelta, timezone
from decimal import Decimal

from ecommerce_analytics import aggregations as agg
from ecommerce_analytics.validation import parse_events, valid_events
from events import order_created, status_changed, stock_changed

H10 = datetime(2026, 3, 1, 10, 15, tzinfo=timezone.utc)
H11 = datetime(2026, 3, 1, 11, 45, tzinfo=timezone.utc)


def events_df(kafka_batch, records):
    return valid_events(parse_events(kafka_batch(records)))


def by_key(df, key):
    return {getattr(r, key): r.asDict() for r in df.collect()}


def test_sales_hourly_sums_orders_and_attributes_cancellations_to_order_hour(kafka_batch):
    df = events_df(
        kafka_batch,
        [
            order_created(1, 7, [(1, 100, 2, "10.00")], H10),  # 20.00
            order_created(2, 8, [(2, 100, 1, "5.50")], H10),  # 5.50
            order_created(3, 7, [(1, 100, 1, "10.00")], H11),  # 10.00
            # order 2 cancelled at 11:45 but placed at 10:15 → subtracted from the 10:00 hour
            status_changed(2, 8, "pending", "cancelled", "5.50", H11, order_created_at=H10),
        ],
    )
    hours = by_key(agg.sales_hourly(df), "bucket_start")
    ten = hours[datetime(2026, 3, 1, 10, 0)]
    eleven = hours[datetime(2026, 3, 1, 11, 0)]

    assert ten["orders_count"] == 2
    assert ten["gross_revenue"] == Decimal("25.50")
    assert ten["items_sold"] == 3
    assert ten["cancelled_orders"] == 1
    assert ten["cancelled_revenue"] == Decimal("5.50")
    assert ten["order_total_sq_sum"] == Decimal("430.2500")  # 20² + 5.5²
    assert eleven["orders_count"] == 1
    assert eleven["cancelled_orders"] == 0


def test_product_daily_explodes_order_lines(kafka_batch):
    df = events_df(
        kafka_batch,
        [
            order_created(1, 7, [(1, 100, 2, "10.00"), (2, 200, 1, "3.00")], H10),
            order_created(2, 8, [(1, 100, 3, "10.00")], H11),
        ],
    )
    products = by_key(agg.product_daily(df), "product_id")
    assert products[1]["units_sold"] == 5
    assert products[1]["revenue"] == Decimal("50.00")
    assert products[1]["orders_count"] == 2
    assert products[1]["category_id"] == 100
    assert products[2]["units_sold"] == 1


def test_inventory_daily_splits_in_and_out_and_keeps_latest_stock(kafka_batch):
    df = events_df(
        kafka_batch,
        [
            stock_changed(1, 50, 50, "restock", H10),
            stock_changed(1, -3, 47, "order", H11),
            stock_changed(1, -2, 45, "order", H10 + timedelta(minutes=5)),
        ],
    )
    row = agg.inventory_daily(df).first()
    assert (row.units_in, row.units_out, row.movements) == (50, 5, 3)
    assert row.last_stock == 47  # the 11:45 movement is the latest
    assert row.last_stock_at.hour == 11


def test_order_status_deltas_move_orders_between_statuses(kafka_batch):
    df = events_df(
        kafka_batch,
        [
            order_created(1, 7, [(1, 100, 1, "1.00")], H10),
            order_created(2, 7, [(1, 100, 1, "1.00")], H10),
            status_changed(1, 7, "pending", "paid", "1.00", H11),
        ],
    )
    deltas = {r.status: r.delta for r in agg.order_status_deltas(df).collect()}
    assert deltas == {"pending": 1, "paid": 1}


def test_customer_deltas_are_net_of_cancellations(kafka_batch):
    df = events_df(
        kafka_batch,
        [
            order_created(1, 7, [(1, 100, 1, "40.00")], H10),
            order_created(2, 7, [(1, 100, 1, "60.00")], H11),
            status_changed(2, 7, "pending", "cancelled", "60.00", H11, order_created_at=H11),
        ],
    )
    c = agg.customer_deltas(df).first()
    assert c.customer_id == 7
    assert c.orders_count == 1
    assert c.revenue == Decimal("40.00")
    assert c.first_order_at.hour == 10
