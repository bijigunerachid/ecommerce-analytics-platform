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

// Optional reason recorded in the status history (e.g. "Customer asked to cancel").
const statusNoteSchema = z
  .string()
  .trim()
  .min(1, 'Note must not be empty')
  .max(500, 'Note must be at most 500 characters')
  .optional();

export const updateOrderStatusSchema = z.strictObject({
  status: z.enum(ORDER_STATUSES),
  note: statusNoteSchema,
});

export const bulkUpdateOrderStatusSchema = z.strictObject({
  orderIds: z
    .array(idSchema)
    .min(1, 'Select at least one order')
    .max(100, 'At most 100 orders can be changed at once'),
  status: z.enum(ORDER_STATUSES),
  note: statusNoteSchema,
});

export const createOrderNoteSchema = z.strictObject({
  body: z
    .string()
    .trim()
    .min(1, 'Note must not be empty')
    .max(2000, 'Note must be at most 2000 characters'),
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
