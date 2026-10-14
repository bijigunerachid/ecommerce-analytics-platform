import { paginate, WhereBuilder } from '../db/query-helpers.js';

// Reads the results of the Spark insights job (segments, cohorts, forecast) and its run log.

export function createPredictiveRepository(db) {
  return {
    /** The latest successful run and the latest run of any kind (to report failures). */
    async runs() {
      const { rows } = await db.query(
        `(SELECT *, to_char(as_of, 'YYYY-MM-DD') AS as_of_day FROM analytics_insights_runs WHERE status = 'ok'
          ORDER BY finished_at DESC, id DESC LIMIT 1)
         UNION ALL
         (SELECT *, to_char(as_of, 'YYYY-MM-DD') AS as_of_day FROM analytics_insights_runs ORDER BY finished_at DESC, id DESC LIMIT 1)`,
      );
      const ok = rows.find((r) => r.status === 'ok') ?? null;
      const latest = rows.at(-1) ?? null;
      return { ok, latest };
    },

    async segmentSummary() {
      const { rows } = await db.query(
        `SELECT segment,
                count(*)::int AS customers,
                sum(monetary)::text AS revenue,
                round(avg(recency_days), 1)::float AS avg_recency_days,
                round(avg(frequency), 2)::float AS avg_orders,
                round(avg(monetary), 2)::text AS avg_spend
         FROM analytics_customer_segments
         GROUP BY segment`,
      );
      return rows;
    },

    async segmentCustomers(segment, { page, pageSize }) {
      const where = new WhereBuilder();
      where.add((p) => `s.segment = ${p(segment)}`);
      const { rows: count } = await db.query(
        `SELECT count(*)::int AS total FROM analytics_customer_segments s ${where.toSql()}`,
        where.params,
      );
      const { rows } = await db.query(
        `SELECT s.*, c.first_name, c.last_name, c.email
         FROM analytics_customer_segments s
         LEFT JOIN customers c ON c.id = s.customer_id
         ${where.toSql()}
         ORDER BY s.monetary DESC, s.customer_id
         ${paginate(where, { page, pageSize })}`,
        where.params,
      );
      return { rows, total: count[0].total };
    },

    async customerSegment(customerId) {
      const { rows } = await db.query(
        'SELECT * FROM analytics_customer_segments WHERE customer_id = $1',
        [customerId],
      );
      return rows[0] ?? null;
    },

    async cohorts(weeks) {
      const { rows } = await db.query(
        `SELECT to_char(cohort_week, 'YYYY-MM-DD') AS cohort_week, week_offset, cohort_size,
                active_customers
         FROM analytics_cohort_retention
         WHERE cohort_week >= (SELECT max(cohort_week) FROM analytics_cohort_retention)
                              - make_interval(weeks => $1 - 1)
           AND week_offset < $1
         ORDER BY cohort_week, week_offset`,
        [weeks],
      );
      return rows;
    },

    async forecast() {
      const { rows } = await db.query(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, forecast::text, lower::text, upper::text
         FROM analytics_sales_forecast ORDER BY day`,
      );
      return rows;
    },

    /** Net revenue per UTC day from the streaming aggregates, for the days before `before`. */
    async actualDaily(before, days) {
      const { rows } = await db.query(
        `SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
                coalesce(sum(s.gross_revenue - s.cancelled_revenue), 0)::numeric(14,2)::text AS revenue
         FROM generate_series($1::date - make_interval(days => $2), $1::date - 1, interval '1 day') d
         LEFT JOIN analytics_sales_hourly s
           ON s.bucket_start >= d AT TIME ZONE 'UTC'
          AND s.bucket_start < (d + interval '1 day') AT TIME ZONE 'UTC'
         GROUP BY d ORDER BY d`,
        [before, days],
      );
      return rows;
    },
  };
}
