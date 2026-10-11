import { withTransaction } from '../db/transaction.js';
import { topicFor } from '../events/topics.js';

// Only one relay publishes at a time (others wait as hot standbys). This keeps events in strict
// outbox order; with several concurrent publishers, batches could reach Kafka out of order.
const RELAY_LOCK_KEY = 'outbox-relay';

export const HEARTBEAT_COMPONENT = 'outbox-relay';

/** Kafka message for one outbox row. The value is a self-describing JSON envelope. */
export function toKafkaMessage(row) {
  const envelope = {
    eventId: row.event_id,
    eventType: row.event_type,
    schemaVersion: row.payload?.schemaVersion ?? 1,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    occurredAt: row.occurred_at.toISOString(),
    payload: row.payload,
  };
  return {
    key: row.aggregate_id,
    value: JSON.stringify(envelope),
    timestamp: String(row.occurred_at.getTime()),
    headers: {
      event_id: row.event_id,
      event_type: row.event_type,
      schema_version: String(envelope.schemaVersion),
    },
  };
}

/** Groups rows by topic, preserving outbox order within each topic. */
function toTopicMessages(rows, topicPrefix) {
  const byTopic = new Map();
  for (const row of rows) {
    const topic = topicFor(topicPrefix, row.aggregate_type);
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(toKafkaMessage(row));
  }
  return [...byTopic].map(([topic, messages]) => ({ topic, messages }));
}

/**
 * Transactional outbox relay: moves committed events from event_outbox to Kafka.
 *
 * Delivery is at-least-once. Rows are marked published only after Kafka acknowledges the whole
 * batch; if the process dies between the acknowledgement and the commit, the batch is sent
 * again on restart. Consumers deduplicate on eventId.
 */
export function createOutboxRelay({ db, producer, topicPrefix, batchSize = 100 }) {
  return {
    /**
     * Publishes at most one batch.
     * @returns {Promise<{ published: number, skipped?: boolean }>} skipped means another relay
     *   holds the lock. Throws if Kafka rejects the batch (after recording the failure).
     */
    async publishBatch() {
      let failure = null;
      const result = await withTransaction(db, async (client) => {
        const { rows: lock } = await client.query(
          'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired',
          [RELAY_LOCK_KEY],
        );
        if (!lock[0].acquired) return { published: 0, skipped: true };

        const { rows } = await client.query(
          `SELECT event_id, event_type, aggregate_type, aggregate_id, payload, occurred_at
           FROM event_outbox
           WHERE published_at IS NULL
           ORDER BY seq
           LIMIT $1`,
          [batchSize],
        );
        if (rows.length === 0) return { published: 0 };

        const ids = rows.map((r) => r.event_id);
        try {
          await producer.sendBatch({ topicMessages: toTopicMessages(rows, topicPrefix) });
        } catch (err) {
          // Record the failure (committed below) so it shows up in pipeline health.
          failure = err;
          await client.query(
            `UPDATE event_outbox SET attempts = attempts + 1, last_error = $2
             WHERE event_id = ANY($1::uuid[])`,
            [ids, String(err.message ?? err).slice(0, 1000)],
          );
          return { published: 0 };
        }

        await client.query(
          `UPDATE event_outbox
           SET published_at = now(), attempts = attempts + 1, last_error = NULL
           WHERE event_id = ANY($1::uuid[])`,
          [ids],
        );
        return { published: rows.length };
      });

      if (failure) throw failure;
      return result;
    },
  };
}

/**
 * Runs the relay continuously: publishes back-to-back while there is a backlog, polls when idle,
 * backs off exponentially while Kafka is failing, and reports a heartbeat for health checks.
 */
export function startRelayLoop({
  relay,
  pipelineRepository,
  pollIntervalMs = 500,
  maxBackoffMs = 30000,
  heartbeatIntervalMs = 5000,
  log = console,
}) {
  let running = true;
  let wake = null;
  const stats = {
    status: 'starting',
    publishedTotal: 0,
    consecutiveFailures: 0,
    lastError: null,
    lastPublishedAt: null,
  };
  let lastHeartbeat = 0;

  const sleep = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  async function heartbeat(force = false) {
    if (!force && Date.now() - lastHeartbeat < heartbeatIntervalMs) return;
    lastHeartbeat = Date.now();
    try {
      await pipelineRepository.heartbeat(HEARTBEAT_COMPONENT, { ...stats });
    } catch (err) {
      log.error(`Heartbeat failed: ${err.message}`);
    }
  }

  const done = (async () => {
    while (running) {
      let delay = pollIntervalMs;
      try {
        const { published, skipped } = await relay.publishBatch();
        if (skipped) {
          stats.status = 'standby';
        } else {
          if (stats.consecutiveFailures > 0) log.info('Kafka publishing recovered');
          stats.status = 'ok';
          stats.consecutiveFailures = 0;
          stats.lastError = null;
          if (published > 0) {
            stats.publishedTotal += published;
            stats.lastPublishedAt = new Date().toISOString();
            delay = 0; // more may be waiting
          }
        }
      } catch (err) {
        stats.status = 'error';
        stats.consecutiveFailures += 1;
        stats.lastError = String(err.message ?? err);
        delay = Math.min(pollIntervalMs * 2 ** stats.consecutiveFailures, maxBackoffMs);
        log.error(
          `Publishing failed (attempt ${stats.consecutiveFailures}), retrying in ${delay} ms: ${stats.lastError}`,
        );
      }
      await heartbeat(stats.status === 'error');
      if (running && delay > 0) await sleep(delay);
    }
    stats.status = 'stopped';
    await heartbeat(true);
  })();

  return {
    stats,
    /** Stops after the current batch finishes. */
    async stop() {
      running = false;
      wake?.();
      await done;
    },
  };
}
