import { z } from 'zod';
import { idSchema, listQuerySchema } from './common.js';
import { dateRangeRefinement, dateSchema } from './orders.schemas.js';

export const MOVEMENT_REASONS = ['order', 'restock', 'adjustment', 'cancellation'];

export const listMovementsQuerySchema = z
  .strictObject({
    ...listQuerySchema(['createdAt', 'quantityChange'], 'createdAt').shape,
    order: z.enum(['asc', 'desc']).default('desc'),
    productId: idSchema.optional(),
    orderId: idSchema.optional(),
    reason: z.enum(MOVEMENT_REASONS).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
  })
  .omit({ search: true })
  .refine(...dateRangeRefinement);

// Manual stock changes. 'order' and 'cancellation' movements are created only by the order flow.
export const createAdjustmentSchema = z
  .strictObject({
    productId: idSchema,
    quantityChange: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((n) => n !== 0, 'quantityChange must not be zero'),
    reason: z.enum(['restock', 'adjustment']),
    note: z.string().trim().max(500).optional(),
  })
  .refine((a) => a.reason !== 'restock' || a.quantityChange > 0, {
    message: 'A restock must add stock (positive quantityChange)',
    path: ['quantityChange'],
  });
