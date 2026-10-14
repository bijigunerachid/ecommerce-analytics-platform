import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, createTestContext } from '../helpers/test-app.js';

// Short heartbeats so the session re-check is observable in a test.
const ctx = createTestContext({ streamHeartbeatMs: 150 });
afterAll(() => ctx.close());

let admin;
let customer;
let product;

beforeEach(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'admin@example.test', role: 'admin' });
  admin = await ctx.loginAs('admin@example.test');
  customer = await ctx.seedCustomer();
  product = await ctx.seedProduct({ sku: 'SKU-1', name: 'Desk Lamp', stock: 12 });
  await ctx.db.query('UPDATE products SET reorder_level = 10 WHERE id = $1', [product.id]);
});

function placeOrder(quantity) {
  return admin
    .post('/api/orders')
    .set('Idempotency-Key', randomUUID())
    .send({ customerId: customer.id, items: [{ productId: product.id, quantity }] })
    .expect(201);
}

async function notifications() {
  const { rows } = await ctx.db.query(
    'SELECT kind, severity, title, body, link FROM notifications ORDER BY id',
  );
  return rows;
}

function insertAnomaly(occurredAt = '2026-03-01T10:00:00Z') {
  return ctx.db.query(
    `INSERT INTO analytics_anomalies
       (anomaly_type, severity, entity_type, entity_id, occurred_at, description)
     VALUES ('high_value_order', 'high', 'order', '42', $1, 'Order total 9000.00 is 12x the p99')`,
    [occurredAt],
  );
}

describe('notification triggers', () => {
  it('notifies once when stock crosses the reorder level, and again when it runs out', async () => {
    await placeOrder(1); // 11 left: still above 10
    expect(await notifications()).toEqual([]);

    await placeOrder(2); // 9 left: crossed
    await placeOrder(1); // 8 left: already low, no repeat
    expect(await notifications()).toEqual([
      {
        kind: 'low_stock',
        severity: 'warning',
        title: 'Desk Lamp is low on stock',
        body: '9 units left (reorder level 10).',
        link: `/products/${product.id}`,
      },
    ]);

    await placeOrder(8); // 0 left
    expect((await notifications()).map((n) => [n.kind, n.severity])).toEqual([
      ['low_stock', 'warning'],
      ['out_of_stock', 'critical'],
    ]);
  });

  it('notifies about anomalies once, even when the analytics rebuild re-inserts them', async () => {
    await insertAnomaly();
    await ctx.db.query('TRUNCATE analytics_anomalies');
    await insertAnomaly();
    expect(await notifications()).toEqual([
      {
        kind: 'anomaly',
        severity: 'critical',
        title: 'Unusually large order',
        body: 'Order total 9000.00 is 12x the p99',
        link: '/orders/42',
      },
    ]);
  });
});

describe('GET /api/notifications', () => {
  it('lists newest first with unread state, and marks all as read', async () => {
    await insertAnomaly();
    await placeOrder(3); // low stock

    let res = await admin.get('/api/notifications').expect(200);
    expect(res.body.unreadCount).toBe(2);
    expect(res.body.notifications.map((n) => [n.kind, n.unread])).toEqual([
      ['low_stock', true],
      ['anomaly', true],
    ]);

    res = await admin.post('/api/notifications/read').expect(200);
    expect(res.body.unreadCount).toBe(0);
    res = await admin.get('/api/notifications?limit=1').expect(200);
    expect(res.body).toMatchObject({ unreadCount: 0, notifications: [{ unread: false }] });

    await insertAnomaly('2026-03-02T10:00:00Z');
    res = await admin.get('/api/notifications').expect(200);
    expect(res.body.unreadCount).toBe(1);
  });

  it('starts new accounts with nothing unread, and keeps read state per user', async () => {
    await insertAnomaly();
    await ctx.db.query(`UPDATE users SET created_at = now() - interval '2 hours'`);
    await ctx.db.query(`UPDATE notifications SET created_at = now() - interval '1 hour'`);
    await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
    const analyst = await ctx.loginAs('analyst@example.test');
    expect((await analyst.get('/api/notifications')).body.unreadCount).toBe(0);
    expect((await admin.get('/api/notifications')).body.unreadCount).toBe(1);
  });

  it('requires authentication and validates the limit', async () => {
    await request(ctx.app).get('/api/notifications').expect(401);
    await admin.get('/api/notifications?limit=0').expect(400);
  });
});

describe('GET /api/activity', () => {
  it('returns the latest order events with customer names', async () => {
    const order = (await placeOrder(1)).body.order;
    await admin.patch(`/api/orders/${order.id}/status`).send({ status: 'paid' }).expect(200);

    const res = await admin.get('/api/activity?limit=5').expect(200);
    expect(res.body.activity).toEqual([
      expect.objectContaining({
        type: 'order.status_changed',
        orderId: order.id,
        customerName: 'Jane Doe',
        fromStatus: 'pending',
        toStatus: 'paid',
      }),
      expect.objectContaining({
        type: 'order.created',
        orderId: order.id,
        totalAmount: '10.00',
        fromStatus: null,
      }),
    ]);
  });
});

describe('GET /api/stream', () => {
  let server;
  let baseUrl;
  const controllers = [];

  beforeEach(async () => {
    server = ctx.app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    for (const c of controllers.splice(0)) c.abort();
    await new Promise((resolve) => server.close(resolve));
  });

  async function sessionCookie(email = 'admin@example.test') {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD });
    return res.headers['set-cookie'][0].split(';')[0];
  }

  /** Opens the stream and returns a reader that waits for named events. */
  async function openStream(cookie) {
    const controller = new AbortController();
    controllers.push(controller);
    const res = await fetch(`${baseUrl}/api/stream`, {
      headers: { cookie },
      signal: controller.signal,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let ended = false;
    const events = [];

    async function pump() {
      const { value, done } = await reader.read();
      if (done) {
        ended = true;
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const name = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (name) events.push({ name, data: data ? JSON.parse(data) : null });
      }
    }

    return {
      res,
      async next(name, timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const found = events.findIndex((e) => e.name === name);
          if (found >= 0) return events.splice(found, 1)[0].data;
          if (ended) throw new Error(`stream ended before "${name}"`);
          if (Date.now() > deadline) throw new Error(`timed out waiting for "${name}"`);
          await pump();
        }
      },
      async untilEnd(timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;
        while (!ended) {
          if (Date.now() > deadline) throw new Error('stream did not end');
          await pump();
        }
      },
    };
  }

  it('pushes order events and notifications as they are committed', async () => {
    const stream = await openStream(await sessionCookie());
    expect(stream.res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(stream.res.headers.get('x-accel-buffering')).toBe('no');
    await stream.next('ready');
    await ctx.app.locals.eventHub.ready();

    const order = (await placeOrder(3)).body.order;
    expect(await stream.next('order')).toMatchObject({
      type: 'order.created',
      orderId: order.id,
      customerName: 'Jane Doe',
      totalAmount: '30.00',
    });
    expect(await stream.next('notification')).toMatchObject({
      kind: 'low_stock',
      severity: 'warning',
      title: 'Desk Lamp is low on stock',
    });
  });

  it('ends the stream when the account is deactivated', async () => {
    const stream = await openStream(await sessionCookie());
    await stream.next('ready');
    await ctx.db.query(`UPDATE users SET is_active = false WHERE email = 'admin@example.test'`);
    await stream.next('session-ended');
    await stream.untilEnd();
  });

  it('requires a session', async () => {
    await request(ctx.app).get('/api/stream').expect(401);
  });
});
