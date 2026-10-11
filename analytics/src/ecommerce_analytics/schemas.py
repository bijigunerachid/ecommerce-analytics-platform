"""Spark schemas for the Kafka event envelope (see docs/events.md).

One payload schema covers all event types: fields that do not apply to an event type are null.
Money is carried as strings and converted to decimals only after validation.
"""

from pyspark.sql.types import (
    ArrayType,
    IntegerType,
    LongType,
    StringType,
    StructField,
    StructType,
)

ORDER_CREATED = "order.created"
ORDER_STATUS_CHANGED = "order.status_changed"
STOCK_CHANGED = "inventory.stock_changed"
KNOWN_EVENT_TYPES = [ORDER_CREATED, ORDER_STATUS_CHANGED, STOCK_CHANGED]
SUPPORTED_SCHEMA_VERSION = 1

ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"]
MOVEMENT_REASONS = ["order", "restock", "adjustment", "cancellation"]

ORDER_ITEM_SCHEMA = StructType(
    [
        StructField("productId", LongType()),
        StructField("sku", StringType()),
        StructField("categoryId", LongType()),
        StructField("quantity", IntegerType()),
        StructField("unitPrice", StringType()),
        StructField("lineTotal", StringType()),
    ]
)

PAYLOAD_SCHEMA = StructType(
    [
        StructField("schemaVersion", IntegerType()),
        # order.created / order.status_changed
        StructField("orderId", LongType()),
        StructField("customerId", LongType()),
        StructField("status", StringType()),
        StructField("totalAmount", StringType()),
        StructField("itemCount", IntegerType()),
        StructField("items", ArrayType(ORDER_ITEM_SCHEMA)),
        StructField("createdAt", StringType()),
        StructField("fromStatus", StringType()),
        StructField("toStatus", StringType()),
        StructField("orderCreatedAt", StringType()),
        StructField("changedAt", StringType()),
        # inventory.stock_changed
        StructField("movementId", LongType()),
        StructField("productId", LongType()),
        StructField("quantityChange", IntegerType()),
        StructField("stockAfter", IntegerType()),
        StructField("reason", StringType()),
        StructField("occurredAt", StringType()),
    ]
)

ENVELOPE_SCHEMA = StructType(
    [
        StructField("eventId", StringType()),
        StructField("eventType", StringType()),
        StructField("schemaVersion", IntegerType()),
        StructField("aggregateType", StringType()),
        StructField("aggregateId", StringType()),
        StructField("occurredAt", StringType()),
        StructField("payload", PAYLOAD_SCHEMA),
    ]
)
