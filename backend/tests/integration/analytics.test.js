import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

const WEEK = 'from=2026-03-01&to=2026-03-07';
let analyst;
let p1;
let p2;

// Hand-built analytics data (as the Spark job would have written it). The selected week is
// 2026-03-01..07; the previous week is 2026-02-22..28. Rows just outside the range check the
// boundaries.
beforeAll(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
  analyst = await ctx.loginAs('analyst@example.test');
  p1 = await ctx.seedProduct({ sku: 'AUD-1', name: 'Headphones', stock: 2, category: 'Audio' });
  p2 = await ctx.seedProduct({ sku: 'BK-1', name: 'Novel', stock: 45, category: 'Books' });
  await ctx.seedProduct({ sku: 'OLD-1', name: 'Unsold', stock: 30 });
  await ctx.db.query('UPDATE products SET reorder_level = 10');
  const c1 = await ctx.seedCustomer({
    email: 'c1@example.test',
    firstName: 'Ann',
    lastName: 'One',
  });
  const c2 = await ctx.seedCustomer({
    email: 'c2@example.test',
    firstName: 'Ben',
    lastName: 'Two',
  });
  const c3 = await ctx.seedCustomer({
    email: 'c3@example.test',
    firstName: 'Cat',
    lastName: 'Three',
  });

  await ctx.db.query(
    `INSERT INTO analytics_sales_hourly
       (bucket_start, orders_count, gross_revenue, items_sold, cancelled_orders, cancelled_revenue)
     VALUES ('2026-02-25 12:00Z', 2,  80.00, 2, 0,  0),
            ('2026-03-01 10:00Z', 2, 100.00, 4, 1, 30.00),
            ('2026-03-01 15:00Z', 1,  50.00, 1, 0,  0),
            ('2026-03-03 09:00Z', 3, 150.50, 5, 0,  0),
            ('2026-03-07 23:00Z', 1,  10.00, 1, 0,  0),
            ('2026-03-08 00:00Z', 5, 999.00, 9, 0,  0)`,
  );
  await ctx.db.query(
    `INSERT INTO analytics_customers (customer_id, first_order_at, last_order_at, orders_count, revenue)
     VALUES ($1, '2026-03-01 10:05Z', '2026-03-01 15:10Z', 2, 120.00),
            ($2, '2026-02-25 12:10Z', '2026-03-03 09:20Z', 2,  95.00),
            ($3, '2026-03-03 09:10Z', '2026-03-03 09:30Z', 3, 150.50),
            (999, '2026-01-01 00:00Z', '2026-01-01 00:00Z', 0,   0.00)`,
    [c1.id, c2.id, c3.id],
  );
  await ctx.db.query(
    `INSERT INTO analytics_processed_events (event_id, event_type, occurred_at, customer_id, amount)
     SELECT gen_random_uuid(), 'order.created', t::timestamptz, c, 10
     FROM (VALUES ('2026-03-01 10:05Z', $1::bigint), ('2026-03-01 15:10Z', $1),
                  ('2026-03-03 09:10Z', $3), ('2026-03-03 09:20Z', $2),
                  ('2026-03-03 09:30Z', $3), ('2026-02-25 12:10Z', $2)) v(t, c)`,
    [c1.id, c2.id, c3.id],
  );
  await ctx.db.query(
    `INSERT INTO analytics_product_daily
       (day, product_id, sku, category_id, units_sold, revenue, orders_count)
     VALUES ('2026-03-01', $1, 'AUD-1', $3, 3,   90.00, 2),
            ('2026-03-03', $1, 'AUD-1', $3, 1,   30.00, 1),
            ('2026-03-03', $2, 'BK-1',  $4, 5,  150.50, 3),
            ('2026-03-08', $2, 'BK-1',  $4, 100, 9999.00, 9)`,
    [p1.id, p2.id, p1.categoryId, p2.categoryId],
  );
  await ctx.db.query(
    `INSERT INTO analytics_inventory_daily (day, product_id, units_in, units_out, movements)
     VALUES ('2026-03-01', $1, 0, 3, 2), ('2026-03-03', $2, 50, 5, 4), ('2026-03-09', $2, 0, 40, 1)`,
    [p1.id, p2.id],
  );
  await ctx.db.query(
    `INSERT INTO analytics_order_status VALUES ('pending', 3), ('paid', 2), ('delivered', 1),
                                              ('cancelled', 0)`,
  );
  await ctx.db.query(
    `INSERT INTO analytics_anomalies
       (anomaly_type, severity, entity_type, entity_id, occurred_at, description, details)
     VALUES ('high_value_order', 'high', 'order', '7', '2026-03-02 11:00Z', 'Big order', '{"total":"5000.00"}'),
            ('order_velocity', 'medium', 'customer', '3', '2026-03-05 09:00Z', 'Burst', '{}'),
            ('order_velocity', 'medium', 'customer', '4', '2026-03-20 09:00Z', 'Later', '{}')`,
  );
  await ctx.db.query(
    `INSERT INTO analytics_stream_batches
       (job, batch_id, processed_at, events_total, events_valid, events_invalid,
        events_duplicate, events_applied)
     VALUES ('stream-events', 0, '2026-03-08 06:00Z', 10, 10, 0, 0, 10)`,
  );
});

