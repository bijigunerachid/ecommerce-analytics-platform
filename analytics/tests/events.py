"""Factories for synthetic event envelopes, matching docs/events.md."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def envelope(
    event_type: str,
    aggregate_type: str,
    aggregate_id,
    payload: dict,
    at: datetime,
    event_id: str | None = None,
) -> dict:
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": event_type,
        "schemaVersion": 1,
        "aggregateType": aggregate_type,
        "aggregateId": str(aggregate_id),
        "occurredAt": iso(at),
        "payload": {"schemaVersion": 1, **payload},
    }


def order_created(
    order_id: int, customer_id: int, items: list[tuple], at: datetime, **overrides
) -> dict:
    """items: (product_id, category_id, quantity, unit_price as str)."""
    lines = []
    total = Decimal("0")
    for product_id, category_id, quantity, unit_price in items:
        line_total = Decimal(unit_price) * quantity
        total += line_total
        lines.append(
            {
                "productId": product_id,
                "sku": f"SKU-{product_id}",
                "categoryId": category_id,
                "quantity": quantity,
                "unitPrice": unit_price,
                "lineTotal": f"{line_total:.2f}",
            }
        )
    payload = {
        "orderId": order_id,
        "customerId": customer_id,
        "status": "pending",
        "totalAmount": f"{total:.2f}",
        "itemCount": len(lines),
        "items": lines,
        "createdAt": iso(at),
    }
    payload.update(overrides)
    return envelope("order.created", "order", order_id, payload, at)


def status_changed(
    order_id: int,
    customer_id: int,
    from_status: str,
    to_status: str,
    total: str,
    at: datetime,
    order_created_at: datetime | None = None,
) -> dict:
    return envelope(
        "order.status_changed",
        "order",
        order_id,
        {
            "orderId": order_id,
            "customerId": customer_id,
            "fromStatus": from_status,
            "toStatus": to_status,
            "totalAmount": total,
            "orderCreatedAt": iso(order_created_at) if order_created_at else None,
            "changedAt": iso(at),
        },
        at,
    )


_movement_ids = iter(range(1, 10**9))


def stock_changed(
    product_id: int,
    change: int,
    stock_after: int,
    reason: str,
    at: datetime,
    order_id: int | None = None,
) -> dict:
    return envelope(
        "inventory.stock_changed",
        "product",
        product_id,
        {
            "movementId": next(_movement_ids),
            "productId": product_id,
            "quantityChange": change,
            "stockAfter": stock_after,
            "reason": reason,
            "orderId": order_id,
            "occurredAt": iso(at),
        },
        at,
    )


def to_json(event: dict) -> str:
    return json.dumps(event)
