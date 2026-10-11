import { z } from 'zod';
import { dateSchema } from './orders.schemas.js';

const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

const toDate = (s) => new Date(`${s}T00:00:00Z`);
const isoDay = (d) => d.toISOString().slice(0, 10);

/**
 * Inclusive UTC date range. Defaults to the last 30 days, ending today.
 * Adds `days` (length of the range) after validation.
 */
const dateRangeShape = {
  from: dateSchema.optional(),
  to: dateSchema.optional(),
};

function withRange(schema) {
  return schema
    .transform((q) => {
      const to = q.to ?? isoDay(new Date());
      const from = q.from ?? isoDay(new Date(toDate(to).getTime() - 29 * DAY_MS));
      return { ...q, from, to, days: Math.round((toDate(to) - toDate(from)) / DAY_MS) + 1 };
    })
    .refine((q) => q.from <= q.to, { message: 'from must not be after to', path: ['from'] })
    .refine((q) => q.days <= MAX_RANGE_DAYS, {
      message: `Date range may not exceed ${MAX_RANGE_DAYS} days`,
      path: ['from'],
    });
}

export const rangeQuerySchema = withRange(z.strictObject(dateRangeShape));

export const revenueQuerySchema = withRange(
  z.strictObject({
    ...dateRangeShape,
    interval: z.enum(['hour', 'day', 'week']).optional(),
  }),
)
  .transform((q) => ({
    ...q,
    // Sensible default granularity for the range length.
    interval: q.interval ?? (q.days <= 2 ? 'hour' : q.days <= 92 ? 'day' : 'week'),
  }))
  .refine((q) => q.interval !== 'hour' || q.days <= 31, {
    message: 'Hourly data is limited to ranges of 31 days or less',
    path: ['interval'],
  });

export const topProductsQuerySchema = withRange(
  z.strictObject({
    ...dateRangeShape,
    sortBy: z.enum(['revenue', 'units']).default('revenue'),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
);

export const customersQuerySchema = withRange(
  z.strictObject({
    ...dateRangeShape,
    interval: z.enum(['day', 'week']).default('day'),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
);

export const inventoryQuerySchema = withRange(
  z.strictObject({
    ...dateRangeShape,
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
);

export const ANOMALY_TYPES = [
  'high_value_order',
  'order_velocity',
  'revenue_spike',
  'large_stock_reduction',
];

export const anomaliesQuerySchema = withRange(
  z.strictObject({
    ...dateRangeShape,
    type: z.enum(ANOMALY_TYPES).optional(),
    severity: z.enum(['low', 'medium', 'high']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
);
