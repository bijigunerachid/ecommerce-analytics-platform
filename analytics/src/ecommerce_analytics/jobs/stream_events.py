"""Streaming job: Kafka → validation → Parquet history + PostgreSQL aggregates.

Run inside the analytics container (see docker-compose.yml):
    spark-submit bin/stream_events.py

Recovery: Spark records consumed Kafka offsets in the checkpoint directory. After a restart
the job resumes from the last committed offsets; a micro-batch interrupted mid-way is replayed
with the same offsets. Replays are harmless:
- Parquet output for a batch is written to its own batch_id=N directory with overwrite mode.
- PostgreSQL skips a batch_id it already committed, and event ids it already processed.
"""

from __future__ import annotations

import json
import logging
import time

import psycopg
from pyspark.sql import DataFrame
from pyspark.sql.streaming import StreamingQueryListener

from ..config import Settings, load_settings
from ..heartbeat import kafka_lag, write_heartbeat
from ..postgres_sink import process_batch
from ..spark import create_spark
from ..validation import invalid_records, parse_events, valid_events

JOB_NAME = "stream-events"
log = logging.getLogger("stream_events")


def make_batch_handler(settings: Settings, stats: dict):
    def handle(batch: DataFrame, batch_id: int) -> None:
        started = time.monotonic()
        parsed = parse_events(batch).cache()
        # Cached: used for the Parquet write, the event claim, and every aggregation.
        valid = valid_events(parsed).dropDuplicates(["event_id"]).cache()
        try:
            total = parsed.count()
            invalid = invalid_records(parsed)

            # Parquet first: overwrite of this batch's directory makes replays idempotent.
            invalid_count = invalid.count()
            if invalid_count:
                invalid.write.mode("overwrite").parquet(
                    f"{settings.quarantine_path}/batch_id={batch_id}"
                )
            valid.write.mode("overwrite").partitionBy("event_date").parquet(
                f"{settings.events_path}/batch_id={batch_id}"
            )

            with psycopg.connect(**settings.pg_conninfo()) as conn:
                result = process_batch(
                    conn,
                    batch.sparkSession,
                    job=JOB_NAME,
                    batch_id=batch_id,
                    events=valid,
                    total=total,
                    invalid=invalid_count,
                )
        finally:
            valid.unpersist()
            parsed.unpersist()

        stats.update(
            lastBatchId=batch_id,
            lastBatchStatus=result.status,
            lastBatchSeconds=round(time.monotonic() - started, 2),
        )
        if result.status == "applied":
            totals = {
                "eventsTotal": result.events_total,
                "eventsApplied": result.events_applied,
                "eventsInvalid": result.events_invalid,
                "eventsDuplicate": result.events_duplicate,
                "anomalies": result.anomalies,
            }
            for key, value in totals.items():
                stats[key] = stats.get(key, 0) + value
        log.info(
            "batch %s %s: total=%s applied=%s invalid=%s duplicate=%s anomalies=%s",
            batch_id,
            result.status,
            result.events_total,
            result.events_applied,
            result.events_invalid,
            result.events_duplicate,
            result.anomalies,
        )

    return handle


class HeartbeatListener(StreamingQueryListener):
    """Writes a heartbeat on every progress report (including idle ones, every ~10 s)."""

    def __init__(self, settings: Settings, stats: dict):
        self.settings = settings
        self.stats = stats

    def _beat(self, status: str, **extra) -> None:
        write_heartbeat(self.settings.pg_conninfo(), {"status": status, **self.stats, **extra})

    def onQueryStarted(self, event) -> None:
        self._beat("ok", startedAt=str(event.timestamp))

    def onQueryProgress(self, event) -> None:
        progress = event.progress
        lag = kafka_lag(json.loads(progress.json))
        self._beat(
            "ok",
            kafkaLag=lag,
            inputRowsPerSecond=round(progress.inputRowsPerSecond or 0, 2),
            processedRowsPerSecond=round(progress.processedRowsPerSecond or 0, 2),
        )

    def onQueryIdle(self, event) -> None:
        # Spark reports idleness (instead of progress) when no new data is available,
        # i.e. the job has consumed everything in Kafka.
        self._beat("ok", kafkaLag=0, inputRowsPerSecond=0, processedRowsPerSecond=0)

    def onQueryTerminated(self, event) -> None:
        self._beat("error" if event.exception else "stopped", lastError=event.exception)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = load_settings()
    spark = create_spark("ecommerce-stream-events")
    spark.sparkContext.setLogLevel("WARN")

    stats: dict = {}
    spark.streams.addListener(HeartbeatListener(settings, stats))

    raw = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", settings.kafka_bootstrap)
        .option("subscribe", ",".join(settings.topics))
        .option("startingOffsets", "earliest")
        .option("maxOffsetsPerTrigger", settings.max_offsets_per_trigger)
        # Topics may be deleted and recreated in development; continue instead of failing.
        .option("failOnDataLoss", "false")
        .load()
    )
    query = (
        raw.writeStream.foreachBatch(make_batch_handler(settings, stats))
        .option("checkpointLocation", settings.checkpoint_path)
        .trigger(processingTime=f"{settings.trigger_seconds} seconds")
        .queryName(JOB_NAME)
        .start()
    )
    log.info("Streaming from %s via %s", settings.topics, settings.kafka_bootstrap)
    query.awaitTermination()


if __name__ == "__main__":
    main()
