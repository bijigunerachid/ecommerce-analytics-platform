import { ORDER_STATUSES } from '../domain/order-status.js';
import { paginationMeta } from '../db/query-helpers.js';
import { fromCents, toCents } from '../utils/money.js';

const DAY_MS = 86_400_000;

/** Percentage change from previous to current, or null when there is no baseline. */
function change(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** part / whole as a percentage with one decimal, 0 when whole is 0. */
function share(part, whole) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

function previousRange({ from, days }) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(start - days * DAY_MS), to: iso(start - DAY_MS) };
}

/** Derived sales KPIs from summed hourly rows. Money stays exact (integer cents). */
function salesKpis(totals) {
  const grossCents = toCents(totals.gross_revenue);
  const cancelledCents = toCents(totals.cancelled_revenue);
  const netCents = grossCents - cancelledCents;
  const netOrders = totals.orders - totals.cancelled_orders;
  return {
    netRevenue: fromCents(netCents),
    grossRevenue: fromCents(grossCents),
    cancelledRevenue: fromCents(cancelledCents),
    orders: totals.orders,
    cancelledOrders: totals.cancelled_orders,
    netOrders,
    cancellationRate: share(totals.cancelled_orders, totals.orders),
    averageOrderValue: netOrders > 0 ? fromCents(Math.round(netCents / netOrders)) : '0.00',
    itemsSold: totals.items_sold,
  };
}

