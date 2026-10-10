import { z } from 'zod';
import { ROLES, emailSchema, newPasswordSchema } from './common.js';

export const createUserSchema = z.strictObject({
  email: emailSchema,
  password: newPasswordSchema,
  fullName: z.string().trim().min(1, 'Full name is required').max(100),
  role: z.enum(ROLES),
});
