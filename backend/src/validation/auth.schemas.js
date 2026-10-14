import { z } from 'zod';
import { emailSchema, newPasswordSchema } from './common.js';

export const loginSchema = z.strictObject({
  email: emailSchema,
  // Login only checks presence/size; strength rules apply when passwords are set.
  password: z.string().min(1, 'Password is required').max(200),
});

export const updateProfileSchema = z.strictObject({
  fullName: z.string().trim().min(1, 'Full name is required').max(100),
});

export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  newPassword: newPasswordSchema,
});
