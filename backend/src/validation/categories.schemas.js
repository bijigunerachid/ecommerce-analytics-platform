import { z } from 'zod';
import { listQuerySchema, optionalDescriptionSchema } from './common.js';

const nameSchema = z.string().trim().min(1, 'Name is required').max(100);

export const CATEGORY_SORT_FIELDS = ['name', 'createdAt', 'productCount'];

export const listCategoriesQuerySchema = listQuerySchema(CATEGORY_SORT_FIELDS, 'name');

export const createCategorySchema = z.strictObject({
  name: nameSchema,
  description: optionalDescriptionSchema,
});

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');
