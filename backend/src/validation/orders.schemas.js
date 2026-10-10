import { z } from 'zod';
import { ORDER_STATUSES } from '../domain/order-status.js';
import { idSchema, listQuerySchema, moneySchema } from './common.js';

// Calendar dates (YYYY-MM-DD, interpreted in UTC). dateTo is inclusive.
export const dateSchema = z.iso.date({ message: 'Must be a date in YYYY-MM-DD format' });

export const dateRangeRefinement = [
  (q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo,
  { message: 'dateFrom must not be after dateTo', path: ['dateFrom'] },
];

export const createOrderSchema = z.strictObject({
  customerId: idSchema,
  items: z
    .array(
      z.strictObject({
        productId: idSchema,
        quantity: z.number().int().min(1).max(10_000),
      }),
    )
    .min(1, 'An order needs at least one item')
    .max(100)
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      'Each product may appear only once; combine quantities instead',
    ),
  // Note: prices and totals are intentionally NOT accepted from the client.
});

export const updateOrderStatusSchema = z.strictObject({
  status: z.enum(ORDER_STATUSES),
});

export const ORDER_SORT_FIELDS = ['createdAt', 'totalAmount', 'status'];

export const listOrdersQuerySchema = listQuerySchema(ORDER_SORT_FIELDS, 'createdAt', {
  order: z.enum(['asc', 'desc']).default('desc'), // newest first by default
  status: z.enum(ORDER_STATUSES).optional(),
  customerId: idSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  minTotal: moneySchema.optional(),
  maxTotal: moneySchema.optional(),
}).refine(...dateRangeRefinement);
