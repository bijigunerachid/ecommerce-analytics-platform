import { z } from 'zod';

export const listNotificationsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const activityQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
