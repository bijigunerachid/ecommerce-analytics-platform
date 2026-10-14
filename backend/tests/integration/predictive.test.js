import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

// The Spark insights job writes these tables; the API only reads them, so tests seed them.
const ctx = createTestContext();
afterAll(() => ctx.close());

let analyst;
let alice;
let bob;

beforeEach(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
  analyst = await ctx.loginAs('analyst@example.test');
  alice = await ctx.seedCustomer({ email: 'alice@example.test', firstName: 'Alice' });
  bob = await ctx.seedCustomer({ email: 'bob@example.test', firstName: 'Bob' });
});

async function seedRun({ status = 'ok', finishedAt = '2026-03-30T12:05:00Z', ...fields } = {}) {
  await ctx.db.query(
    `INSERT INTO analytics_insights_runs
       (started_at, finished_at, status, as_of, customers, training_days, backtest_wape, details, error)
     VALUES ($1, $1, $2, '2026-03-30', $3, $4, $5, $6, $7)`,
    [
      finishedAt,
      status,
      fields.customers ?? 2,
      fields.trainingDays ?? 60,
      fields.wape ?? 0.1834,
      fields.details ?? {},
      fields.error ?? null,
    ],
  );
}

async function seedSegments() {
  await ctx.db.query(
    `INSERT INTO analytics_customer_segments
       (customer_id, recency_days, frequency, monetary, r_score, f_score, m_score, segment, last_order_at)
     VALUES ($1, 2, 6, 900.00, 5, 5, 5, 'champions', '2026-03-28T10:00:00Z'),
            ($2, 80, 1, 100.00, 1, 1, 2, 'hibernating', '2026-01-09T10:00:00Z')`,
    [alice.id, bob.id],
  );
}

describe('GET /api/analytics/segments', () => {
  it('reports that nothing has been computed yet', async () => {
    const res = await analyst.get('/api/analytics/segments').expect(200);
    expect(res.body.run).toEqual({ computedAt: null, asOf: null, lastError: null });
    expect(res.body.totalCustomers).toBe(0);
    expect(res.body.segments.map((s) => s.segment)).toEqual([
      'champions',
      'loyal',
      'promising',
      'needs_attention',
      'at_risk',
      'hibernating',
    ]);
  });

  it('summarizes every segment with shares of customers and revenue', async () => {
    await seedSegments();
    await seedRun();
    const res = await analyst.get('/api/analytics/segments').expect(200);
    expect(res.body.run).toMatchObject({ asOf: '2026-03-30', lastError: null });
    expect(res.body).toMatchObject({ totalCustomers: 2, totalRevenue: '1000.00' });
    const champions = res.body.segments.find((s) => s.segment === 'champions');
    expect(champions).toEqual({
      segment: 'champions',
      customers: 1,
      customerShare: 50,
      revenue: '900.00',
      revenueShare: 90,
      avgRecencyDays: 2,
      avgOrders: 6,
      avgSpend: '900.00',
    });
    expect(res.body.segments.find((s) => s.segment === 'loyal').customers).toBe(0);
  });

  it('shows a failed latest run next to the last good results', async () => {
    await seedSegments();
    await seedRun();
    await seedRun({
      status: 'error',
      finishedAt: '2026-03-30T12:35:00Z',
      error: 'No event history at /data/history/events yet',
    });
    const res = await analyst.get('/api/analytics/segments').expect(200);
    expect(res.body.run.computedAt).toBe('2026-03-30T12:05:00.000Z');
    expect(res.body.run.lastError).toEqual({
      at: '2026-03-30T12:35:00.000Z',
      message: 'No event history at /data/history/events yet',
    });
  });

  it('lists the customers of a segment, biggest spenders first', async () => {
    await seedSegments();
    const res = await analyst.get('/api/analytics/segments/champions/customers').expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        customerId: alice.id,
        name: 'Alice Doe',
        email: 'alice@example.test',
        recencyDays: 2,
        frequency: 6,
        monetary: '900.00',
        scores: { r: 5, f: 5, m: 5 },
      }),
    ]);
    expect(res.body.pagination.total).toBe(1);
    await analyst.get('/api/analytics/segments/vip/customers').expect(400);
  });

  it('adds the value segment to a customer’s insights', async () => {
    await seedSegments();
    const res = await analyst.get(`/api/customers/${alice.id}/insights`).expect(200);
    expect(res.body.insights.valueSegment).toEqual({
      segment: 'champions',
      scores: { r: 5, f: 5, m: 5 },
      recencyDays: 2,
    });
  });
});

