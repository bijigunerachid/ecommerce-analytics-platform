import json

from conftest import query
from ecommerce_analytics.heartbeat import COMPONENT, kafka_lag, write_heartbeat


def test_kafka_lag_sums_unprocessed_messages_across_partitions():
    progress = {
        "sources": [
            {
                "endOffset": {"e.orders": {"0": 10, "1": 7}, "e.inventory": {"0": 3}},
                "latestOffset": {"e.orders": {"0": 15, "1": 7}, "e.inventory": {"0": 5}},
            }
        ]
    }
    assert kafka_lag(progress) == 7  # 5 + 0 + 2


def test_kafka_lag_accepts_json_strings_and_new_partitions():
    progress = {
        "sources": [
            {
                "endOffset": json.dumps({"t": {"0": 4}}),
                "latestOffset": json.dumps({"t": {"0": 4, "1": 3}}),  # partition 1 not read yet
            }
        ]
    }
    assert kafka_lag(progress) == 3


def test_kafka_lag_falls_back_to_spark_metric_and_handles_missing_data():
    assert kafka_lag({"sources": [{"metrics": {"maxOffsetsBehindLatest": "12"}}]}) == 12
    assert kafka_lag({"sources": [{"metrics": {}}]}) is None
    assert kafka_lag({}) is None


def test_heartbeat_upserts_one_row_per_component(settings, conn):
    write_heartbeat(settings.pg_conninfo(), {"status": "ok", "eventsApplied": 3})
    write_heartbeat(settings.pg_conninfo(), {"status": "ok", "eventsApplied": 5})
    rows = query(conn, "SELECT component, details FROM pipeline_heartbeats")
    assert rows == [(COMPONENT, {"status": "ok", "eventsApplied": 5})]


def test_heartbeat_failures_never_raise():
    write_heartbeat({"host": "127.0.0.1", "port": 1, "user": "x", "dbname": "x"}, {"status": "ok"})
