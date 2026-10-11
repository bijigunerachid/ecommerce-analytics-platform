// Outbox relay worker: publishes committed business events from PostgreSQL to Kafka.
// Run with `npm run relay` (from backend/). Runs until stopped with Ctrl+C.
import { getDatabaseConfig } from '../config/database.js';
import { getKafkaConfig } from '../config/kafka.js';
import { createPool } from '../db/pool.js';
import { createKafka, createProducer, ensureTopics } from '../kafka/client.js';
import { createOutboxRelay, startRelayLoop } from '../outbox/outbox-relay.js';
import { createPipelineRepository } from '../repositories/pipeline.repository.js';

const RETRY_CONNECT_MS = 5000;

async function connectWithRetry(label, connect) {
  for (;;) {
    try {
      return await connect();
    } catch (err) {
      console.error(`${label} not reachable (${err.message}); retrying in ${RETRY_CONNECT_MS} ms`);
      await new Promise((r) => setTimeout(r, RETRY_CONNECT_MS));
    }
  }
}

async function main() {
  const kafkaConfig = getKafkaConfig();
  const db = createPool(getDatabaseConfig());
  const kafka = createKafka(kafkaConfig);
  const producer = createProducer(kafka);

  await connectWithRetry('Kafka', async () => {
    const created = await ensureTopics(kafka, kafkaConfig.topicPrefix);
    if (created.length) console.log(`Created topics: ${created.join(', ')}`);
    await producer.connect();
  });

  const relay = createOutboxRelay({
    db,
    producer,
    topicPrefix: kafkaConfig.topicPrefix,
    batchSize: kafkaConfig.batchSize,
  });
  const loop = startRelayLoop({
    relay,
    pipelineRepository: createPipelineRepository(db),
    pollIntervalMs: kafkaConfig.pollIntervalMs,
  });
  console.log(
    `Outbox relay running: brokers=${kafkaConfig.brokers.join(',')} prefix=${kafkaConfig.topicPrefix}`,
  );

  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received, finishing current batch...`);
    setTimeout(() => process.exit(1), 20000).unref();
    await loop.stop();
    await producer.disconnect();
    await db.end();
    console.log(`Stopped. Published ${loop.stats.publishedTotal} events this run.`);
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(`Outbox relay failed to start: ${err.message}`);
  process.exit(1);
});
