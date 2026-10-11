import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createOutboxRelay,
  startRelayLoop,
  toKafkaMessage,
} from '../../src/outbox/outbox-relay.js';
import { createOutboxRepository } from '../../src/repositories/outbox.repository.js';
import { createPipelineRepository } from '../../src/repositories/pipeline.repository.js';
import { createKafkaTestContext } from '../helpers/kafka.js';
import { createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
let kafka;
let admin;
let relay;

beforeAll(async () => {
  kafka = await createKafkaTestContext();
});
afterAll(async () => {
  await kafka?.close();
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'admin@example.test', role: 'admin' });
  admin = await ctx.loginAs('admin@example.test');
  relay = createOutboxRelay({
    db: ctx.db,
    producer: kafka.producer,
    topicPrefix: kafka.topicPrefix,
  });
});

async function placeOrder() {
  const customer = await ctx.seedCustomer({ email: `c-${randomUUID()}@example.test` });
  const a = await ctx.seedProduct({ sku: `A-${randomUUID().slice(0, 6)}`, price: '10.00' });
  const b = await ctx.seedProduct({ sku: `B-${randomUUID().slice(0, 6)}`, price: '2.50' });
  const res = await admin
    .post('/api/orders')
    .set('Idempotency-Key', randomUUID())
    .send({
      customerId: customer.id,
      items: [
        { productId: a.id, quantity: 1 },
        { productId: b.id, quantity: 2 },
      ],
    });
  expect(res.status).toBe(201);
  return { order: res.body.order, products: [a, b] };
}

async function pendingCount() {
  const { rows } = await ctx.db.query(
    'SELECT count(*)::int AS n FROM event_outbox WHERE published_at IS NULL',
  );
  return rows[0].n;
}

/** Inserts n synthetic events for one aggregate, in order. */
async function insertEvents(aggregateId, n) {
  const outbox = createOutboxRepository();
  for (let i = 1; i <= n; i++) {
    await outbox.add(ctx.db, {
      eventType: 'order.status_changed',
      aggregateType: 'order',
      aggregateId,
      payload: { schemaVersion: 1, sequence: i },
    });
  }
}

describe('toKafkaMessage', () => {
  it('builds a keyed message with a JSON envelope and identifying headers', () => {
    const occurredAt = new Date('2026-01-02T03:04:05.000Z');
    const msg = toKafkaMessage({
      event_id: '11111111-1111-1111-1111-111111111111',
      event_type: 'order.created',
      aggregate_type: 'order',
      aggregate_id: '42',
      payload: { schemaVersion: 1, orderId: 42 },
      occurred_at: occurredAt,
    });
    expect(msg.key).toBe('42');
    expect(msg.timestamp).toBe(String(occurredAt.getTime()));
    expect(msg.headers).toEqual({
      event_id: '11111111-1111-1111-1111-111111111111',
      event_type: 'order.created',
      schema_version: '1',
    });
    expect(JSON.parse(msg.value)).toEqual({
      eventId: '11111111-1111-1111-1111-111111111111',
      eventType: 'order.created',
      schemaVersion: 1,
      aggregateType: 'order',
      aggregateId: '42',
      occurredAt: '2026-01-02T03:04:05.000Z',
      payload: { schemaVersion: 1, orderId: 42 },
    });
  });
});

