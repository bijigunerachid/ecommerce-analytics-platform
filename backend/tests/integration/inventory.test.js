import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let admin;
let analyst;
let product;
beforeEach(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'admin@example.test', role: 'admin' });
  await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
  admin = await ctx.loginAs('admin@example.test');
  analyst = await ctx.loginAs('analyst@example.test');
  product = await ctx.seedProduct({ sku: 'INV-1', stock: 10 });
});

function adjust(body, key = randomUUID(), agent = admin) {
  return agent.post('/api/inventory/adjustments').set('Idempotency-Key', key).send(body);
}

describe('POST /api/inventory/adjustments', () => {
  it('restocks a product, records the movement, and emits an event', async () => {
    const res = await adjust({
      productId: product.id,
      quantityChange: 15,
      reason: 'restock',
      note: 'Supplier delivery',
    });

    expect(res.status).toBe(201);
    expect(res.body.movement).toMatchObject({
      productId: product.id,
      sku: 'INV-1',
      quantityChange: 15,
      reason: 'restock',
      note: 'Supplier delivery',
      orderId: null,
    });
    expect(await ctx.stockOf(product.id)).toBe(25);

    const [event] = await ctx.outboxEvents('inventory.stock_changed');
    expect(event.payload).toMatchObject({
      productId: product.id,
      quantityChange: 15,
      stockAfter: 25,
      reason: 'restock',
    });
  });

  it('applies negative adjustments (e.g. damaged goods)', async () => {
    const res = await adjust({ productId: product.id, quantityChange: -4, reason: 'adjustment' });
    expect(res.status).toBe(201);
    expect(await ctx.stockOf(product.id)).toBe(6);
  });

  it('refuses adjustments that would make stock negative', async () => {
    const res = await adjust({ productId: product.id, quantityChange: -11, reason: 'adjustment' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await ctx.stockOf(product.id)).toBe(10);
    expect(await ctx.outboxEvents()).toEqual([]);
  });

  it('applies a retried adjustment only once', async () => {
    const key = randomUUID();
    const body = { productId: product.id, quantityChange: 5, reason: 'restock' };
    const first = await adjust(body, key);
    const retries = await Promise.all([adjust(body, key), adjust(body, key)]);

    expect(first.status).toBe(201);
    expect(retries.map((r) => r.status)).toEqual([200, 200]);
    expect(retries[0].headers['idempotent-replayed']).toBe('true');
    expect(retries[0].body.movement.id).toBe(first.body.movement.id);
    expect(await ctx.stockOf(product.id)).toBe(15);
  });

  it('rejects reusing a key for a different adjustment', async () => {
    const key = randomUUID();
    await adjust({ productId: product.id, quantityChange: 5, reason: 'restock' }, key);
    const res = await adjust({ productId: product.id, quantityChange: 50, reason: 'restock' }, key);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it.each([
    ['zero change', { quantityChange: 0, reason: 'adjustment' }],
    ['a negative restock', { quantityChange: -3, reason: 'restock' }],
    ['the order reason (reserved for orders)', { quantityChange: -1, reason: 'order' }],
    ['the cancellation reason', { quantityChange: 1, reason: 'cancellation' }],
  ])('rejects %s', async (_label, patch) => {
    expect((await adjust({ productId: product.id, ...patch })).status).toBe(400);
  });

  it('returns 400 for an unknown product and is admin-only', async () => {
    const unknown = await adjust({ productId: 99999, quantityChange: 1, reason: 'restock' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.details[0].path).toBe('productId');

    const body = { productId: product.id, quantityChange: 1, reason: 'restock' };
    expect((await adjust(body, randomUUID(), analyst)).status).toBe(403);
    expect(
      (
        await request(ctx.app)
          .post('/api/inventory/adjustments')
          .set('Idempotency-Key', randomUUID())
          .send(body)
      ).status,
    ).toBe(401);
  });
});

describe('GET /api/inventory/movements', () => {
  beforeEach(async () => {
    const customer = await ctx.seedCustomer();
    await adjust({ productId: product.id, quantityChange: 20, reason: 'restock' });
    await adjust({ productId: product.id, quantityChange: -2, reason: 'adjustment' });
    const order = await admin
      .post('/api/orders')
      .set('Idempotency-Key', randomUUID())
      .send({ customerId: customer.id, items: [{ productId: product.id, quantity: 3 }] });
    await admin.patch(`/api/orders/${order.body.order.id}/status`).send({ status: 'cancelled' });
  });

  it('lists the full ledger newest first and agrees with current stock', async () => {
    const res = await analyst.get('/api/inventory/movements');
    expect(res.status).toBe(200);
    expect(res.body.data.map((m) => [m.reason, m.quantityChange])).toEqual([
      ['cancellation', 3],
      ['order', -3],
      ['adjustment', -2],
      ['restock', 20],
    ]);
    // 10 seeded directly + net ledger change of +18
    expect(await ctx.stockOf(product.id)).toBe(28);
  });

  it('filters by reason, product, and order', async () => {
    const byReason = await analyst.get('/api/inventory/movements?reason=order');
    expect(byReason.body.data).toHaveLength(1);
    const orderId = byReason.body.data[0].orderId;

    const byOrder = await analyst.get(`/api/inventory/movements?orderId=${orderId}`);
    expect(byOrder.body.data.map((m) => m.reason)).toEqual(['cancellation', 'order']);

    const other = await ctx.seedProduct({ sku: 'OTHER-1' });
    const none = await analyst.get(`/api/inventory/movements?productId=${other.id}`);
    expect(none.body.data).toEqual([]);
  });

  it('rejects invalid filters', async () => {
    expect((await analyst.get('/api/inventory/movements?reason=theft')).status).toBe(400);
    expect((await analyst.get('/api/inventory/movements?search=x')).status).toBe(400);
  });
});
