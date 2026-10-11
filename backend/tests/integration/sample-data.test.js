import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRandom, generateSampleData } from '../../src/sample-data/generator.js';
import { createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const NOW = new Date('2026-03-15T12:00:00Z');
const OPTIONS = { days: 10, ordersPerDay: 8, seed: 7, now: NOW };

const scalar = async (sql) => Object.values((await ctx.db.query(sql)).rows[0])[0];

describe('createRandom', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = createRandom(1);
    const b = createRandom(1);
    const c = createRandom(2);
    const seq = (r) => Array.from({ length: 5 }, () => r.next());
    expect(seq(a)).toEqual(seq(b));
    expect(seq(createRandom(1))).not.toEqual(seq(c));
  });
});

describe('generateSampleData', () => {
  it('writes a consistent history', async () => {
    const summary = await generateSampleData(ctx.db, OPTIONS);
    expect(summary).toMatchObject({ from: '2026-03-05', to: '2026-03-15', products: 34 });
    expect(summary.orders).toBeGreaterThan(50);

    // Stock always equals the ledger, and never went negative at any point in time.
    expect(
      await scalar(`SELECT count(*)::int FROM products p WHERE stock_quantity <>
         (SELECT coalesce(sum(quantity_change), 0) FROM stock_movements m WHERE m.product_id = p.id)`),
    ).toBe(0);
    expect(
      await scalar(`SELECT min((payload->>'stockAfter')::int) FROM event_outbox
                    WHERE event_type = 'inventory.stock_changed'`),
    ).toBeGreaterThanOrEqual(0);
    // Replaying stock events by time reproduces every stockAfter exactly.
    expect(
      await scalar(`SELECT count(*)::int FROM (
         SELECT (payload->>'stockAfter')::int AS after, (payload->>'quantityChange')::int AS change,
                lag((payload->>'stockAfter')::int) OVER (PARTITION BY aggregate_id ORDER BY occurred_at, seq) AS prev
         FROM event_outbox WHERE event_type = 'inventory.stock_changed') x
       WHERE prev IS NOT NULL AND after <> prev + change`),
    ).toBe(0);

    // Orders: totals match their lines; every order has exactly one order.created event.
    expect(
      await scalar(`SELECT count(*)::int FROM orders o WHERE total_amount <>
         (SELECT sum(line_total) FROM order_items i WHERE i.order_id = o.id)`),
    ).toBe(0);
    expect(
      await scalar(`SELECT count(*)::int FROM orders o WHERE (SELECT count(*) FROM event_outbox e
         WHERE e.event_type = 'order.created' AND e.aggregate_id = o.id::text) <> 1`),
    ).toBe(0);

    // Status events form an unbroken chain that ends at the order's current status.
    const { rows: chains } = await ctx.db.query(`
      SELECT o.status,
             array_agg(e.payload->>'fromStatus' ORDER BY e.occurred_at, e.seq) AS froms,
             array_agg(e.payload->>'toStatus' ORDER BY e.occurred_at, e.seq) AS tos
      FROM orders o JOIN event_outbox e
        ON e.aggregate_id = o.id::text AND e.event_type = 'order.status_changed'
      GROUP BY o.id`);
    for (const { status, froms, tos } of chains) {
      expect(froms[0]).toBe('pending');
      for (let i = 1; i < froms.length; i++) expect(froms[i]).toBe(tos[i - 1]);
      expect(tos.at(-1)).toBe(status);
    }

    // Timestamps lie in the history window and never in the future.
    const span = (
      await ctx.db.query(
        'SELECT min(occurred_at) AS first, max(occurred_at) AS last FROM event_outbox',
      )
    ).rows[0];
    expect(span.first >= new Date('2026-03-03T00:00:00Z')).toBe(true);
    expect(span.last <= NOW).toBe(true);
    expect(await scalar('SELECT count(*)::int FROM orders WHERE updated_at < created_at')).toBe(0);

    // Only synthetic customer data.
    expect(
      await scalar(`SELECT count(*)::int FROM customers WHERE email NOT LIKE '%@example.com'`),
    ).toBe(0);
  });

  it('is reproducible: the same seed produces the same data', async () => {
    const fingerprint = () =>
      ctx.db.query(`SELECT count(*)::int AS orders, sum(total_amount)::text AS revenue,
                           (SELECT string_agg(email, ',' ORDER BY id) FROM customers) AS emails
                    FROM orders`);
    const first = await generateSampleData(ctx.db, OPTIONS);
    const a = (await fingerprint()).rows[0];
    await ctx.reset();
    const second = await generateSampleData(ctx.db, OPTIONS);
    const b = (await fingerprint()).rows[0];

    expect(second).toEqual(first);
    expect(b).toEqual(a);
    await ctx.reset();
    await generateSampleData(ctx.db, { ...OPTIONS, seed: 8 });
    expect((await fingerprint()).rows[0].revenue).not.toBe(a.revenue);
  });

  it('plants the anomalies the analytics job should detect', async () => {
    await generateSampleData(ctx.db, OPTIONS);
    // A burst: one customer with 6 orders inside a 10-minute window.
    expect(
      await scalar(`SELECT max(n)::int FROM (SELECT customer_id, count(*) AS n FROM orders
         GROUP BY customer_id, date_bin('10 minutes', created_at, 'epoch')) x`),
    ).toBe(6);
    // A very large order: 25 units of the most expensive product.
    expect(await scalar('SELECT max(quantity)::int FROM order_items')).toBe(25);
    // A large manual stock write-off.
    expect(
      await scalar(`SELECT count(*)::int FROM stock_movements
                    WHERE reason = 'adjustment' AND quantity_change < 0`),
    ).toBe(1);
  });

  it('refuses to run on a database that already has products, and changes nothing', async () => {
    await ctx.seedProduct();
    await expect(generateSampleData(ctx.db, OPTIONS)).rejects.toThrow(/already has products/);
    expect(await scalar('SELECT count(*)::int FROM orders')).toBe(0);
  });

  it('re-enables the updated_at triggers afterwards', async () => {
    await generateSampleData(ctx.db, { ...OPTIONS, days: 2 });
    const { rows } = await ctx.db.query(
      'UPDATE orders SET status = status WHERE id = (SELECT min(id) FROM orders) RETURNING updated_at',
    );
    expect(Date.now() - rows[0].updated_at.getTime()).toBeLessThan(60_000);
  });
});
