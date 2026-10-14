# Analytics pipeline (Spark)

The `analytics/` project turns the business events in Kafka into analytical data:

```
Kafka (ecommerce.orders, ecommerce.inventory)
   │
   ▼
Spark Structured Streaming  (spark-streaming container, micro-batch every 5 s)
   │  parse JSON → validate → deduplicate by eventId
   ├──► Parquet history      /data/history/events/batch_id=N/event_date=YYYY-MM-DD/
   ├──► Parquet quarantine   /data/history/quarantine/batch_id=N/   (malformed events)
   └──► PostgreSQL           analytics_* tables (dashboard-ready aggregates, anomalies)
                             pipeline_heartbeats (job health, Kafka lag)
```

A batch job (`spark-rebuild`) recomputes every aggregate from the Parquet history.

## Running it

```powershell
docker compose up -d postgres kafka spark-streaming   # Spark UI: http://localhost:4040
docker compose logs -f spark-streaming                # one log line per micro-batch
```

The first start builds the image (about 1 GB, a few minutes). The streaming job reads both
topics from the earliest offset, so it also processes events published before it started.

Rebuild all aggregates from history (stop the stream first so both don't write at once):

```powershell
docker compose stop spark-streaming
docker compose run --rm spark-rebuild
docker compose start spark-streaming
```

Run the analytics tests (uses the test database; apply migrations first with
`npm run migrate:test` in `backend/`):

```powershell
docker compose run --rm analytics-tests
```

## Validation

Each Kafka record is parsed against the event envelope in [events.md](events.md). Records that
fail are written to the quarantine with the raw value, the Kafka position, and one of these
reasons:

| Reason | Meaning |
| --- | --- |
| `malformed_json` | Not a JSON object |
| `missing_event_id`, `invalid_event_id` | `eventId` absent or not a UUID |
| `unknown_event_type` | Not one of the three event types |
| `unsupported_schema_version` | `schemaVersion` is not 1 |
| `invalid_occurred_at` | Timestamp missing or unparseable |
| `missing_payload` | No payload |
| `missing_order_fields`, `invalid_amount`, `missing_items`, `invalid_item` | Order events with missing or malformed fields |
| `total_mismatch` | `totalAmount` differs from the sum of the line totals |
| `invalid_status` | Status not in the order lifecycle |
| `missing_product`, `invalid_quantity`, `invalid_stock_level`, `invalid_reason` | Stock events with missing or malformed fields |

Spark 4 runs in ANSI mode, where a failed cast raises an error. All conversions use `try_*`
functions, so a malformed event becomes a quarantined row and never stops the stream.

## Exactly-once aggregates

Kafka delivery is at-least-once (the relay may resend after a crash) and Spark may replay a
micro-batch after a failure. The aggregates are still exact, because each micro-batch is applied
in **one PostgreSQL transaction** that:

1. Claims `(job, batch_id)` in `analytics_stream_batches`. A replayed batch finds it and is
   skipped.
2. Inserts every event id into `analytics_processed_events` with `ON CONFLICT DO NOTHING`, and
   aggregates **only the ids that were actually inserted**. A redelivered event is counted once,
   however late it arrives.
3. Upserts the aggregate deltas computed by Spark, runs anomaly detection, and records the batch
   statistics.

If any step fails, the transaction rolls back and nothing from that batch is applied. Spark then
retries the batch.

Parquet output is idempotent too: each batch writes to its own `batch_id=N` directory in
overwrite mode, so a replay replaces its files instead of appending duplicates. Readers of the
history (including the rebuild job) deduplicate by `event_id`.

Spark's watermark-based deduplication is deliberately not used: it drops events older than the
watermark, which would silently lose late or backfilled data.

## Recovery

| Failure | Behavior |
| --- | --- |
| Spark container stops or crashes | Restarts (`restart: unless-stopped`) and resumes from the offsets in its checkpoint (`/data/checkpoints`). A batch interrupted mid-way is replayed and deduplicated as described above. *Verified: stopped the job, produced new events, restarted; only the new events were applied.* |
| A micro-batch fails (e.g. PostgreSQL error) | The transaction rolls back, so nothing from the batch is applied; the exception stops the query, the container restarts, and the batch is replayed. *The rollback and replay are covered by tests; a live PostgreSQL outage has not been exercised yet.* |
| Kafka unavailable | No new events reach Spark; they wait in the PostgreSQL outbox (see [events.md](events.md)) and are processed once Kafka is back. *A Kafka outage while Spark is running has not been exercised yet.* |
| Aggregates lost or a bug fixed in an aggregation | Run `spark-rebuild` to recompute everything from the Parquet history. |
| Topics deleted or recreated (development) | `failOnDataLoss=false`: the job logs a warning and continues from the available offsets. |

## Aggregate tables

All are created by the backend migration `1760300000000_analytics-tables.sql`. Times are UTC.

| Table | Grain | Contents |
| --- | --- | --- |
| `analytics_sales_hourly` | hour | orders, gross revenue, items sold, cancelled orders/revenue. Net revenue = `gross_revenue - cancelled_revenue`. Cancellations count in the hour the order was **placed**, using `orderCreatedAt` from the status event. |
| `analytics_product_daily` | day × product | units sold, revenue, orders (at order time) |
| `analytics_inventory_daily` | day × product | units in, units out, movements, stock level after the day's last movement |
| `analytics_order_status` | status | current number of orders in each status |
| `analytics_customers` | customer | first/last order time, order count, revenue (net of cancellations) |
| `analytics_anomalies` | event | detected anomalies with type, severity, entity, and details |
| `analytics_stream_batches` | micro-batch | records in, valid, invalid, duplicates, applied |
| `analytics_processed_events` | event | every applied event id (exactly-once bookkeeping) |

## Anomaly detection

Simple, explainable rules run on each batch's newly applied events. Detection is idempotent:
anomalies are unique on `(type, entity, time)`.

| Type | Rule | Severity |
| --- | --- | --- |
| `high_value_order` | Order total above 3× the 99th percentile of order totals in the last 30 days. Needs at least 200 orders of history. | high at 10× or more, otherwise medium |
| `order_velocity` | A customer places 5 or more orders within one 10-minute window | high at 10 or more |
| `revenue_spike` | A day's gross revenue is more than 3 standard deviations above the mean of the previous 14 days, and at least 1.5× that mean. Needs at least 7 days with sales. | high at z ≥ 5, otherwise medium |
| `large_stock_reduction` | A manual adjustment removes at least 50% of a product's stock, or 100 units or more | high at 80% or more |

### Why these thresholds

The first version used z-scores (mean + 3 standard deviations) for order values and hourly revenue.
On 90 days of generated data (5,733 orders) it raised **122 alerts**, almost all false:

- Order values are heavily skewed (€25 accessories next to €1,299 laptops), so the standard
  deviation says little about what is unusual, and any multi-laptop order looked like an outlier.
  A percentile threshold does not assume a bell curve. On the same data, 3× the 99th percentile
  flags exactly one order: the planted €32,475 order.
- Single hours are too noisy: one laptop sold at 3 a.m. "spikes" its hour. Daily totals are
  stable enough for a z-score.
- A percentile needs enough data. With 61 orders, a single €5,000 order moved the 99th
  percentile from 59 to 2,035 and hid itself, hence the 200-order minimum.

With the current rules the same history produces **7 alerts**: the three planted anomalies, the
revenue spike on the day of the planted order, and three medium spikes on unusually busy days.

## Health and lag

The job writes a `spark-streaming` row to `pipeline_heartbeats` on every progress report, and
when idle (about every 10 s). `GET /api/pipeline/health` shows it next to the outbox relay, with:

- `kafkaLag`: messages in Kafka not processed yet (latest offset minus processed offset, summed
  over partitions; 0 when idle)
- totals since start: `eventsTotal`, `eventsApplied`, `eventsInvalid`, `eventsDuplicate`,
  `anomalies`
- `lastBatchId`, `lastBatchStatus`, `lastBatchSeconds`, input and processing rates

## Performance notes

Micro-batches here are small, so fixed per-job overhead dominates. Measured on the streaming
handler with a warm JVM:

| Setting | Time per batch |
| --- | --- |
| Spark defaults (AQE on, 200 → 4 shuffle partitions) | ~8.3 s |
| AQE off, shuffle partitions = cores | ~5.5 s |

The cost is per batch, not per event: a batch of 20,000 events (`maxOffsetsPerTrigger`) costs
about the same. Expect dashboards to reflect new orders within roughly 10 seconds.

## Known limitations

- Product performance is gross (at order time). Cancellations reduce hourly and customer revenue
  but not per-product figures, because `order.status_changed` does not carry line items.
- The exactly-once bookkeeping collects each batch's event ids to the driver. That is fine at
  this project's scale; a much larger deployment would partition that step.
- Velocity windows are fixed 10-minute buckets, so a burst that straddles a bucket boundary may
  go undetected.
- Image security: the Dockerfile applies pending Ubuntu security updates (65 were missing from the
  upstream image when this was checked) and upgrades pip, setuptools, and wheel; `pip-audit`
  reports no known vulnerabilities in the Python packages. Vulnerability scanners still report
  issues in libraries bundled with Apache Spark itself (Java JARs), which only a newer Spark
  release can fix. The container is reachable only from localhost (Spark UI on 127.0.0.1:4040).
