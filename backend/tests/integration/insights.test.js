import { randomUUID } from 'node:crypto';
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
  laptop = await ctx.seedProduct({ sku: 'LAP-1', price: '1000.00', stock: 50 });
  mouse = await ctx.seedProduct({ sku: 'MOU-1', price: '20.00', stock: 100 });
});

async function placeOrder(items) {
  const res = await admin
    .post('/api/orders')
    .set('Idempotency-Key', randomUUID())
    .send({ customerId: customer.id, items });
  expect(res.status).toBe(201);
  return res.body.order;
}

/** Moves an order (and its stock movements) back in time. */
async function backdate(orderId, daysAgo) {
  await ctx.db.query(
    `UPDATE orders SET created_at = now() - make_interval(days => $2) WHERE id = $1`,
    [orderId, daysAgo],
  );
  await ctx.db.query(
    `UPDATE stock_movements SET created_at = now() - make_interval(days => $2) WHERE order_id = $1`,
    [orderId, daysAgo],
  );
}

describe('GET /api/customers/:id/insights', () => {
  it('summarizes spend net of cancellations, monthly, with top products', async () => {
    await placeOrder([{ productId: laptop.id, quantity: 1 }]);
    await placeOrder([{ productId: mouse.id, quantity: 3 }]);
    const cancelled = await placeOrder([{ productId: laptop.id, quantity: 2 }]);
    await admin.patch(`/api/orders/${cancelled.id}/status`).send({ status: 'cancelled' });

    const res = await analyst.get(`/api/customers/${customer.id}/insights`).expect(200);
    const { insights } = res.body;
    expect(insights).toMatchObject({
      customerId: customer.id,
      segment: 'returning',
      orders: 3,
      cancelledOrders: 1,
      netOrders: 2,
      lifetimeValue: '1060.00',
      averageOrderValue: '530.00',
    });
    expect(insights.monthly).toHaveLength(12);
    expect(insights.monthly.at(-1)).toMatchObject({ orders: 2, spent: '1060.00' });
    expect(insights.monthly.slice(0, -1).every((m) => m.orders === 0)).toBe(true);
    expect(insights.topProducts).toEqual([
      { productId: laptop.id, sku: 'LAP-1', name: expect.any(String), units: 1, spent: '1000.00' },
      { productId: mouse.id, sku: 'MOU-1', name: expect.any(String), units: 3, spent: '60.00' },
    ]);
  });

  it('segments customers', async () => {
    const segment = async () =>
      (await admin.get(`/api/customers/${customer.id}/insights`)).body.insights.segment;
    expect(await segment()).toBe('prospect');

    const first = await placeOrder([{ productId: mouse.id, quantity: 1 }]);
    expect(await segment()).toBe('new');

    for (let i = 0; i < 3; i++) await placeOrder([{ productId: mouse.id, quantity: 1 }]);
    expect(await segment()).toBe('loyal');

    await ctx.db.query(`UPDATE orders SET created_at = now() - interval '120 days'`);
    expect(await segment()).toBe('lapsed');
    expect(first.id).toBeGreaterThan(0);
  });

  it('returns 404 for unknown customers', async () => {
    await admin.get('/api/customers/999999/insights').expect(404);
  });
});

describe('GET /api/products/:id/insights', () => {
  it('reports daily sales and end-of-day stock from the ledger', async () => {
    // The product was created four days ago: the first two days of the window ended before it.
    await ctx.db.query(`UPDATE products SET created_at = now() - interval '4 days' WHERE id = $1`, [
      laptop.id,
    ]);
    const old = await placeOrder([{ productId: laptop.id, quantity: 4 }]);
    await backdate(old.id, 2);
    await placeOrder([{ productId: laptop.id, quantity: 1 }]);
    const cancelled = await placeOrder([{ productId: laptop.id, quantity: 5 }]);
    await admin.patch(`/api/orders/${cancelled.id}/status`).send({ status: 'cancelled' });

    const res = await analyst.get(`/api/products/${laptop.id}/insights?days=7`).expect(200);
    const { insights } = res.body;
    expect(insights).toMatchObject({
      productId: laptop.id,
      range: { days: 7 },
      unitsSold: 5,
      revenue: '5000.00',
      orders: 2,
      stock: 45,
      reorderLevel: expect.any(Number),
    });
    expect(insights.daily).toHaveLength(7);
    const [twoDaysAgo, yesterday, today] = insights.daily.slice(-3);
    expect(twoDaysAgo).toMatchObject({ units: 4, stockEnd: 46 });
    expect(yesterday).toMatchObject({ units: 0, stockEnd: 46 });
    // Today: one sale kept, one sale cancelled and restocked.
    expect(today).toMatchObject({ units: 1, revenue: '1000.00', stockEnd: 45 });
    // Days that ended before the product existed have no stock level.
    expect(insights.daily.slice(0, 2).map((d) => d.stockEnd)).toEqual([null, null]);
    expect(insights.daily[2].stockEnd).toBe(50);
    expect(insights.restock).toMatchObject({ dailyUnits: 0.17, daysOfCover: 270 });
  });

  it('validates the window and returns 404 for unknown products', async () => {
    await admin.get(`/api/products/${laptop.id}/insights?days=3`).expect(400);
    await admin.get(`/api/products/${laptop.id}/insights?days=400`).expect(400);
    await admin.get('/api/products/999999/insights').expect(404);
  });

  it('requires authentication', async () => {
    const { default: request } = await import('supertest');
    await request(ctx.app).get(`/api/products/${laptop.id}/insights`).expect(401);
  });
});