export function createAnalyticsService({ analyticsRepository: repo }) {
  async function periodKpis(from, to) {
    const [sales, customers] = await Promise.all([
      repo.salesTotals(from, to),
      repo.customerTotals(from, to),
    ]);
    return {
      ...salesKpis(sales),
      newCustomers: customers.new_customers,
      activeCustomers: customers.active_customers,
    };
  }

  return {
    async overview(range) {
      const previous = previousRange(range);
      const [current, prior, dataAsOf] = await Promise.all([
        periodKpis(range.from, range.to),
        periodKpis(previous.from, previous.to),
        repo.dataAsOf(),
      ]);
      const keys = [
        'netRevenue',
        'orders',
        'averageOrderValue',
        'itemsSold',
        'cancellationRate',
        'newCustomers',
        'activeCustomers',
      ];
      return {
        range: { from: range.from, to: range.to, days: range.days },
        previousRange: previous,
        current,
        previous: prior,
        change: Object.fromEntries(keys.map((k) => [k, change(+current[k], +prior[k])])),
        dataAsOf,
      };
    },

    async revenue({ from, to, days, interval }) {
      const [rows, dataAsOf] = await Promise.all([
        repo.revenueSeries(from, to, interval),
        repo.dataAsOf(),
      ]);
      return {
        range: { from, to, days },
        interval,
        series: rows.map((r) => {
          const kpis = salesKpis(r);
          return {
            bucket: r.bucket,
            netRevenue: kpis.netRevenue,
            grossRevenue: kpis.grossRevenue,
            cancelledRevenue: kpis.cancelledRevenue,
            orders: kpis.orders,
            cancelledOrders: kpis.cancelledOrders,
            averageOrderValue: kpis.averageOrderValue,
            itemsSold: kpis.itemsSold,
          };
        }),
        dataAsOf,
      };
    },

    async topProducts({ from, to, days, sortBy, limit }) {
      const [rows, dataAsOf] = await Promise.all([
        repo.topProducts(from, to, { sortBy, limit }),
        repo.dataAsOf(),
      ]);
      return {
        range: { from, to, days },
        sortBy,
        products: rows.map((r) => ({
          productId: Number(r.product_id),
          sku: r.sku,
          name: r.name,
          categoryName: r.category_name,
          unitsSold: r.units,
          revenue: r.revenue,
          orders: r.orders,
          revenueShare: share(Number(r.revenue), Number(r.total_revenue)),
        })),
        dataAsOf,
      };
    },

    async categories({ from, to, days }) {
      const [rows, dataAsOf] = await Promise.all([repo.categories(from, to), repo.dataAsOf()]);
      const totalCents = rows.reduce((sum, r) => sum + toCents(r.revenue), 0);
      return {
        range: { from, to, days },
        categories: rows.map((r) => ({
          categoryId: Number(r.category_id),
          name: r.name,
          revenue: r.revenue,
          unitsSold: r.units,
          productsSold: r.products_sold,
          revenueShare: share(toCents(r.revenue), totalCents),
        })),
        dataAsOf,
      };
    },

    async orderStatus() {
      const [rows, dataAsOf] = await Promise.all([repo.orderStatus(), repo.dataAsOf()]);
      const counts = Object.fromEntries(rows.map((r) => [r.status, r.orders_count]));
      const total = rows.reduce((sum, r) => sum + r.orders_count, 0);
      return {
        total,
        statuses: ORDER_STATUSES.map((status) => ({
          status,
          orders: counts[status] ?? 0,
          share: share(counts[status] ?? 0, total),
        })),
        dataAsOf,
      };
    },

    async customers({ from, to, days, interval, limit }) {
      const [series, summary, top, dataAsOf] = await Promise.all([
        repo.customerSeries(from, to, interval),
        repo.customerSummary(),
        repo.topCustomers(limit),
        repo.dataAsOf(),
      ]);
      return {
        range: { from, to, days },
        interval,
        summary: {
          customersWithOrders: summary.customers_with_orders,
          repeatCustomers: summary.repeat_customers,
          repeatPurchaseRate: share(summary.repeat_customers, summary.customers_with_orders),
          averageRevenuePerCustomer: summary.average_revenue_per_customer,
        },
        series: series.map((r) => ({
          bucket: r.bucket,
          activeCustomers: r.active_customers,
          newCustomers: r.new_customers,
          returningCustomers: Math.max(r.active_customers - r.new_customers, 0),
          orders: r.orders,
        })),
        topCustomers: top.map((r) => ({
          customerId: Number(r.customer_id),
          name: r.first_name ? `${r.first_name} ${r.last_name}` : null,
          email: r.email,
          country: r.country,
          orders: r.orders_count,
          revenue: r.revenue,
          firstOrderAt: r.first_order_at,
          lastOrderAt: r.last_order_at,
        })),
        dataAsOf,
      };
    },

    async inventory({ from, to, days, limit }) {
      const [rows, dataAsOf] = await Promise.all([repo.inventory(from, to), repo.dataAsOf()]);
      const products = rows.map((r) => {
        const dailyOut = r.units_out / days;
        return {
          productId: Number(r.product_id),
          sku: r.sku,
          name: r.name,
          isActive: r.is_active,
          stock: r.stock_quantity,
          reorderLevel: r.reorder_level,
          unitsIn: r.units_in,
          unitsOut: r.units_out,
          averageDailyUnitsOut: Math.round(dailyOut * 100) / 100,
          // How long current stock lasts at the period's sales rate (null if nothing sold).
          daysOfCover: dailyOut > 0 ? Math.round((r.stock_quantity / dailyOut) * 10) / 10 : null,
          sellThroughRate: share(r.units_out, r.units_out + r.stock_quantity),
          isLowStock: r.stock_quantity <= r.reorder_level,
          isOutOfStock: r.stock_quantity === 0,
        };
      });
      const active = products.filter((p) => p.isActive);

      // Most urgent first: out of stock, then fewest days of cover, then low stock.
      const urgency = (p) => (p.isOutOfStock ? -1 : (p.daysOfCover ?? Infinity));
      const ranked = [...active].sort(
        (a, b) => urgency(a) - urgency(b) || b.unitsOut - a.unitsOut || a.productId - b.productId,
      );

      return {
        range: { from, to, days },
        summary: {
          activeProducts: active.length,
          unitsIn: active.reduce((s, p) => s + p.unitsIn, 0),
          unitsOut: active.reduce((s, p) => s + p.unitsOut, 0),
          lowStockProducts: active.filter((p) => p.isLowStock).length,
          outOfStockProducts: active.filter((p) => p.isOutOfStock).length,
          noSalesProducts: active.filter((p) => p.unitsOut === 0).length,
        },
        products: ranked.slice(0, limit),
        dataAsOf,
      };
    },

    async anomalies({ from, to, days, type, severity, page, pageSize }) {
      const [{ rows, counts }, dataAsOf] = await Promise.all([
        repo.anomalies(from, to, { type, severity, page, pageSize }),
        repo.dataAsOf(),
      ]);
      const total = counts.reduce((s, c) => s + c.n, 0);
      const tally = (key) =>
        counts.reduce((acc, c) => ({ ...acc, [c[key]]: (acc[c[key]] ?? 0) + c.n }), {});
      return {
        range: { from, to, days },
        summary: { total, byType: tally('anomaly_type'), bySeverity: tally('severity') },
        data: rows.map((r) => ({
          id: Number(r.id),
          type: r.anomaly_type,
          severity: r.severity,
          entityType: r.entity_type,
          entityId: r.entity_id,
          occurredAt: r.occurred_at,
          detectedAt: r.detected_at,
          description: r.description,
          details: r.details,
        })),
        pagination: paginationMeta({ page, pageSize }, total),
        dataAsOf,
      };
    },
  };
}
