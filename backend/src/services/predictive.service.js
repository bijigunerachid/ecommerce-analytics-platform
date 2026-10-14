import { paginationMeta } from '../db/query-helpers.js';
import { fromCents, toCents } from '../utils/money.js';

export const SEGMENTS = [
  'champions',
  'loyal',
  'promising',
  'needs_attention',
  'at_risk',
  'hibernating',
];

const ACTUAL_DAYS = 28;

const share = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

/** When the results were computed, and whether the latest attempt failed. */
function runInfo({ ok, latest }) {
  return {
    computedAt: ok?.finished_at ?? null,
    // as text: a date column would become a Date at local midnight
    asOf: ok?.as_of_day ?? null,
    lastError:
      latest && latest.status === 'error'
        ? { at: latest.finished_at, message: latest.error }
        : null,
  };
}

export function createPredictiveService({ predictiveRepository: repo }) {
  return {
    async segments() {
      const [rows, runs] = await Promise.all([repo.segmentSummary(), repo.runs()]);
      const bySegment = new Map(rows.map((r) => [r.segment, r]));
      const totalCustomers = rows.reduce((sum, r) => sum + r.customers, 0);
      const totalCents = rows.reduce((sum, r) => sum + toCents(r.revenue), 0);
      return {
        run: runInfo(runs),
        totalCustomers,
        totalRevenue: fromCents(totalCents),
        segments: SEGMENTS.map((segment) => {
          const r = bySegment.get(segment);
          return {
            segment,
            customers: r?.customers ?? 0,
            customerShare: share(r?.customers ?? 0, totalCustomers),
            revenue: r?.revenue ?? '0.00',
            revenueShare: share(r ? toCents(r.revenue) : 0, totalCents),
            avgRecencyDays: r?.avg_recency_days ?? null,
            avgOrders: r?.avg_orders ?? null,
            avgSpend: r?.avg_spend ?? null,
          };
        }),
      };
    },

    async segmentCustomers(segment, query) {
      const { rows, total } = await repo.segmentCustomers(segment, query);
      return {
        data: rows.map((r) => ({
          customerId: Number(r.customer_id),
          name: r.first_name ? `${r.first_name} ${r.last_name}` : null,
          email: r.email,
          recencyDays: r.recency_days,
          frequency: r.frequency,
          monetary: r.monetary,
          scores: { r: r.r_score, f: r.f_score, m: r.m_score },
          lastOrderAt: r.last_order_at,
        })),
        pagination: paginationMeta(query, total),
      };
    },

    /** The customer's RFM segment and scores, or null before the first run. */
    async customerSegment(customerId) {
      const r = await repo.customerSegment(customerId);
      if (!r) return null;
      return {
        segment: r.segment,
        scores: { r: r.r_score, f: r.f_score, m: r.m_score },
        recencyDays: r.recency_days,
      };
    },

    async cohorts({ weeks }) {
      const [rows, runs] = await Promise.all([repo.cohorts(weeks), repo.runs()]);
      const cohorts = new Map();
      for (const r of rows) {
        const cohort = cohorts.get(r.cohort_week) ?? {
          cohortWeek: r.cohort_week,
          size: r.cohort_size,
          retention: [],
        };
        cohort.retention.push({
          weekOffset: r.week_offset,
          active: r.active_customers,
          rate: share(r.active_customers, r.cohort_size),
        });
        cohorts.set(r.cohort_week, cohort);
      }
      return { run: runInfo(runs), weeks, cohorts: [...cohorts.values()] };
    },

    async forecast() {
      const [forecastRows, runs] = await Promise.all([repo.forecast(), repo.runs()]);
      const info = runInfo(runs);
      const start = forecastRows[0]?.day ?? new Date().toISOString().slice(0, 10);
      const actual = await repo.actualDaily(start, ACTUAL_DAYS);
      return {
        run: info,
        model: {
          name: 'Weekday-adjusted 28-day moving average',
          trainingDays: runs.ok?.training_days ?? null,
          backtestWape:
            runs.ok?.backtest_wape === null || runs.ok?.backtest_wape === undefined
              ? null
              : Number(runs.ok.backtest_wape),
          skipped: runs.ok?.details?.forecastSkipped ?? null,
        },
        actual: actual.map((r) => ({ day: r.day, revenue: r.revenue })),
        forecast: forecastRows,
      };
    },
  };
}
