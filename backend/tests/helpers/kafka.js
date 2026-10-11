import { randomUUID } from 'node:crypto';
import { allTopics } from '../../src/events/topics.js';
import { createKafka, createProducer, ensureTopics } from '../../src/kafka/client.js';

export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');

/**
 * Isolated Kafka setup for one test file: a unique topic prefix (so runs never see each
 * other's messages), a connected producer, and helpers to read topics back.
 */
export async function createKafkaTestContext() {
  const topicPrefix = `test-${randomUUID().slice(0, 8)}`;
  const kafka = createKafka({ brokers: KAFKA_BROKERS, clientId: 'tests' });
  await ensureTopics(kafka, topicPrefix);
  const producer = createProducer(kafka, { messageTimeoutMs: 5000 });
  await producer.connect();

  return {
    kafka,
    producer,
    topicPrefix,
    topic: (name) => `${topicPrefix}.${name}`,

    /**
     * Reads a topic from the beginning until `count` messages arrived (or times out).
     * Returns messages with decoded key, headers, and parsed JSON value.
     */
    async consume(topic, count, { timeoutMs = 15000 } = {}) {
      const consumer = kafka.consumer({
        kafkaJS: { groupId: `test-${randomUUID()}`, fromBeginning: true },
      });
      const messages = [];
      await consumer.connect();
      try {
        await consumer.subscribe({ topics: [topic] });
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Timed out: got ${messages.length}/${count} messages`)),
            timeoutMs,
          );
          consumer.run({
            eachMessage: async ({ partition, message }) => {
              messages.push({
                partition,
                key: message.key?.toString(),
                headers: Object.fromEntries(
                  Object.entries(message.headers ?? {}).map(([k, v]) => [k, v?.toString()]),
                ),
                timestamp: message.timestamp,
                value: JSON.parse(message.value.toString()),
              });
              if (messages.length >= count) {
                clearTimeout(timer);
                resolve();
              }
            },
          });
        });
      } finally {
        await consumer.disconnect();
      }
      return messages;
    },

    async close() {
      await producer.disconnect();
      const admin = kafka.admin();
      await admin.connect();
      try {
        await admin.deleteTopics({ topics: allTopics(topicPrefix) });
      } finally {
        await admin.disconnect();
      }
    },
  };
}
