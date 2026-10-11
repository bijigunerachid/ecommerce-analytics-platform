import { KafkaJS } from '@confluentinc/kafka-javascript';
import { TOPIC_PARTITIONS, allTopics } from '../events/topics.js';

const { Kafka, logLevel } = KafkaJS;

/**
 * @param {{ brokers: string[], clientId: string, quiet?: boolean }} options
 *   quiet suppresses client logging (used in tests that deliberately target a dead broker).
 */
export function createKafka({ brokers, clientId, quiet = false }) {
  return new Kafka({
    // Docker publishes Kafka on 127.0.0.1 only. On Windows "localhost" resolves to IPv6 (::1)
    // first, which librdkafka would keep retrying, so restrict lookups to IPv4.
    'broker.address.family': 'v4',
    kafkaJS: { brokers, clientId, logLevel: quiet ? logLevel.NOTHING : logLevel.WARN },
  });
}

/**
 * Producer tuned for reliable delivery:
 * - acks=all: a write counts only once every in-sync replica has it
 * - idempotent: broker-side deduplication of producer retries, and per-partition ordering
 * - message.timeout.ms bounds how long a send may wait before failing (e.g. broker down)
 */
export function createProducer(kafka, { messageTimeoutMs = 15000 } = {}) {
  return kafka.producer({
    'message.timeout.ms': messageTimeoutMs,
    'linger.ms': 5,
    kafkaJS: { acks: -1, idempotent: true },
  });
}

/** Creates the platform topics if they do not exist yet. Safe to call repeatedly. */
export async function ensureTopics(kafka, prefix) {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const existing = new Set(await admin.listTopics());
    const missing = allTopics(prefix).filter((t) => !existing.has(t));
    if (missing.length) {
      try {
        await admin.createTopics({
          topics: missing.map((topic) => ({ topic, numPartitions: TOPIC_PARTITIONS })),
        });
      } catch (err) {
        // Topic metadata propagates asynchronously, so a topic created moments ago may be
        // missing from listTopics(); creating it again is harmless.
        if (!/already exists/i.test(err.message)) throw err;
      }
    }
    return missing;
  } finally {
    await admin.disconnect();
  }
}
