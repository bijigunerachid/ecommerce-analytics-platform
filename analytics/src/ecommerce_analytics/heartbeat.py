"""Reports streaming job liveness and progress to pipeline_heartbeats (shown by
GET /api/pipeline/health)."""

from __future__ import annotations

import json
import logging

import psycopg

log = logging.getLogger(__name__)

COMPONENT = "spark-streaming"


def write_heartbeat(conninfo: dict, details: dict) -> None:
    try:
        with psycopg.connect(**conninfo, connect_timeout=5) as conn:
            conn.execute(
                """INSERT INTO pipeline_heartbeats (component, last_seen_at, details)
                   VALUES (%s, now(), %s)
                   ON CONFLICT (component) DO UPDATE
                     SET last_seen_at = EXCLUDED.last_seen_at, details = EXCLUDED.details""",
                (COMPONENT, json.dumps(details, default=str)),
            )
    except Exception as exc:  # health reporting must never stop the stream
        log.warning("Heartbeat failed: %s", exc)


def _as_offsets(value) -> dict:
    """Kafka source offsets as {topic: {partition: offset}}; Spark reports them as a dict or a
    JSON string."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return {}
    return value if isinstance(value, dict) else {}


def kafka_lag(progress: dict) -> int | None:
    """Consumer lag: messages in Kafka not yet processed, summed over all partitions.

    Computed as latestOffset - endOffset per partition from the progress report. Falls back to
    Spark's maxOffsetsBehindLatest metric. None if neither is available yet.
    """
    total = None
    for source in progress.get("sources", []):
        latest = _as_offsets(source.get("latestOffset"))
        processed = _as_offsets(source.get("endOffset"))
        if latest:
            for topic, partitions in latest.items():
                for partition, offset in partitions.items():
                    done = processed.get(topic, {}).get(partition, 0)
                    total = (total or 0) + max(int(offset) - int(done), 0)
        elif (value := (source.get("metrics") or {}).get("maxOffsetsBehindLatest")) is not None:
            total = (total or 0) + int(float(value))
    return total