const get = (path) => analyst.get(`/api/analytics/${path}`);

describe('access', () => {
  it('requires a session', async () => {
    expect((await request(ctx.app).get('/api/analytics/overview')).status).toBe(401);
  });
});

describe('GET /overview', () => {
  it('computes KPIs for the range with exact money and inclusive boundaries', async () => {
    const res = await get(`overview?${WEEK}`);
    expect(res.status).toBe(200);
    expect(res.body.range).toEqual({ from: '2026-03-01', to: '2026-03-07', days: 7 });
    expect(res.body.current).toEqual({
      netRevenue: '280.50', // 310.50 gross − 30.00 cancelled
      grossRevenue: '310.50',
      cancelledRevenue: '30.00',
      orders: 7,
      cancelledOrders: 1,
      netOrders: 6,
      cancellationRate: 14.3,
      averageOrderValue: '46.75', // 280.50 / 6
      itemsSold: 11,
      newCustomers: 2,
      activeCustomers: 3,
    });
    expect(res.body.dataAsOf).toBe('2026-03-08T06:00:00.000Z');
  });

  it('compares with the previous period of the same length', async () => {
    const { body } = await get(`overview?${WEEK}`);
    expect(body.previousRange).toEqual({ from: '2026-02-22', to: '2026-02-28' });
    expect(body.previous).toMatchObject({ netRevenue: '80.00', orders: 2, newCustomers: 1 });
    expect(body.change).toMatchObject({
      netRevenue: 250.6, // (280.50 − 80) / 80
      orders: 250,
      newCustomers: 100,
    });
  });

  it('returns zeros and null changes for a period without data', async () => {
    const { body } = await get('overview?from=2025-01-01&to=2025-01-31');
    expect(body.current).toMatchObject({
      netRevenue: '0.00',
      orders: 0,
      averageOrderValue: '0.00',
    });
    expect(body.change.netRevenue).toBeNull();
  });
});

describe('GET /revenue', () => {
  it('returns one zero-filled bucket per day', async () => {
    const { body } = await get(`revenue?${WEEK}&interval=day`);
    expect(body.interval).toBe('day');
    expect(body.series.map((s) => [s.bucket, s.netRevenue, s.orders])).toEqual([
      ['2026-03-01T00:00:00.000Z', '120.00', 3],
      ['2026-03-02T00:00:00.000Z', '0.00', 0],
      ['2026-03-03T00:00:00.000Z', '150.50', 3],
      ['2026-03-04T00:00:00.000Z', '0.00', 0],
      ['2026-03-05T00:00:00.000Z', '0.00', 0],
      ['2026-03-06T00:00:00.000Z', '0.00', 0],
      ['2026-03-07T00:00:00.000Z', '10.00', 1],
    ]);
  });

  it('picks the interval from the range length when not given', async () => {
    expect((await get('revenue?from=2026-03-01&to=2026-03-01')).body.series).toHaveLength(24);
    expect((await get(`revenue?${WEEK}`)).body.interval).toBe('day');
    expect((await get('revenue?from=2026-01-01&to=2026-06-30')).body.interval).toBe('week');
  });

  it('aggregates weeks (Monday-based) within the range only', async () => {
    const { body } = await get(`revenue?${WEEK}&interval=week`);
    expect(body.series.map((s) => [s.bucket, s.grossRevenue])).toEqual([
      ['2026-02-23T00:00:00.000Z', '150.00'], // only 2026-03-01 falls in the range
      ['2026-03-02T00:00:00.000Z', '160.50'],
    ]);
  });

  it('rejects invalid ranges', async () => {
    expect((await get('revenue?from=2026-03-07&to=2026-03-01')).status).toBe(400);
    expect((await get('revenue?from=2024-01-01&to=2026-01-01')).status).toBe(400);
    expect((await get('revenue?from=2026-01-01&to=2026-03-31&interval=hour')).status).toBe(400);
    expect((await get('revenue?from=yesterday')).status).toBe(400);
  });
});

