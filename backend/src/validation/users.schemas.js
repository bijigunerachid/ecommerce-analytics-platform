import { z } from 'zod';
import { ROLES, emailSchema, newPasswordSchema } from './common.js';

export const createUserSchema = z.strictObject({
  email: emailSchema,
  password: newPasswordSchema,
  fullName: z.string().trim().min(1, 'Full name is required').max(100),
  role: z.enum(ROLES),
});

const fullNameSchema = z.string().trim().min(1, 'Full name is required').max(100);

export const updateUserSchema = z
  .strictObject({
    fullName: fullNameSchema.optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to change');

export const resetPasswordSchema = z.strictObject({
  password: newPasswordSchema,
});
