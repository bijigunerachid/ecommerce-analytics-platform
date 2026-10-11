// Kafka settings for the outbox relay. Kept separate from loadConfig() so the relay worker does
// not need API-only settings such as JWT_SECRET, and the API does not need Kafka at all.

export function getKafkaConfig() {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  const topicPrefix = process.env.KAFKA_TOPIC_PREFIX || 'ecommerce';
  if (!/^[A-Za-z0-9._-]+$/.test(topicPrefix)) {
    throw new Error('KAFKA_TOPIC_PREFIX may contain only letters, digits, ".", "_" and "-"');
  }
  return {
    brokers,
    topicPrefix,
    clientId: process.env.KAFKA_CLIENT_ID || 'ecommerce-outbox-relay',
    batchSize: Number(process.env.OUTBOX_BATCH_SIZE) || 100,
    pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS) || 500,
  };
}