describe('publishing to Kafka', () => {
  it('publishes order and inventory events to their topics and marks them published', async () => {
    const { order, products } = await placeOrder();
    expect(await pendingCount()).toBe(3); // order.created + 2 inventory.stock_changed

    expect(await relay.publishBatch()).toEqual({ published: 3 });
    expect(await pendingCount()).toBe(0);

    const [orderMsg] = await kafka.consume(kafka.topic('orders'), 1);
    expect(orderMsg.key).toBe(String(order.id));
    expect(orderMsg.headers.event_type).toBe('order.created');
    expect(orderMsg.value).toMatchObject({
      eventType: 'order.created',
      aggregateId: String(order.id),
      payload: { orderId: order.id, totalAmount: '15.00' },
    });
    expect(orderMsg.headers.event_id).toBe(orderMsg.value.eventId);

    const stockMsgs = await kafka.consume(kafka.topic('inventory'), 2);
    expect(stockMsgs.map((m) => m.key).sort()).toEqual(products.map((p) => String(p.id)).sort());
    expect(stockMsgs.every((m) => m.value.eventType === 'inventory.stock_changed')).toBe(true);
  });

  it('does not publish an event twice', async () => {
    await placeOrder();
    expect((await relay.publishBatch()).published).toBe(3);
    expect(await relay.publishBatch()).toEqual({ published: 0 });
  });

  it('keeps per-aggregate order, across batches', async () => {
    const aggregateId = `order-${randomUUID()}`;
    await insertEvents(aggregateId, 7);
    const smallBatches = createOutboxRelay({
      db: ctx.db,
      producer: kafka.producer,
      topicPrefix: kafka.topicPrefix,
      batchSize: 3,
    });
    const batches = [];
    let result;
    while ((result = await smallBatches.publishBatch()).published > 0)
      batches.push(result.published);
    expect(batches).toEqual([3, 3, 1]);

    const sequences = (await readAggregate(aggregateId, 7)).map((m) => m.value.payload.sequence);
    expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('publishes each event exactly once when two relays run concurrently', async () => {
    const aggregateId = `order-${randomUUID()}`;
    await insertEvents(aggregateId, 30);
    const relayA = createOutboxRelay({
      db: ctx.db,
      producer: kafka.producer,
      topicPrefix: kafka.topicPrefix,
      batchSize: 5,
    });
    const relayB = createOutboxRelay({
      db: ctx.db,
      producer: kafka.producer,
      topicPrefix: kafka.topicPrefix,
      batchSize: 5,
    });

    const results = [];
    while ((await pendingCount()) > 0) {
      results.push(...(await Promise.all([relayA.publishBatch(), relayB.publishBatch()])));
    }
    expect(results.some((r) => r.skipped)).toBe(true); // the lock made one of them stand by
    expect(results.reduce((sum, r) => sum + r.published, 0)).toBe(30);

    const messages = await readAggregate(aggregateId, 30);
    expect(new Set(messages.map((m) => m.value.eventId)).size).toBe(30);
    expect(messages.map((m) => m.value.payload.sequence)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  });
});

/**
 * Reads the orders topic from the beginning and returns only the given aggregate's messages,
 * in partition (offset) order. Earlier tests in this file publish to the same topic, so
 * messages are filtered by key.
 */
async function readAggregate(aggregateId, expected) {
  const consumer = kafka.kafka.consumer({
    kafkaJS: { groupId: `test-${randomUUID()}`, fromBeginning: true },
  });
  const found = [];
  await consumer.connect();
  try {
    await consumer.subscribe({ topics: [kafka.topic('orders')] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out: ${found.length}/${expected} for ${aggregateId}`)),
        20000,
      );
      consumer.run({
        eachMessage: async ({ message }) => {
          if (message.key?.toString() !== aggregateId) return;
          found.push({ value: JSON.parse(message.value.toString()) });
          if (found.length >= expected) {
            clearTimeout(timer);
            resolve();
          }
        },
      });
    });
  } finally {
    await consumer.disconnect();
  }
  return found;
}

describe('failures and recovery', () => {
  it('records a failed batch, keeps the events pending, and publishes them once Kafka accepts', async () => {
    await insertEvents(`order-${randomUUID()}`, 2);

    // A relay pointed at topics that do not exist (auto-creation is disabled) has every send
    // rejected, which is how a broker outage looks to the relay.
    const failing = createOutboxRelay({
      db: ctx.db,
      producer: kafka.producer,
      topicPrefix: `missing-${randomUUID().slice(0, 8)}`,
    });
    await expect(failing.publishBatch()).rejects.toThrow(/timed out/i);

    const { rows } = await ctx.db.query(
      'SELECT attempts, last_error, published_at FROM event_outbox ORDER BY seq',
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.attempts).toBe(1);
      expect(row.last_error).toMatch(/timed out/i);
      expect(row.published_at).toBeNull();
    }

    const health = await admin.get('/api/pipeline/health');
    expect(health.body.outbox).toMatchObject({ pending: 2, failing: 2 });
    expect(health.body.outbox.lastError).toMatch(/timed out/i);

    // Recovery: the working relay publishes the same events and clears the error.
    expect(await relay.publishBatch()).toEqual({ published: 2 });
    const { rows: after } = await ctx.db.query(
      'SELECT attempts, last_error, published_at FROM event_outbox',
    );
    expect(after.every((r) => r.published_at && r.last_error === null && r.attempts === 2)).toBe(
      true,
    );
  }, 30000);
});

describe('relay loop', () => {
  it('drains the outbox continuously and reports heartbeats', async () => {
    const loop = startRelayLoop({
      relay,
      pipelineRepository: createPipelineRepository(ctx.db),
      pollIntervalMs: 50,
      heartbeatIntervalMs: 0,
      log: { info() {}, error() {} },
    });
    try {
      await placeOrder();
      await placeOrder();
      await waitFor(async () => (await pendingCount()) === 0);
      expect(loop.stats.publishedTotal).toBe(6);

      const health = await admin.get('/api/pipeline/health');
      expect(health.body.status).toBe('healthy');
      const relayComponent = health.body.components.find((c) => c.component === 'outbox-relay');
      expect(relayComponent).toMatchObject({ status: 'up', details: { status: 'ok' } });
    } finally {
      await loop.stop();
    }
    const after = await admin.get('/api/pipeline/health');
    expect(after.body.components[0]).toMatchObject({
      status: 'down',
      details: { status: 'stopped' },
    });
  });

  it('backs off while publishing fails and recovers afterwards', async () => {
    let failuresLeft = 2;
    const flaky = {
      async publishBatch() {
        if (failuresLeft-- > 0) throw new Error('broker unavailable');
        return relay.publishBatch();
      },
    };
    const errors = [];
    const loop = startRelayLoop({
      relay: flaky,
      pipelineRepository: createPipelineRepository(ctx.db),
      pollIntervalMs: 20,
      heartbeatIntervalMs: 0,
      log: { info() {}, error: (m) => errors.push(m) },
    });
    try {
      await placeOrder();
      await waitFor(async () => (await pendingCount()) === 0);
      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatch(/retrying in 40 ms/); // 20 × 2^1
      expect(errors[1]).toMatch(/retrying in 80 ms/); // 20 × 2^2
      expect(loop.stats).toMatchObject({ status: 'ok', consecutiveFailures: 0, lastError: null });
    } finally {
      await loop.stop();
    }
  });
});

async function waitFor(condition, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Condition not met in time');
}
