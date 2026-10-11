import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let admin;
let analyst;
let customer;
let laptop;
let mouse;

beforeEach(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'admin@example.test', role: 'admin' });
  await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
  admin = await ctx.loginAs('admin@example.test');
  analyst = await ctx.loginAs('analyst@example.test');
  customer = await ctx.seedCustomer();
  laptop = await ctx.seedProduct({ sku: 'LAP-1', price: '999.99', stock: 5 });
  mouse = await ctx.seedProduct({ sku: 'MOU-1', price: '19.99', stock: 100 });
});

function placeOrder(body, key = randomUUID(), agent = admin) {
  return agent.post('/api/orders').set('Idempotency-Key', key).send(body);
}

const twoLines = () => ({
  customerId: customer.id,
  items: [
    { productId: laptop.id, quantity: 2 },
    { productId: mouse.id, quantity: 3 },
  ],
});

describe('POST /api/orders', () => {
  it('creates an order with server-computed prices and totals and decrements stock', async () => {
    const res = await placeOrder(twoLines());

    expect(res.status).toBe(201);
    const { order } = res.body;
    expect(order).toMatchObject({
      customerId: customer.id,
      customerName: 'Jane Doe',
      status: 'pending',
      totalAmount: '2059.95', // 2 × 999.99 + 3 × 19.99
      itemCount: 2,
    });
    expect(order.items).toEqual([
      expect.objectContaining({
        productId: laptop.id,
        quantity: 2,
        unitPrice: '999.99',
        lineTotal: '1999.98',
      }),
      expect.objectContaining({
        productId: mouse.id,
        quantity: 3,
        unitPrice: '19.99',
        lineTotal: '59.97',
      }),
    ]);
    expect(await ctx.stockOf(laptop.id)).toBe(3);
    expect(await ctx.stockOf(mouse.id)).toBe(97);
  });

  it('computes totals exactly (no floating-point drift)', async () => {
    const cheap = await ctx.seedProduct({ sku: 'CHEAP', price: '0.10', stock: 10 });
    const other = await ctx.seedProduct({ sku: 'OTHER', price: '0.20', stock: 10 });
    const res = await placeOrder({
      customerId: customer.id,
      items: [
        { productId: cheap.id, quantity: 1 },
        { productId: other.id, quantity: 1 },
      ],
    });
    expect(res.body.order.totalAmount).toBe('0.30');
  });

  it('ignores client-supplied prices (rejects them as unknown fields)', async () => {
    const res = await placeOrder({
      customerId: customer.id,
      items: [{ productId: laptop.id, quantity: 1, unitPrice: '0.01' }],
      totalAmount: '0.01',
    });
    expect(res.status).toBe(400);
    expect(await ctx.stockOf(laptop.id)).toBe(5);
  });

  it('records ledger movements and outbox events in the same transaction', async () => {
    const { body } = await placeOrder(twoLines());
    const orderId = body.order.id;

    const { rows: movements } = await ctx.db.query(
      `SELECT product_id, quantity_change, reason, order_id FROM stock_movements ORDER BY product_id`,
    );
    expect(movements).toEqual([
      {
        product_id: String(laptop.id),
        quantity_change: -2,
        reason: 'order',
        order_id: String(orderId),
      },
      {
        product_id: String(mouse.id),
        quantity_change: -3,
        reason: 'order',
        order_id: String(orderId),
      },
    ]);

    const [created] = await ctx.outboxEvents('order.created');
    expect(created.aggregate_id).toBe(String(orderId));
    expect(created.payload).toMatchObject({
      schemaVersion: 1,
      orderId,
      customerId: customer.id,
      totalAmount: '2059.95',
      itemCount: 2,
    });
    expect(created.payload.items[0]).toMatchObject({
      productId: laptop.id,
      sku: 'LAP-1',
      categoryId: laptop.categoryId,
    });
    const stockEvents = await ctx.outboxEvents('inventory.stock_changed');
    expect(stockEvents.map((e) => e.payload.stockAfter).sort((a, b) => a - b)).toEqual([3, 97]);
  });

  it('rejects an order that exceeds available stock and changes nothing', async () => {
    const res = await placeOrder({
      customerId: customer.id,
      items: [
        { productId: mouse.id, quantity: 1 },
        { productId: laptop.id, quantity: 6 },
      ],
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toEqual([
      { productId: laptop.id, sku: 'LAP-1', requested: 6, available: 5 },
    ]);
    expect(await ctx.stockOf(laptop.id)).toBe(5);
    expect(await ctx.stockOf(mouse.id)).toBe(100); // the valid line was not applied either
    const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM orders');
    expect(rows[0].n).toBe(0);
    expect(await ctx.outboxEvents()).toEqual([]);
  });

  it('allows ordering exactly the remaining stock', async () => {
    const res = await placeOrder({
      customerId: customer.id,
      items: [{ productId: laptop.id, quantity: 5 }],
    });
    expect(res.status).toBe(201);
    expect(await ctx.stockOf(laptop.id)).toBe(0);
  });

  it('rejects inactive products, unknown products, and unknown customers', async () => {
    const retired = await ctx.seedProduct({ sku: 'OLD-1', isActive: false, stock: 50 });

    const inactive = await placeOrder({
      customerId: customer.id,
      items: [{ productId: retired.id, quantity: 1 }],
    });
    expect(inactive.status).toBe(409);
    expect(inactive.body.error.code).toBe('PRODUCT_UNAVAILABLE');

    const unknownProduct = await placeOrder({
      customerId: customer.id,
      items: [{ productId: 99999, quantity: 1 }],
    });
    expect(unknownProduct.status).toBe(400);
    expect(unknownProduct.body.error.details[0].path).toBe('items.0.productId');

    const unknownCustomer = await placeOrder({
      customerId: 99999,
      items: [{ productId: mouse.id, quantity: 1 }],
    });
    expect(unknownCustomer.status).toBe(400);
    expect(unknownCustomer.body.error.details[0].path).toBe('customerId');
  });

  it.each([
    ['no items', { items: [] }],
    ['zero quantity', { items: [{ productId: 1, quantity: 0 }] }],
    ['fractional quantity', { items: [{ productId: 1, quantity: 1.5 }] }],
    [
      'the same product twice',
      {
        items: [
          { productId: 1, quantity: 1 },
          { productId: 1, quantity: 2 },
        ],
      },
    ],
  ])('validates the body: %s', async (_label, patch) => {
    const res = await placeOrder({ customerId: customer.id, ...patch });
    expect(res.status).toBe(400);
  });

  it('requires a well-formed Idempotency-Key header', async () => {
    const missing = await admin.post('/api/orders').send(twoLines());
    expect(missing.status).toBe(400);
    expect(missing.body.error.details[0].path).toBe('Idempotency-Key');

    const tooShort = await placeOrder(twoLines(), 'abc');
    expect(tooShort.status).toBe(400);
  });

  it('is admin-only', async () => {
    expect((await placeOrder(twoLines(), randomUUID(), analyst)).status).toBe(403);
    expect((await request(ctx.app).post('/api/orders').send(twoLines())).status).toBe(401);
  });
});

describe('idempotent retries', () => {
  it('returns the original order for a retried request without deducting stock again', async () => {
    const key = randomUUID();
    const first = await placeOrder(twoLines(), key);
    const retry = await placeOrder(twoLines(), key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.order.id).toBe(first.body.order.id);
    expect(await ctx.stockOf(laptop.id)).toBe(3);
    const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM orders');
    expect(rows[0].n).toBe(1);
    expect(await ctx.outboxEvents('order.created')).toHaveLength(1);
  });

  it('treats line order as irrelevant when matching a retry', async () => {
    const key = randomUUID();
    await placeOrder(twoLines(), key);
    const reordered = { ...twoLines(), items: [...twoLines().items].reverse() };
    expect((await placeOrder(reordered, key)).status).toBe(200);
  });

  it('rejects reusing a key for a different request', async () => {
    const key = randomUUID();
    await placeOrder(twoLines(), key);
    const different = await placeOrder(
      { customerId: customer.id, items: [{ productId: mouse.id, quantity: 1 }] },
      key,
    );
    expect(different.status).toBe(409);
    expect(different.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await ctx.stockOf(mouse.id)).toBe(97);
  });

  it('creates exactly one order when the same request is sent concurrently', async () => {
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => placeOrder(twoLines(), key)),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((r) => r.body.order.id)).size).toBe(1);
    expect(await ctx.stockOf(laptop.id)).toBe(3);
    expect(await ctx.stockOf(mouse.id)).toBe(97);
  });
});

