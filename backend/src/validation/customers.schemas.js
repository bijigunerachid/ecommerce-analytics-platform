import { z } from 'zod';
import { emailSchema, listQuerySchema } from './common.js';

const optionalShortText = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const phoneSchema = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .pipe(
    z
      .string()
      .regex(/^\+?[0-9 ()-]{5,20}$/, 'Phone may contain digits, spaces, "+", "(", ")", "-"')
      .nullable(),
  )
  .nullable()
  .optional();

const customerFields = {
  email: emailSchema,
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  phone: phoneSchema,
  city: optionalShortText,
  country: optionalShortText,
};

export const CUSTOMER_SORT_FIELDS = ['name', 'email', 'createdAt', 'orderCount', 'totalSpent'];

export const listCustomersQuerySchema = listQuerySchema(CUSTOMER_SORT_FIELDS, 'name', {
  country: z.string().trim().min(1).max(100).optional(),
});

export const createCustomerSchema = z.strictObject(customerFields);

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');
