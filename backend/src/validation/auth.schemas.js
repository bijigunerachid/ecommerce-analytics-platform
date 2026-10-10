import { z } from 'zod';
import { emailSchema } from './common.js';

export const loginSchema = z.strictObject({
  email: emailSchema,
  // Login only checks presence/size; strength rules apply when passwords are set.
  password: z.string().min(1, 'Password is required').max(200),
});