describe('concurrency', () => {
  it('never oversells when many orders race for limited stock', async () => {
    // 5 laptops in stock, 8 concurrent single-unit orders: exactly 5 succeed.
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        placeOrder({ customerId: customer.id, items: [{ productId: laptop.id, quantity: 1 }] }),
      ),
    );
    const statuses = responses.map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 409)).toHaveLength(3);
    expect(await ctx.stockOf(laptop.id)).toBe(0);

    const { rows } = await ctx.db.query(
      `SELECT coalesce(sum(quantity_change), 0)::int AS total FROM stock_movements
       WHERE product_id = $1`,
      [laptop.id],
    );
    expect(rows[0].total).toBe(-5); // ledger agrees with the stock column
  });

  it('does not deadlock when orders lock the same products in different line orders', async () => {
    const forward = {
      customerId: customer.id,
      items: twoLines().items.map((i) => ({ ...i, quantity: 1 })),
    };
    const backward = { ...forward, items: [...forward.items].reverse() };
    // Enough stock for every order, so any failure here would be a lock problem (deadlock → 500).
    await ctx.db.query('UPDATE products SET stock_quantity = 50 WHERE id = $1', [laptop.id]);

    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, n) => placeOrder(n % 2 ? forward : backward)),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201, 201]);
    expect(await ctx.stockOf(laptop.id)).toBe(44);
    expect(await ctx.stockOf(mouse.id)).toBe(94);
  });
});

