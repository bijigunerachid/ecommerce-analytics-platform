import { z } from 'zod';

// Emails are trimmed and lowercased before they reach the database (users_email_lowercase).
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Must be a valid email address' }).max(254));

// bcrypt only uses the first 72 bytes of a password, so longer ones are rejected outright.
export const newPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes');

export const ROLES = ['admin', 'analyst'];
