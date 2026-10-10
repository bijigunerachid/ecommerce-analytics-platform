import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { requireIdempotencyKey } from '../middleware/idempotency-key.js';
import { validate } from '../middleware/validate.js';
import {
  createAdjustmentSchema,
  listMovementsQuerySchema,
} from '../validation/inventory.schemas.js';

export function createInventoryRouter({ inventoryController, requireAuth }) {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/movements',
    validate({ query: listMovementsQuerySchema }),
    inventoryController.listMovements,
  );
  router.post(
    '/adjustments',
    requireRole('admin'),
    requireIdempotencyKey,
    validate({ body: createAdjustmentSchema }),
    inventoryController.adjust,
  );

  return router;
}