describe('PATCH /api/orders/:id/status', () => {
  let orderId;
  beforeEach(async () => {
    orderId = (await placeOrder(twoLines())).body.order.id;
  });

  const setStatus = (status, id = orderId, agent = admin) =>
    agent.patch(`/api/orders/${id}/status`).send({ status });

  it('follows the order lifecycle and emits an event per change', async () => {
    for (const status of ['paid', 'shipped', 'delivered']) {
      const res = await setStatus(status);
      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe(status);
    }
    const events = await ctx.outboxEvents('order.status_changed');
    expect(events[0].payload.orderCreatedAt).toBeTruthy();
    expect(
      new Date(events[0].payload.orderCreatedAt) <= new Date(events[0].payload.changedAt),
    ).toBe(true);
    expect(events.map((e) => [e.payload.fromStatus, e.payload.toStatus])).toEqual([
      ['pending', 'paid'],
      ['paid', 'shipped'],
      ['shipped', 'delivered'],
    ]);
  });

  it.each([
    [[], 'shipped'],
    [[], 'delivered'],
    [['paid', 'shipped'], 'cancelled'],
    [['cancelled'], 'paid'],
    [['paid', 'shipped', 'delivered'], 'pending'],
  ])('after %j rejects a change to %s', async (path, target) => {
    for (const status of path) expect((await setStatus(status)).status).toBe(200);
    const res = await setStatus(target);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('restores stock through the ledger when an order is cancelled', async () => {
    expect((await setStatus('paid')).status).toBe(200);
    const res = await setStatus('cancelled');
    expect(res.status).toBe(200);

    expect(await ctx.stockOf(laptop.id)).toBe(5);
    expect(await ctx.stockOf(mouse.id)).toBe(100);
    const { rows } = await ctx.db.query(
      `SELECT product_id, quantity_change FROM stock_movements
       WHERE reason = 'cancellation' ORDER BY product_id`,
    );
    expect(rows).toEqual([
      { product_id: String(laptop.id), quantity_change: 2 },
      { product_id: String(mouse.id), quantity_change: 3 },
    ]);
  });

  it('cannot restock twice: cancelling an already-cancelled order is rejected', async () => {
    expect((await setStatus('cancelled')).status).toBe(200);
    expect((await setStatus('cancelled')).status).toBe(409);
    expect(await ctx.stockOf(laptop.id)).toBe(5);
  });

  it('handles concurrent cancellations safely', async () => {
    const results = await Promise.all([setStatus('cancelled'), setStatus('cancelled')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await ctx.stockOf(laptop.id)).toBe(5);
  });

  it('returns 404, 400, and 403 appropriately', async () => {
    expect((await setStatus('paid', 99999)).status).toBe(404);
    expect((await setStatus('lost')).status).toBe(400);
    expect((await setStatus('paid', orderId, analyst)).status).toBe(403);
  });
});

describe('GET /api/orders', () => {
  let bob;
  beforeEach(async () => {
    bob = await ctx.seedCustomer({ email: 'bob@shop.test', firstName: 'Bob', lastName: 'Stone' });
    const one = (customerId, productId, quantity) =>
      placeOrder({ customerId, items: [{ productId, quantity }] });

    await one(customer.id, mouse.id, 1); // 19.99
    await one(customer.id, laptop.id, 1); // 999.99
    const third = await one(bob.id, mouse.id, 5); // 99.95
    await admin.patch(`/api/orders/${third.body.order.id}/status`).send({ status: 'paid' });
  });

  const totals = (res) => res.body.data.map((o) => o.totalAmount);

  it('lists newest first by default, readable by analysts', async () => {
    const res = await analyst.get('/api/orders');
    expect(res.status).toBe(200);
    expect(totals(res)).toEqual(['99.95', '999.99', '19.99']);
    expect(res.body.data[0]).toMatchObject({
      customerName: 'Bob Stone',
      status: 'paid',
      itemCount: 1,
    });
    expect(res.body.pagination.total).toBe(3);
  });

  it('filters by status, customer, total range, and date', async () => {
    expect(totals(await analyst.get('/api/orders?status=paid'))).toEqual(['99.95']);
    expect(totals(await analyst.get(`/api/orders?customerId=${customer.id}`))).toEqual([
      '999.99',
      '19.99',
    ]);
    expect(totals(await analyst.get('/api/orders?minTotal=50&maxTotal=500'))).toEqual(['99.95']);

    const today = new Date().toISOString().slice(0, 10);
    expect(
      (await analyst.get(`/api/orders?dateFrom=${today}&dateTo=${today}`)).body.data,
    ).toHaveLength(3);
    expect((await analyst.get('/api/orders?dateTo=2000-01-01')).body.data).toHaveLength(0);
  });

  it('searches by customer name, email, or order number', async () => {
    expect(totals(await analyst.get('/api/orders?search=bob'))).toEqual(['99.95']);
    expect(totals(await analyst.get('/api/orders?search=shop.test'))).toEqual(['99.95']);
    const first = (await analyst.get('/api/orders?sort=createdAt&order=asc')).body.data[0];
    expect(totals(await analyst.get(`/api/orders?search=${first.id}`))).toContain('19.99');
  });

  it('sorts by total', async () => {
    expect(totals(await analyst.get('/api/orders?sort=totalAmount&order=asc'))).toEqual([
      '19.99',
      '99.95',
      '999.99',
    ]);
  });

  it('rejects invalid filters', async () => {
    expect((await analyst.get('/api/orders?status=lost')).status).toBe(400);
    expect((await analyst.get('/api/orders?dateFrom=yesterday')).status).toBe(400);
    expect((await analyst.get('/api/orders?dateFrom=2025-02-01&dateTo=2025-01-01')).status).toBe(
      400,
    );
  });

  it('returns order details with line items', async () => {
    const [latest] = (await analyst.get('/api/orders')).body.data;
    const res = await analyst.get(`/api/orders/${latest.id}`);
    expect(res.status).toBe(200);
    expect(res.body.order.items).toEqual([
      expect.objectContaining({ sku: 'MOU-1', quantity: 5, lineTotal: '99.95' }),
    ]);
    expect((await analyst.get('/api/orders/99999')).status).toBe(404);
  });
});
