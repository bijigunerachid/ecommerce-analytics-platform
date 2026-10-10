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

// Database ids are bigint identity values; route params arrive as strings.
export const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const idParamsSchema = z.strictObject({ id: idSchema });

// Money is exchanged as a decimal string (e.g. "19.99") so no precision is lost to floating point.
// Numbers are accepted for convenience and converted.
export const moneySchema = z
  .union([z.string().trim(), z.number().nonnegative()])
  .transform(String)
  .pipe(
    z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Must be a non-negative amount with at most 2 decimals'),
  );

// Query strings only carry strings: "true"/"false" must be parsed explicitly
// (z.coerce.boolean would treat "false" as true).
export const queryBooleanSchema = z
  .enum(['true', 'false'], { message: 'Must be "true" or "false"' })
  .transform((v) => v === 'true');

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v));

export const optionalDescriptionSchema = optionalText(2000).nullable().optional();

/**
 * Standard list query: pagination, sorting by an allow-listed field, and free-text search.
 * @param {string[]} sortFields - fields clients may sort by (mapped to SQL in the repository)
 * @param {string} defaultSort
 */
export function listQuerySchema(sortFields, defaultSort, extraShape = {}) {
  return z.strictObject({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(sortFields).default(defaultSort),
    order: z.enum(['asc', 'desc']).default('asc'),
    search: z.string().trim().max(100).optional(),
    ...extraShape,
  });
}
