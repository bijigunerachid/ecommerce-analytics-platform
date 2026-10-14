import { notFound } from '../utils/http-error.js';
import { fromCents, toCents } from '../utils/money.js';

const DAY_MS = 86_400_000;

// Customer segments, from simple and explainable rules (see docs/api.md):
export const LAPSED_AFTER_DAYS = 90;
export const LOYAL_MIN_ORDERS = 4;

/** prospect | new | returning | loyal | lapsed */
export function customerSegment({ netOrders, lastOrderAt }, now = new Date()) {
  if (netOrders === 0) return 'prospect';
  if (now - new Date(lastOrderAt) > LAPSED_AFTER_DAYS * DAY_MS) return 'lapsed';
  if (netOrders >= LOYAL_MIN_ORDERS) return 'loyal';
  return netOrders >= 2 ? 'returning' : 'new';
}

// Restocking: sales rate over the last 30 days, and a target of 30 days of sales on top of the
// product's reorder level (its safety stock).
export const SALES_RATE_DAYS = 30;
export const COVER_TARGET_DAYS = 30;

/**
 * @param {{ stock: number, reorderLevel: number, recentUnits: number }} input
 *   recentUnits = units sold in the last SALES_RATE_DAYS days
 */
export function restockAdvice({ stock, reorderLevel, recentUnits }) {
  const dailyUnits = recentUnits / SALES_RATE_DAYS;
  const daysOfCover = dailyUnits > 0 ? Math.round((stock / dailyUnits) * 10) / 10 : null;
  const target = Math.ceil(dailyUnits * COVER_TARGET_DAYS) + reorderLevel;
  const suggestedQuantity = Math.max(0, target - stock);
  return {
    dailyUnits: Math.round(dailyUnits * 100) / 100,
    daysOfCover,
    targetStock: target,
    suggestedQuantity,
    needsRestock: stock <= reorderLevel || (daysOfCover !== null && daysOfCover < 14),
  };
}

export function createInsightsService({
  predictiveService,
  insightsRepository,
  customersRepository,
  productsRepository,
}) {
  return {
    async customer(id, now = new Date()) {
      const customer = await customersRepository.findById(id);
      if (!customer) throw notFound('Customer not found');
      const [totals, monthly, topProducts, valueSegment] = await Promise.all([
        insightsRepository.customerTotals(id),
        insightsRepository.customerMonthly(id),
        insightsRepository.customerTopProducts(id),
        predictiveService?.customerSegment(id) ?? null,
      ]);
      const netOrders = totals.orders - totals.cancelledOrders;
      const spentCents = toCents(totals.spent);
      return {
        customerId: id,
        segment: customerSegment({ netOrders, lastOrderAt: totals.lastOrderAt }, now),
        orders: totals.orders,
        cancelledOrders: totals.cancelledOrders,
        netOrders,
        lifetimeValue: fromCents(spentCents),
        averageOrderValue: netOrders > 0 ? fromCents(Math.round(spentCents / netOrders)) : null,
        firstOrderAt: totals.firstOrderAt,
        lastOrderAt: totals.lastOrderAt,
        monthly,
        topProducts,
        // RFM segment from the Spark insights job (null until it has run).
        valueSegment,
      };
    },

    async product(id, { days }) {
      const product = await productsRepository.findById(id);
      if (!product) throw notFound('Product not found');
      const daily = await insightsRepository.productDaily(id, Math.max(days, SALES_RATE_DAYS));
      const recent = daily.slice(-SALES_RATE_DAYS);
      const shown = daily.slice(-days);
      const revenueCents = shown.reduce((sum, d) => sum + toCents(d.revenue), 0);
      return {
        productId: id,
        range: { days, from: shown[0]?.day ?? null, to: shown.at(-1)?.day ?? null },
        unitsSold: shown.reduce((sum, d) => sum + d.units, 0),
        revenue: fromCents(revenueCents),
        orders: shown.reduce((sum, d) => sum + d.orders, 0),
        stock: product.stockQuantity,
        reorderLevel: product.reorderLevel,
        restock: restockAdvice({
          stock: product.stockQuantity,
          reorderLevel: product.reorderLevel,
          recentUnits: recent.reduce((sum, d) => sum + d.units, 0),
        }),
        daily: shown,
      };
    },
  };
}
