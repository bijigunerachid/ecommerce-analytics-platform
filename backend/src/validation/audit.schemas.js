import { z } from 'zod';
import { idSchema } from './common.js';
import { dateRangeRefinement, dateSchema } from './orders.schemas.js';

export const listAuditQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    action: z
      .string()
      .regex(/^[a-z_]+\.[a-z_]+$/, 'Unknown action')
      .optional(),
    actorId: idSchema.optional(),
    entityType: z
      .string()
      .regex(/^[a-z_]+$/)
      .optional(),
    entityId: z.string().max(40).optional(),
    search: z.string().trim().max(100).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
  })
  .refine(...dateRangeRefinement);
