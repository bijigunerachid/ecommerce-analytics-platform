// Read-only queries over the analytics tables maintained by the Spark streaming job
// (see docs/analytics.md). Date ranges are inclusive calendar days in UTC.
//
// Bucketing is done on UTC "wall clock" timestamps and converted back to timestamptz before
// returning, so results never depend on the database or Node.js time zone.

// $1 = from (YYYY-MM-DD), $2 = to (YYYY-MM-DD): range start/end as timestamptz.
const RANGE_START = `(($1::date)::timestamp AT TIME ZONE 'UTC')`;
const RANGE_END = `((($2::date) + 1)::timestamp AT TIME ZONE 'UTC')`;

export function createAnalyticsRepository(db) {
  return {
    async dataAsOf() {
      const { rows } = await db.query(
        'SELECT max(processed_at) AS as_of FROM analytics_stream_batches',
      );
      return rows[0].as_of;
    },

    async salesTotals(from, to) {
      const { rows } = await db.query(
        `SELECT coalesce(sum(orders_count), 0)::int        AS orders,
                coalesce(sum(cancelled_orders), 0)::int    AS cancelled_orders,
                coalesce(sum(gross_revenue), 0)::numeric(14,2)     AS gross_revenue,
                coalesce(sum(cancelled_revenue), 0)::numeric(14,2) AS cancelled_revenue,
                coalesce(sum(items_sold), 0)::int          AS items_sold
         FROM analytics_sales_hourly
         WHERE bucket_start >= ${RANGE_START} AND bucket_start < ${RANGE_END}`,
        [from, to],
      );
      return rows[0];
    },

    async customerTotals(from, to) {
      const { rows } = await db.query(
        `SELECT
           (SELECT count(*)::int FROM analytics_customers
             WHERE first_order_at >= ${RANGE_START} AND first_order_at < ${RANGE_END})
             AS new_customers,
           (SELECT count(DISTINCT customer_id)::int FROM analytics_processed_events
             WHERE event_type = 'order.created'
               AND occurred_at >= ${RANGE_START} AND occurred_at < ${RANGE_END})
             AS active_customers`,
        [from, to],
      );
      return rows[0];
    },

    async revenueSeries(from, to, interval) {
      const { rows } = await db.query(
        `WITH buckets AS (
           SELECT b FROM generate_series(
             date_trunc($3, ($1::date)::timestamp),
             (($2::date) + 1)::timestamp - interval '1 second',
             ('1 ' || $3)::interval) AS b
         )
         SELECT buckets.b AT TIME ZONE 'UTC'                         AS bucket,
                coalesce(sum(h.orders_count), 0)::int                AS orders,
                coalesce(sum(h.cancelled_orders), 0)::int            AS cancelled_orders,
                coalesce(sum(h.gross_revenue), 0)::numeric(14,2)     AS gross_revenue,
                coalesce(sum(h.cancelled_revenue), 0)::numeric(14,2) AS cancelled_revenue,
                coalesce(sum(h.items_sold), 0)::int                  AS items_sold
         FROM buckets
         LEFT JOIN analytics_sales_hourly h
           ON date_trunc($3, h.bucket_start AT TIME ZONE 'UTC') = buckets.b
          AND h.bucket_start >= ${RANGE_START} AND h.bucket_start < ${RANGE_END}
         GROUP BY buckets.b
         ORDER BY buckets.b`,
        [from, to, interval],
      );
      return rows;
    },

    async topProducts(from, to, { sortBy, limit }) {
      const orderBy = sortBy === 'units' ? 'units DESC, revenue DESC' : 'revenue DESC, units DESC';
      const { rows } = await db.query(
        `SELECT pd.product_id,
                coalesce(p.sku, max(pd.sku))           AS sku,
                p.name                                 AS name,
                c.name                                 AS category_name,
                sum(pd.units_sold)::int                AS units,
                sum(pd.revenue)::numeric(14,2)         AS revenue,
                sum(pd.orders_count)::int              AS orders,
                sum(sum(pd.revenue)) OVER ()           AS total_revenue
         FROM analytics_product_daily pd
         LEFT JOIN products p ON p.id = pd.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE pd.day BETWEEN $1::date AND $2::date
         GROUP BY pd.product_id, p.sku, p.name, c.name
         ORDER BY ${orderBy}, pd.product_id
         LIMIT $3`,
        [from, to, limit],
      );
      return rows;
    },

    async categories(from, to) {
      const { rows } = await db.query(
        `SELECT pd.category_id,
                c.name                          AS name,
                sum(pd.units_sold)::int         AS units,
                sum(pd.revenue)::numeric(14,2)  AS revenue,
                count(DISTINCT pd.product_id)::int AS products_sold
         FROM analytics_product_daily pd
         LEFT JOIN categories c ON c.id = pd.category_id
         WHERE pd.day BETWEEN $1::date AND $2::date
         GROUP BY pd.category_id, c.name
         ORDER BY revenue DESC, pd.category_id`,
        [from, to],
      );
      return rows;
    },

    async orderStatus() {
      const { rows } = await db.query(
        'SELECT status, orders_count FROM analytics_order_status WHERE orders_count > 0',
      );
      return rows;
    },

    async customerSeries(from, to, interval) {
      const { rows } = await db.query(
        `WITH buckets AS (
           SELECT b FROM generate_series(
             date_trunc($3, ($1::date)::timestamp),
             (($2::date) + 1)::timestamp - interval '1 second',
             ('1 ' || $3)::interval) AS b
         ),
         active AS (
           SELECT date_trunc($3, occurred_at AT TIME ZONE 'UTC') AS b,
                  count(DISTINCT customer_id)::int AS customers,
                  count(*)::int AS orders
           FROM analytics_processed_events
           WHERE event_type = 'order.created'
             AND occurred_at >= ${RANGE_START} AND occurred_at < ${RANGE_END}
           GROUP BY 1
         ),
         newcomers AS (
           SELECT date_trunc($3, first_order_at AT TIME ZONE 'UTC') AS b, count(*)::int AS customers
           FROM analytics_customers
           WHERE first_order_at >= ${RANGE_START} AND first_order_at < ${RANGE_END}
           GROUP BY 1
         )
         SELECT buckets.b AT TIME ZONE 'UTC'   AS bucket,
                coalesce(active.customers, 0)  AS active_customers,
                coalesce(newcomers.customers, 0) AS new_customers,
                coalesce(active.orders, 0)     AS orders
         FROM buckets
         LEFT JOIN active ON active.b = buckets.b
         LEFT JOIN newcomers ON newcomers.b = buckets.b
         ORDER BY buckets.b`,
        [from, to, interval],
      );
      return rows;
    },

    async customerSummary() {
      const { rows } = await db.query(
        `SELECT count(*) FILTER (WHERE orders_count > 0)::int  AS customers_with_orders,
                count(*) FILTER (WHERE orders_count > 1)::int  AS repeat_customers,
                coalesce(avg(revenue) FILTER (WHERE orders_count > 0), 0)::numeric(14,2)
                  AS average_revenue_per_customer
         FROM analytics_customers`,
      );
      return rows[0];
    },

    async topCustomers(limit) {
      const { rows } = await db.query(
        `SELECT ac.customer_id, c.first_name, c.last_name, c.email, c.country,
                ac.orders_count, ac.revenue, ac.first_order_at, ac.last_order_at
         FROM analytics_customers ac
         LEFT JOIN customers c ON c.id = ac.customer_id
         WHERE ac.orders_count > 0
         ORDER BY ac.revenue DESC, ac.customer_id
         LIMIT $1`,
        [limit],
      );
      return rows;
    },

    /** Per-product stock flow in the range, joined with current stock levels. */
    async inventory(from, to) {
      const { rows } = await db.query(
        `SELECT p.id AS product_id, p.sku, p.name, p.stock_quantity, p.reorder_level, p.is_active,
                coalesce(sum(i.units_in), 0)::int  AS units_in,
                coalesce(sum(i.units_out), 0)::int AS units_out
         FROM products p
         LEFT JOIN analytics_inventory_daily i
           ON i.product_id = p.id AND i.day BETWEEN $1::date AND $2::date
         GROUP BY p.id`,
        [from, to],
      );
      return rows;
    },

    async anomalies(from, to, { type, severity, page, pageSize }) {
      const params = [from, to];
      const filters = [`occurred_at >= ${RANGE_START}`, `occurred_at < ${RANGE_END}`];
      if (type) {
        params.push(type);
        filters.push(`anomaly_type = $${params.length}`);
      }
      if (severity) {
        params.push(severity);
        filters.push(`severity = $${params.length}`);
      }
      const where = `WHERE ${filters.join(' AND ')}`;

      const { rows: counts } = await db.query(
        `SELECT anomaly_type, severity, count(*)::int AS n
         FROM analytics_anomalies ${where} GROUP BY 1, 2`,
        params,
      );
      const { rows } = await db.query(
        `SELECT id, anomaly_type, severity, entity_type, entity_id, occurred_at, detected_at,
                description, details
         FROM analytics_anomalies ${where}
         ORDER BY occurred_at DESC, id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { rows, counts };
    },
  };
}
