"""Parsing and validation of raw Kafka records into typed events.

Every record ends up in exactly one of two DataFrames:
- valid events, with typed columns, ready for history and aggregation
- invalid records, with the raw value and an error_reason, for the quarantine

Spark 4 runs in ANSI mode, where a failed cast raises an error and would fail the whole
stream. All conversions therefore use try_* functions, so bad input becomes a quarantined row.
"""

from pyspark.sql import Column, DataFrame
from pyspark.sql import functions as F
from pyspark.sql.types import MapType, StringType

from .schemas import (
    ENVELOPE_SCHEMA,
    KNOWN_EVENT_TYPES,
    MOVEMENT_REASONS,
    ORDER_CREATED,
    ORDER_STATUS_CHANGED,
    ORDER_STATUSES,
    STOCK_CHANGED,
    SUPPORTED_SCHEMA_VERSION,
)

UUID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
MONEY_PATTERN = r"^\d{1,10}(\.\d{1,2})?$"
MONEY_TYPE = "decimal(12,2)"


def money(col: Column) -> Column:
    """Decimal value of a money string, or null if it is not a valid amount."""
    return F.when(col.rlike(MONEY_PATTERN), col.try_cast(MONEY_TYPE))


def _is_money(col: Column) -> Column:
    return F.coalesce(col.rlike(MONEY_PATTERN), F.lit(False))


def _order_created_error(p: Column) -> Column:
    items_ok = F.forall(
        p["items"],
        lambda i: (
            i["productId"].isNotNull()
            & i["categoryId"].isNotNull()
            & (F.coalesce(i["quantity"], F.lit(0)) > 0)
            & _is_money(i["unitPrice"])
            & _is_money(i["lineTotal"])
        ),
    )
    items_sum = F.aggregate(
        p["items"],
        F.lit(0).cast(MONEY_TYPE),
        lambda acc, i: (acc + money(i["lineTotal"])).cast(MONEY_TYPE),
    )
    return (
        F.when(p["orderId"].isNull() | p["customerId"].isNull(), "missing_order_fields")
        .when(~_is_money(p["totalAmount"]), "invalid_amount")
        .when(F.coalesce(F.size(p["items"]), F.lit(-1)) <= 0, "missing_items")
        .when(~F.coalesce(items_ok, F.lit(False)), "invalid_item")
        .when(items_sum != money(p["totalAmount"]), "total_mismatch")
    )


def _status_changed_error(p: Column) -> Column:
    return (
        F.when(p["orderId"].isNull(), "missing_order_fields")
        .when(
            ~F.coalesce(p["fromStatus"].isin(ORDER_STATUSES), F.lit(False))
            | ~F.coalesce(p["toStatus"].isin(ORDER_STATUSES), F.lit(False)),
            "invalid_status",
        )
        .when(~_is_money(p["totalAmount"]), "invalid_amount")
    )


def _stock_changed_error(p: Column) -> Column:
    return (
        F.when(p["productId"].isNull(), "missing_product")
        .when(F.coalesce(p["quantityChange"], F.lit(0)) == 0, "invalid_quantity")
        .when(F.coalesce(p["stockAfter"], F.lit(-1)) < 0, "invalid_stock_level")
        .when(~F.coalesce(p["reason"].isin(MOVEMENT_REASONS), F.lit(False)), "invalid_reason")
    )


def parse_events(raw: DataFrame) -> DataFrame:
    """Parses Kafka records (value, topic, partition, offset, timestamp) and adds error_reason.

    error_reason is null for valid events.
    """
    raw_value = F.col("value").cast("string")
    as_map = F.from_json(raw_value, MapType(StringType(), StringType()))
    e = F.from_json(raw_value, ENVELOPE_SCHEMA)

    parsed = raw.select(
        raw_value.alias("raw_value"),
        as_map.alias("_as_map"),
        e.alias("e"),
        F.col("topic").alias("kafka_topic"),
        F.col("partition").alias("kafka_partition"),
        F.col("offset").alias("kafka_offset"),
        F.col("timestamp").alias("kafka_timestamp"),
    ).withColumn("occurred_at", F.try_to_timestamp(F.col("e.occurredAt")))

    p = F.col("e.payload")
    error = (
        F.when(F.col("_as_map").isNull(), "malformed_json")
        .when(F.col("e.eventId").isNull(), "missing_event_id")
        .when(~F.col("e.eventId").rlike(UUID_PATTERN), "invalid_event_id")
        .when(
            ~F.coalesce(F.col("e.eventType").isin(KNOWN_EVENT_TYPES), F.lit(False)),
            "unknown_event_type",
        )
        .when(
            F.coalesce(F.col("e.schemaVersion"), F.lit(-1)) != SUPPORTED_SCHEMA_VERSION,
            "unsupported_schema_version",
        )
        .when(F.col("occurred_at").isNull(), "invalid_occurred_at")
        .when(p.isNull(), "missing_payload")
        .when(F.col("e.eventType") == ORDER_CREATED, _order_created_error(p))
        .when(F.col("e.eventType") == ORDER_STATUS_CHANGED, _status_changed_error(p))
        .when(F.col("e.eventType") == STOCK_CHANGED, _stock_changed_error(p))
    )
    return parsed.withColumn("error_reason", error).drop("_as_map")


def valid_events(parsed: DataFrame) -> DataFrame:
    """Typed valid events. Not yet deduplicated."""
    return parsed.filter(F.col("error_reason").isNull()).select(
        F.lower(F.col("e.eventId")).alias("event_id"),
        F.col("e.eventType").alias("event_type"),
        F.col("e.schemaVersion").alias("schema_version"),
        F.col("e.aggregateId").alias("aggregate_id"),
        F.col("occurred_at"),
        F.to_date(F.col("occurred_at")).alias("event_date"),
        F.col("e.payload").alias("payload"),
        "kafka_topic",
        "kafka_partition",
        "kafka_offset",
    )


def invalid_records(parsed: DataFrame) -> DataFrame:
    """Records that failed validation, kept verbatim for inspection and replay."""
    return parsed.filter(F.col("error_reason").isNotNull()).select(
        "raw_value",
        "error_reason",
        "kafka_topic",
        "kafka_partition",
        "kafka_offset",
        "kafka_timestamp",
        F.current_timestamp().alias("quarantined_at"),
    )
