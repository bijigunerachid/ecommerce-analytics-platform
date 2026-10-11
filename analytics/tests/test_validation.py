from datetime import datetime, timezone
from decimal import Decimal

import pytest

from ecommerce_analytics.validation import invalid_records, parse_events, valid_events
from events import envelope, order_created, status_changed, stock_changed

T = datetime(2026, 3, 1, 12, 30, tzinfo=timezone.utc)


def reasons(kafka_batch, records) -> list:
    parsed = parse_events(kafka_batch(records))
    return [r.error_reason for r in parsed.orderBy("kafka_offset").collect()]


def test_valid_events_of_every_type_are_parsed_and_typed(kafka_batch):
    order = order_created(10, 7, [(1, 100, 2, "19.99"), (2, 100, 1, "5.00")], T)
    events = [
        order,
        status_changed(10, 7, "pending", "paid", "44.98", T, order_created_at=T),
        stock_changed(1, -2, 8, "order", T, order_id=10),
    ]
    parsed = parse_events(kafka_batch(events))
    rows = valid_events(parsed).orderBy("kafka_offset").collect()

    assert [r.event_type for r in rows] == [
        "order.created",
        "order.status_changed",
        "inventory.stock_changed",
    ]
    assert invalid_records(parsed).count() == 0
    first = rows[0]
    assert first.event_id == order["eventId"]
    assert first.occurred_at.replace(tzinfo=timezone.utc) == T
    assert str(first.event_date) == "2026-03-01"
    assert first.payload.items[0].quantity == 2
    assert first.aggregate_id == "10"


def test_event_ids_are_normalized_to_lowercase(kafka_batch):
    event = stock_changed(1, 5, 5, "restock", T)
    event["eventId"] = event["eventId"].upper()
    row = valid_events(parse_events(kafka_batch([event]))).first()
    assert row.event_id == event["eventId"].lower()


@pytest.mark.parametrize(
    ("mutate", "reason"),
    [
        (lambda e: "{not json", "malformed_json"),
        (lambda e: "[1, 2, 3]", "malformed_json"),
        (lambda e: {**e, "eventId": None}, "missing_event_id"),
        (lambda e: {**e, "eventId": "not-a-uuid"}, "invalid_event_id"),
        (lambda e: {**e, "eventType": "order.deleted"}, "unknown_event_type"),
        (lambda e: {**e, "schemaVersion": 2}, "unsupported_schema_version"),
        (lambda e: {**e, "occurredAt": "yesterday"}, "invalid_occurred_at"),
        (lambda e: {**e, "payload": None}, "missing_payload"),
        (
            lambda e: {**e, "payload": {**e["payload"], "customerId": None}},
            "missing_order_fields",
        ),
        (lambda e: {**e, "payload": {**e["payload"], "totalAmount": "abc"}}, "invalid_amount"),
        (lambda e: {**e, "payload": {**e["payload"], "totalAmount": "1.999"}}, "invalid_amount"),
        (lambda e: {**e, "payload": {**e["payload"], "items": []}}, "missing_items"),
        (
            lambda e: {
                **e,
                "payload": {**e["payload"], "items": [{**e["payload"]["items"][0], "quantity": 0}]},
            },
            "invalid_item",
        ),
        (lambda e: {**e, "payload": {**e["payload"], "totalAmount": "1.00"}}, "total_mismatch"),
    ],
)
def test_invalid_order_events_are_quarantined_with_a_reason(kafka_batch, mutate, reason):
    event = order_created(1, 1, [(1, 100, 2, "10.00")], T)
    assert reasons(kafka_batch, [mutate(event)]) == [reason]


@pytest.mark.parametrize(
    ("event", "reason"),
    [
        (status_changed(1, 1, "pending", "lost", "1.00", T), "invalid_status"),
        (status_changed(1, 1, "pending", "paid", "-5", T), "invalid_amount"),
        (stock_changed(1, 0, 5, "adjustment", T), "invalid_quantity"),
        (stock_changed(1, -9, -4, "adjustment", T), "invalid_stock_level"),
        (stock_changed(1, 3, 3, "theft", T), "invalid_reason"),
    ],
)
def test_invalid_status_and_stock_events(kafka_batch, event, reason):
    assert reasons(kafka_batch, [event]) == [reason]


def test_bad_records_do_not_break_good_ones_in_the_same_batch(kafka_batch):
    good = stock_changed(1, 5, 5, "restock", T)
    parsed = parse_events(kafka_batch(["garbage", good, envelope("x.y", "x", 1, {}, T)]))
    assert valid_events(parsed).count() == 1
    bad = invalid_records(parsed).orderBy("kafka_offset").collect()
    assert [r.error_reason for r in bad] == ["malformed_json", "unknown_event_type"]
    assert bad[0].raw_value == "garbage"


def test_total_check_uses_exact_decimals(kafka_batch):
    # 3 × 0.10 + 0.20 = 0.50 exactly; floating point would give 0.5000000000000001
    event = order_created(1, 1, [(1, 100, 3, "0.10"), (2, 100, 1, "0.20")], T)
    assert event["payload"]["totalAmount"] == "0.50"
    assert reasons(kafka_batch, [event]) == [None]
    assert Decimal(event["payload"]["totalAmount"]) == Decimal("0.50")