describe('products and categories', () => {
  it('ranks products by revenue or units within the range', async () => {
    const byRevenue = (await get(`products/top?${WEEK}`)).body.products;
    expect(byRevenue).toEqual([
      expect.objectContaining({
        sku: 'BK-1',
        name: 'Novel',
        categoryName: 'Books',
        unitsSold: 5,
        revenue: '150.50',
        revenueShare: 55.6,
      }),
      expect.objectContaining({
        sku: 'AUD-1',
        unitsSold: 4,
        revenue: '120.00',
        orders: 3,
        revenueShare: 44.4,
      }),
    ]);
    const byUnits = (await get(`products/top?${WEEK}&sortBy=units&limit=1`)).body.products;
    expect(byUnits.map((p) => p.sku)).toEqual(['BK-1']);
  });

  it('sums revenue per category', async () => {
    const { body } = await get(`categories?${WEEK}`);
    expect(body.categories.map((c) => [c.name, c.revenue, c.unitsSold, c.revenueShare])).toEqual([
      ['Books', '150.50', 5, 55.6],
      ['Audio', '120.00', 4, 44.4],
    ]);
  });
});

describe('GET /order-status', () => {
  it('lists every status with counts and shares', async () => {
    const { body } = await get('order-status');
    expect(body.total).toBe(6);
    expect(body.statuses).toEqual([
      { status: 'pending', orders: 3, share: 50 },
      { status: 'paid', orders: 2, share: 33.3 },
      { status: 'shipped', orders: 0, share: 0 },
      { status: 'delivered', orders: 1, share: 16.7 },
      { status: 'cancelled', orders: 0, share: 0 },
    ]);
  });
});

describe('GET /customers', () => {
  it('splits active customers into new and returning per day', async () => {
    const { body } = await get(`customers?${WEEK}`);
    const day = (d) => body.series.find((s) => s.bucket === `2026-03-0${d}T00:00:00.000Z`);
    // 03-01: Ann's first orders. 03-03: Cat is new, Ben returns.
    expect(day(1)).toMatchObject({
      activeCustomers: 1,
      newCustomers: 1,
      returningCustomers: 0,
      orders: 2,
    });
    expect(day(3)).toMatchObject({
      activeCustomers: 2,
      newCustomers: 1,
      returningCustomers: 1,
      orders: 3,
    });
    expect(day(2)).toMatchObject({ activeCustomers: 0, newCustomers: 0 });
  });

  it('reports repeat purchase rate and top customers', async () => {
    const { body } = await get(`customers?${WEEK}&limit=2`);
    expect(body.summary).toEqual({
      customersWithOrders: 3,
      repeatCustomers: 3,
      repeatPurchaseRate: 100,
      averageRevenuePerCustomer: '121.83',
    });
    expect(body.topCustomers.map((c) => [c.name, c.orders, c.revenue])).toEqual([
      ['Cat Three', 3, '150.50'],
      ['Ann One', 2, '120.00'],
    ]);
  });
});

describe('GET /inventory', () => {
  it('computes stock flow, days of cover, and ranks the most urgent products first', async () => {
    const { body } = await get(`inventory?${WEEK}`);
    expect(body.summary).toEqual({
      activeProducts: 3,
      unitsIn: 50,
      unitsOut: 8,
      lowStockProducts: 1,
      outOfStockProducts: 0,
      noSalesProducts: 1,
    });
    expect(body.products.map((p) => [p.sku, p.daysOfCover, p.isLowStock])).toEqual([
      ['AUD-1', 4.7, true], // 2 units / (3 sold ÷ 7 days)
      ['BK-1', 63, false], // 45 / (5 ÷ 7)
      ['OLD-1', null, false], // nothing sold: cover is unknown
    ]);
    expect(body.products[0]).toMatchObject({
      unitsOut: 3,
      averageDailyUnitsOut: 0.43,
      sellThroughRate: 60,
    });
  });
});

describe('GET /anomalies', () => {
  it('lists anomalies in the range, newest first, with a summary', async () => {
    const { body } = await get(`anomalies?${WEEK}`);
    expect(body.data.map((a) => [a.type, a.entityId])).toEqual([
      ['order_velocity', '3'],
      ['high_value_order', '7'],
    ]);
    expect(body.summary).toEqual({
      total: 2,
      byType: { high_value_order: 1, order_velocity: 1 },
      bySeverity: { high: 1, medium: 1 },
    });
    expect(body.data[1].details).toEqual({ total: '5000.00' });
    expect(body.pagination).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
  });

  it('filters by type and severity', async () => {
    const { body } = await get(`anomalies?${WEEK}&severity=high`);
    expect(body.data.map((a) => a.type)).toEqual(['high_value_order']);
    expect((await get(`anomalies?${WEEK}&type=unknown`)).status).toBe(400);
  });
});
