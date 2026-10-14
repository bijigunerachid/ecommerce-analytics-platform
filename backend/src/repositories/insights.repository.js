// Per-customer and per-product figures, computed from the system of record (orders, order
// items, and the stock ledger). Cancelled orders are excluded from spend and sales. Days and
// months are UTC; bucket times are returned as timestamptz (never naive timestamps).

const MONTHS_SHOWN = 12;

export function createInsightsRepository(db) {
  return {
    async customerTotals(customerId) {
      const { rows } = await db.query(
        `SELECT count(*)::int AS orders,
                count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
                coalesce(sum(total_amount) FILTER (WHERE status <> 'cancelled'), 0)::text AS spent,
                min(created_at) AS first_order_at,
                max(created_at) AS last_order_at
         FROM orders WHERE customer_id = $1`,
        [customerId],
      );
      const r = rows[0];
      return {
        orders: r.orders,
        cancelledOrders: r.cancelled_orders,
        spent: r.spent,
        firstOrderAt: r.first_order_at,
        lastOrderAt: r.last_order_at,
      };
    },

    /** Spend and order count per calendar month (UTC) for the last 12 months, gaps as zero. */
    async customerMonthly(customerId) {
      const { rows } = await db.query(
        `WITH months AS (
           SELECT generate_series(
             date_trunc('month', now() AT TIME ZONE 'UTC') - make_interval(months => $2 - 1),
             date_trunc('month', now() AT TIME ZONE 'UTC'),
             interval '1 month') AS month
         )
         SELECT m.month AT TIME ZONE 'UTC' AS month,
                count(o.id)::int AS orders,
                coalesce(sum(o.total_amount), 0)::text AS spent
         FROM months m
         LEFT JOIN orders o
           ON o.customer_id = $1 AND o.status <> 'cancelled'
          AND o.created_at >= m.month AT TIME ZONE 'UTC'
          AND o.created_at < (m.month + interval '1 month') AT TIME ZONE 'UTC'
         GROUP BY m.month
         ORDER BY m.month`,
        [customerId, MONTHS_SHOWN],
      );
      return rows.map((r) => ({ month: r.month, orders: r.orders, spent: r.spent }));
    },

    /** The customer's most-bought products by spend (non-cancelled orders). */
    async customerTopProducts(customerId, limit = 5) {
      const { rows } = await db.query(
        `SELECT p.id, p.sku, p.name,
                sum(i.quantity)::int AS units,
                sum(i.line_total)::text AS spent
         FROM orders o
         JOIN order_items i ON i.order_id = o.id
         JOIN products p ON p.id = i.product_id
         WHERE o.customer_id = $1 AND o.status <> 'cancelled'
         GROUP BY p.id
         ORDER BY sum(i.line_total) DESC, p.id
         LIMIT $2`,
        [customerId, limit],
      );
      return rows.map((r) => ({
        productId: Number(r.id),
        sku: r.sku,
        name: r.name,
        units: r.units,
        spent: r.spent,
      }));
    },

    /**
     * Units and revenue per UTC day for the last `days` days (today included), and the stock
     * level at the end of each day, reconstructed from the ledger backwards from today's stock.
     */
    async productDaily(productId, days) {
      const { rows } = await db.query(
        `WITH days AS (
           SELECT generate_series(
             date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => $2 - 1),
             date_trunc('day', now() AT TIME ZONE 'UTC'),
             interval '1 day') AS day
         ),
         sales AS (
           SELECT date_trunc('day', o.created_at AT TIME ZONE 'UTC') AS day,
                  sum(i.quantity)::int AS units,
                  sum(i.line_total) AS revenue,
                  count(DISTINCT o.id)::int AS orders
           FROM order_items i
           JOIN orders o ON o.id = i.order_id
           WHERE i.product_id = $1 AND o.status <> 'cancelled'
             AND o.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC')
                                  - make_interval(days => $2 - 1)) AT TIME ZONE 'UTC'
           GROUP BY 1
         )
         SELECT d.day AT TIME ZONE 'UTC' AS day,
                coalesce(s.units, 0) AS units,
                coalesce(s.revenue, 0)::text AS revenue,
                coalesce(s.orders, 0) AS orders,
                CASE
                  -- No stock level for days that ended before the product existed.
                  WHEN (d.day + interval '1 day') AT TIME ZONE 'UTC' <= p.created_at THEN NULL
                  ELSE p.stock_quantity - coalesce((
                    SELECT sum(m.quantity_change) FROM stock_movements m
                    WHERE m.product_id = p.id
                      AND m.created_at >= (d.day + interval '1 day') AT TIME ZONE 'UTC'
                  ), 0)::int
                END AS stock_end
         FROM days d
         CROSS JOIN products p
         LEFT JOIN sales s ON s.day = d.day
         WHERE p.id = $1
         ORDER BY d.day`,
        [productId, days],
      );
      return rows.map((r) => ({
        day: r.day,
        units: r.units,
        revenue: r.revenue,
        orders: r.orders,
        stockEnd: r.stock_end,
      }));
    },
  };
}
