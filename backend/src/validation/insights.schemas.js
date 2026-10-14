import { z } from 'zod';

export const productInsightsQuerySchema = z.strictObject({
  days: z.coerce.number().int().min(7).max(366).default(90),
});
