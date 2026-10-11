from __future__ import annotations

import json
from datetime import datetime, timezone

import psycopg
import pytest
from pyspark.sql.types import (
    BinaryType,
    IntegerType,
    LongType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

from ecommerce_analytics.config import load_settings
from ecommerce_analytics.spark import create_spark

ANALYTICS_TABLES = [
    "analytics_anomalies",
    "analytics_customers",
    "analytics_inventory_daily",
    "analytics_order_status",
    "analytics_processed_events",
    "analytics_product_daily",
    "analytics_sales_hourly",
    "analytics_stream_batches",
    "pipeline_heartbeats",
]

# Same columns as Spark's Kafka source.
KAFKA_SCHEMA = StructType(
    [
        StructField("key", BinaryType()),
        StructField("value", BinaryType()),
        StructField("topic", StringType()),
        StructField("partition", IntegerType()),
        StructField("offset", LongType()),
        StructField("timestamp", TimestampType()),
    ]
)


@pytest.fixture(scope="session")
def spark():
    session = create_spark("analytics-tests", "local[1]")
    session.sparkContext.setLogLevel("ERROR")
    yield session
    session.stop()


@pytest.fixture(scope="session")
def settings(tmp_path_factory):
    from dataclasses import replace

    return replace(load_settings(test=True), data_dir=str(tmp_path_factory.mktemp("data")))


@pytest.fixture
def conn(settings):
    """Connection to the test database, with analytics tables emptied before each test.

    The schema comes from the backend migrations: run `npm run migrate:test` in backend/ first.
    """
    with psycopg.connect(**settings.pg_conninfo(), autocommit=True) as connection:
        connection.execute(f"TRUNCATE {', '.join(ANALYTICS_TABLES)} RESTART IDENTITY")
        yield connection


_offsets = iter(range(10**9))


@pytest.fixture
def kafka_batch(spark):
    """Builds a DataFrame shaped like a Kafka micro-batch from events (dicts) or raw strings."""

    def build(records: list) -> object:
        rows = []
        for record in records:
            value = record if isinstance(record, str) else json.dumps(record)
            topic = (
                "ecommerce.inventory"
                if isinstance(record, dict) and record.get("aggregateType") == "product"
                else "ecommerce.orders"
            )
            rows.append(
                (
                    None,
                    value.encode(),
                    topic,
                    0,
                    next(_offsets),
                    datetime.now(timezone.utc),
                )
            )
        return spark.createDataFrame(rows, KAFKA_SCHEMA)

    return build


def query(conn, sql: str, params=None) -> list[tuple]:
    return conn.execute(sql, params).fetchall()
