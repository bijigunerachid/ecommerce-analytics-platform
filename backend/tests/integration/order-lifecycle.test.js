import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let admin;
let analyst;
let customer;
let product;

beforeEach(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'admin@example.test', role: 'admin', fullName: 'Ada Admin' });
  await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
  admin = await ctx.loginAs('admin@example.test');
  analyst = await ctx.loginAs('analyst@example.test');
  customer = await ctx.seedCustomer();
  product = await ctx.seedProduct({ sku: 'SKU-1', price: '10.00', stock: 100 });
});

async function placeOrder(quantity = 1) {
  const res = await admin
    .post('/api/orders')
    .set('Idempotency-Key', randomUUID())
    .send({ customerId: customer.id, items: [{ productId: product.id, quantity }] });
  expect(res.status).toBe(201);
  return res.body.order;
}

const setStatus = (id, body) => admin.patch(`/api/orders/${id}/status`).send(body);

describe('order status history', () => {
  it('records placement and every status change with who made it and an optional note', async () => {
    const order = await placeOrder();
    await setStatus(order.id, { status: 'paid' }).expect(200);
    await setStatus(order.id, { status: 'cancelled', note: '  Customer asked to cancel ' }).expect(
      200,
    );

    const res = await analyst.get(`/api/orders/${order.id}/history`).expect(200);
    expect(res.body.history).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: 'pending', note: null }),
      expect.objectContaining({ fromStatus: 'pending', toStatus: 'paid', note: null }),
      expect.objectContaining({
        fromStatus: 'paid',
        toStatus: 'cancelled',
        note: 'Customer asked to cancel',
      }),
    ]);
    for (const entry of res.body.history) {
      expect(entry.changedBy).toEqual({ id: expect.any(Number), fullName: 'Ada Admin' });
      expect(Date.parse(entry.changedAt)).not.toBeNaN();
    }
  });

  it('does not record a rejected change', async () => {
    const order = await placeOrder();
    await setStatus(order.id, { status: 'delivered' }).expect(409);
    const res = await admin.get(`/api/orders/${order.id}/history`).expect(200);
    expect(res.body.history).toHaveLength(1);
  });

  it('validates the note and returns 404 for unknown orders', async () => {
    const order = await placeOrder();
    await setStatus(order.id, { status: 'paid', note: '' }).expect(400);
    await setStatus(order.id, { status: 'paid', note: 'x'.repeat(501) }).expect(400);
    await admin.get('/api/orders/999999/history').expect(404);
  });
});

describe('order notes', () => {
  it('lets admins add notes that everyone can read, oldest first', async () => {
    const order = await placeOrder();
    const first = await admin
      .post(`/api/orders/${order.id}/notes`)
      .send({ body: ' Gift wrap requested ' })
      .expect(201);
    expect(first.body.note).toMatchObject({
      body: 'Gift wrap requested',
      author: { fullName: 'Ada Admin' },
    });
    await admin.post(`/api/orders/${order.id}/notes`).send({ body: 'Called the courier' });

    const res = await analyst.get(`/api/orders/${order.id}/notes`).expect(200);
    expect(res.body.notes.map((n) => n.body)).toEqual([
      'Gift wrap requested',
      'Called the courier',
    ]);
  });

  it('is admin-only to write and validates the body', async () => {
    const order = await placeOrder();
    await analyst.post(`/api/orders/${order.id}/notes`).send({ body: 'Hi' }).expect(403);
    await admin.post(`/api/orders/${order.id}/notes`).send({ body: '   ' }).expect(400);
    await admin
      .post(`/api/orders/${order.id}/notes`)
      .send({ body: 'x'.repeat(2001) })
      .expect(400);
    await admin.post('/api/orders/999999/notes').send({ body: 'Hi' }).expect(404);
  });
});

describe('POST /api/orders/bulk-status', () => {
  it('changes every order it can and reports the rest', async () => {
    const a = await placeOrder();
    const b = await placeOrder();
    const shipped = await placeOrder();
    await setStatus(shipped.id, { status: 'paid' });
    await setStatus(shipped.id, { status: 'shipped' });

    const res = await admin
      .post('/api/orders/bulk-status')
      .send({ orderIds: [b.id, a.id, shipped.id, 999999, a.id], status: 'paid', note: 'Batch' })
      .expect(200);

    expect(res.body).toEqual({
      status: 'paid',
      updated: [a.id, b.id],
      failed: [
        expect.objectContaining({ orderId: shipped.id, code: 'INVALID_STATUS_TRANSITION' }),
        expect.objectContaining({ orderId: 999999, code: 'NOT_FOUND' }),
      ],
    });
    const history = await admin.get(`/api/orders/${a.id}/history`);
    expect(history.body.history.at(-1)).toMatchObject({ toStatus: 'paid', note: 'Batch' });
  });

  it('restocks every cancelled order and emits one event per change', async () => {
    const a = await placeOrder(3);
    const b = await placeOrder(4);
    expect(await ctx.stockOf(product.id)).toBe(93);

    await admin
      .post('/api/orders/bulk-status')
      .send({ orderIds: [a.id, b.id], status: 'cancelled' })
      .expect(200);

    expect(await ctx.stockOf(product.id)).toBe(100);
    const events = await ctx.outboxEvents();
    expect(events.filter((e) => e.event_type === 'order.status_changed')).toHaveLength(2);
  });

  it('is admin-only and validates the request', async () => {
    const order = await placeOrder();
    await analyst
      .post('/api/orders/bulk-status')
      .send({ orderIds: [order.id], status: 'paid' })
      .expect(403);
    await admin.post('/api/orders/bulk-status').send({ orderIds: [], status: 'paid' }).expect(400);
    await admin
      .post('/api/orders/bulk-status')
      .send({ orderIds: Array.from({ length: 101 }, (_, i) => i + 1), status: 'paid' })
      .expect(400);
    await admin
      .post('/api/orders/bulk-status')
      .send({ orderIds: [order.id], status: 'lost' })
      .expect(400);
  });
});