describe('GET /api/analytics/cohorts', () => {
  it('groups retention by cohort with rates', async () => {
    await ctx.db.query(
      `INSERT INTO analytics_cohort_retention (cohort_week, week_offset, cohort_size, active_customers)
       VALUES ('2026-03-02', 0, 40, 40), ('2026-03-02', 1, 40, 10), ('2026-03-02', 2, 40, 6),
              ('2026-03-09', 0, 25, 25), ('2026-03-09', 1, 25, 5)`,
    );
    const res = await analyst.get('/api/analytics/cohorts').expect(200);
    expect(res.body.cohorts).toEqual([
      {
        cohortWeek: '2026-03-02',
        size: 40,
        retention: [
          { weekOffset: 0, active: 40, rate: 100 },
          { weekOffset: 1, active: 10, rate: 25 },
          { weekOffset: 2, active: 6, rate: 15 },
        ],
      },
      {
        cohortWeek: '2026-03-09',
        size: 25,
        retention: [
          { weekOffset: 0, active: 25, rate: 100 },
          { weekOffset: 1, active: 5, rate: 20 },
        ],
      },
    ]);

    // Only the most recent `weeks` cohorts and offsets.
    const recent = await analyst.get('/api/analytics/cohorts?weeks=2').expect(200);
    expect(recent.body.cohorts.map((c) => c.cohortWeek)).toEqual(['2026-03-02', '2026-03-09']);
    expect(recent.body.cohorts[0].retention).toHaveLength(2);
    await analyst.get('/api/analytics/cohorts?weeks=1').expect(400);
  });
});

describe('GET /api/analytics/forecast', () => {
  it('returns the forecast, the recent actuals, and the backtest accuracy', async () => {
    await seedRun();
    await ctx.db.query(
      `INSERT INTO analytics_sales_forecast (day, forecast, lower, upper)
       VALUES ('2026-03-30', 1000.00, 800.00, 1250.00), ('2026-03-31', 1100.00, 880.00, 1375.00)`,
    );
    await ctx.db.query(
      `INSERT INTO analytics_sales_hourly
         (bucket_start, orders_count, gross_revenue, items_sold, cancelled_orders, cancelled_revenue)
       VALUES ('2026-03-29T10:00:00Z', 5, 1200.00, 9, 1, 150.00),
              ('2026-03-29T15:00:00Z', 1, 100.00, 1, 0, 0)`,
    );
    const res = await analyst.get('/api/analytics/forecast').expect(200);
    expect(res.body.model).toEqual({
      name: 'Weekday-adjusted 28-day moving average',
      trainingDays: 60,
      backtestWape: 0.1834,
      skipped: null,
    });
    expect(res.body.forecast).toEqual([
      { day: '2026-03-30', forecast: '1000.00', lower: '800.00', upper: '1250.00' },
      { day: '2026-03-31', forecast: '1100.00', lower: '880.00', upper: '1375.00' },
    ]);
    expect(res.body.actual).toHaveLength(28);
    expect(res.body.actual.at(-1)).toEqual({ day: '2026-03-29', revenue: '1150.00' });
    expect(res.body.actual[0]).toEqual({ day: '2026-03-02', revenue: '0.00' });
  });

  it('explains a skipped forecast', async () => {
    await seedRun({ details: { forecastSkipped: 'needs 42 days of history, has 10' } });
    const res = await analyst.get('/api/analytics/forecast').expect(200);
    expect(res.body.forecast).toEqual([]);
    expect(res.body.model.skipped).toBe('needs 42 days of history, has 10');
  });
});
