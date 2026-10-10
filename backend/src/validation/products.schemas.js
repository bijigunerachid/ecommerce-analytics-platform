import { z } from 'zod';
import {
  idSchema,
  listQuerySchema,
  moneySchema,
  optionalDescriptionSchema,
  queryBooleanSchema,
} from './common.js';

// SKUs are normalized to uppercase so "abc-1" and "ABC-1" cannot both exist.
const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9][A-Z0-9_-]{1,39}$/,
        'SKU must be 2-40 characters: letters, digits, "-" or "_"',
      ),
  );

const quantitySchema = z.number().int().min(0).max(1_000_000);

export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'price', 'stockQuantity', 'createdAt'];

export const listProductsQuerySchema = listQuerySchema(PRODUCT_SORT_FIELDS, 'name', {
  categoryId: idSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  lowStock: queryBooleanSchema.optional(),
  minPrice: moneySchema.optional(),
  maxPrice: moneySchema.optional(),
}).refine(
  (q) => q.minPrice === undefined || q.maxPrice === undefined || +q.minPrice <= +q.maxPrice,
  { message: 'minPrice must not exceed maxPrice', path: ['minPrice'] },
);

const productFields = {
  sku: skuSchema,
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: optionalDescriptionSchema,
  categoryId: idSchema,
  price: moneySchema,
  reorderLevel: quantitySchema.default(10),
  isActive: z.boolean().default(true),
};

export const createProductSchema = z.strictObject({
  ...productFields,
  // Recorded as a stock movement, so the inventory ledger accounts for every unit.
  initialStock: quantitySchema.default(0),
});

// Stock is deliberately not updatable here; it changes only through inventory movements and orders.
export const updateProductSchema = z
  .strictObject({
    sku: productFields.sku,
    name: productFields.name,
    description: productFields.description,
    categoryId: productFields.categoryId,
    price: productFields.price,
    reorderLevel: quantitySchema,
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');
