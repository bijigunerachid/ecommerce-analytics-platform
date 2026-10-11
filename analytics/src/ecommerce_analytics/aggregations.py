"""Aggregations computed by Spark from validated events.

Each function takes a DataFrame of valid events (see validation.valid_events) and returns a
small DataFrame of *deltas*: amounts to add to the matching rows of the PostgreSQL aggregate
tables. Applying deltas (rather than overwriting) lets every micro-batch contribute only its own
events, and the events table guarantees each event is applied once.
"""

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from .schemas import ORDER_CREATED, ORDER_STATUS_CHANGED, STOCK_CHANGED
from .validation import MONEY_TYPE, money


def zero_money():
    # A function, not a constant: building a Column needs an active SparkContext.
    return F.lit(0).cast(MONEY_TYPE)


def orders(events: DataFrame) -> DataFrame:
    """One row per order.created event with typed fields."""
    p = F.col("payload")
    return events.filter(F.col("event_type") == ORDER_CREATED).select(
        "event_id",
        "occurred_at",
        p["orderId"].alias("order_id"),
        p["customerId"].alias("customer_id"),
        money(p["totalAmount"]).alias("total"),
        F.aggregate(p["items"], F.lit(0), lambda acc, i: acc + i["quantity"]).alias("items"),
        p["items"].alias("line_items"),
    )


def cancellations(events: DataFrame) -> DataFrame:
    """Orders cancelled, attributed to the time the order was originally placed."""
    p = F.col("payload")
    return events.filter(
        (F.col("event_type") == ORDER_STATUS_CHANGED) & (p["toStatus"] == "cancelled")
    ).select(
        "event_id",
        F.coalesce(F.try_to_timestamp(p["orderCreatedAt"]), F.col("occurred_at")).alias(
            "order_time"
        ),
        F.col("occurred_at"),
        p["orderId"].alias("order_id"),
        p["customerId"].alias("customer_id"),
        money(p["totalAmount"]).alias("total"),
    )


def stock_changes(events: DataFrame) -> DataFrame:
    p = F.col("payload")
    return events.filter(F.col("event_type") == STOCK_CHANGED).select(
        "event_id",
        "occurred_at",
        p["movementId"].alias("movement_id"),
        p["productId"].alias("product_id"),
        p["quantityChange"].alias("quantity_change"),
        p["stockAfter"].alias("stock_after"),
        p["reason"].alias("reason"),
    )


def sales_hourly(events: DataFrame) -> DataFrame:
    """Deltas for analytics_sales_hourly, keyed by bucket_start (UTC hour)."""
    placed = orders(events).select(
        F.date_trunc("hour", "occurred_at").alias("bucket_start"),
        F.lit(1).alias("orders_count"),
        F.col("total").alias("gross_revenue"),
        (F.col("total") * F.col("total")).cast("decimal(24,4)").alias("order_total_sq_sum"),
        F.col("items").alias("items_sold"),
        F.lit(0).alias("cancelled_orders"),
        zero_money().alias("cancelled_revenue"),
    )
    cancelled = cancellations(events).select(
        F.date_trunc("hour", "order_time").alias("bucket_start"),
        F.lit(0).alias("orders_count"),
        zero_money().alias("gross_revenue"),
        F.lit(0).cast("decimal(24,4)").alias("order_total_sq_sum"),
        F.lit(0).alias("items_sold"),
        F.lit(1).alias("cancelled_orders"),
        F.col("total").alias("cancelled_revenue"),
    )
    return (
        placed.unionByName(cancelled)
        .groupBy("bucket_start")
        .agg(
            F.sum("orders_count").cast("int").alias("orders_count"),
            F.sum("gross_revenue").cast("decimal(14,2)").alias("gross_revenue"),
            F.sum("order_total_sq_sum").cast("decimal(24,4)").alias("order_total_sq_sum"),
            F.sum("items_sold").cast("int").alias("items_sold"),
            F.sum("cancelled_orders").cast("int").alias("cancelled_orders"),
            F.sum("cancelled_revenue").cast("decimal(14,2)").alias("cancelled_revenue"),
        )
    )


def product_daily(events: DataFrame) -> DataFrame:
    """Deltas for analytics_product_daily: units and revenue per product per day."""
    lines = orders(events).select(
        F.to_date("occurred_at").alias("day"), F.explode("line_items").alias("item")
    )
    return lines.groupBy(
        "day",
        F.col("item.productId").alias("product_id"),
    ).agg(
        F.first("item.sku").alias("sku"),
        F.first("item.categoryId").alias("category_id"),
        F.sum("item.quantity").cast("int").alias("units_sold"),
        F.sum(money(F.col("item.lineTotal"))).cast("decimal(14,2)").alias("revenue"),
        F.count(F.lit(1)).cast("int").alias("orders_count"),
    )


def inventory_daily(events: DataFrame) -> DataFrame:
    """Deltas for analytics_inventory_daily, plus the day's latest stock level."""
    changes = stock_changes(events).withColumn("day", F.to_date("occurred_at"))
    latest = F.struct("occurred_at", "movement_id", "stock_after")
    return (
        changes.groupBy("day", "product_id")
        .agg(
            F.sum(F.when(F.col("quantity_change") > 0, F.col("quantity_change")).otherwise(0))
            .cast("int")
            .alias("units_in"),
            F.sum(F.when(F.col("quantity_change") < 0, -F.col("quantity_change")).otherwise(0))
            .cast("int")
            .alias("units_out"),
            F.count(F.lit(1)).cast("int").alias("movements"),
            F.max(latest).alias("latest"),
        )
        .select(
            "day",
            "product_id",
            "units_in",
            "units_out",
            "movements",
            F.col("latest.stock_after").alias("last_stock"),
            F.col("latest.occurred_at").alias("last_stock_at"),
        )
    )


def order_status_deltas(events: DataFrame) -> DataFrame:
    """Change in the number of orders per status."""
    p = F.col("payload")
    created = events.filter(F.col("event_type") == ORDER_CREATED).select(
        p["status"].alias("status"), F.lit(1).alias("delta")
    )
    changed = events.filter(F.col("event_type") == ORDER_STATUS_CHANGED)
    left = changed.select(p["fromStatus"].alias("status"), F.lit(-1).alias("delta"))
    entered = changed.select(p["toStatus"].alias("status"), F.lit(1).alias("delta"))
    return (
        created.unionByName(left)
        .unionByName(entered)
        .groupBy("status")
        .agg(F.sum("delta").cast("int").alias("delta"))
        .filter(F.col("delta") != 0)
    )


def customer_deltas(events: DataFrame) -> DataFrame:
    """Per-customer order count and revenue changes (net of cancellations)."""
    placed = orders(events).select(
        "customer_id",
        F.col("occurred_at").alias("order_time"),
        F.lit(1).alias("orders_count"),
        F.col("total").alias("revenue"),
    )
    cancelled = cancellations(events).select(
        "customer_id",
        F.col("order_time"),
        F.lit(-1).alias("orders_count"),
        (-F.col("total")).alias("revenue"),
    )
    return (
        placed.unionByName(cancelled)
        .groupBy("customer_id")
        .agg(
            F.min("order_time").alias("first_order_at"),
            F.max("order_time").alias("last_order_at"),
            F.sum("orders_count").cast("int").alias("orders_count"),
            F.sum("revenue").cast("decimal(14,2)").alias("revenue"),
        )
    )
