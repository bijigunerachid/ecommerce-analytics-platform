import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { requireIdempotencyKey } from '../middleware/idempotency-key.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../validation/common.js';
import {
  bulkUpdateOrderStatusSchema,
  createOrderNoteSchema,
  createOrderSchema,
  listOrdersQuerySchema,
  updateOrderStatusSchema,
} from '../validation/orders.schemas.js';

// Orders are never deleted (they are financial records); they are cancelled instead.
export function createOrdersRouter({ ordersController, requireAuth }) {
  const router = Router();
  const adminOnly = requireRole('admin');
  router.use(requireAuth);

  router.get('/', validate({ query: listOrdersQuerySchema }), ordersController.list);
  router.get('/:id', validate({ params: idParamsSchema }), ordersController.get);
  router.get('/:id/history', validate({ params: idParamsSchema }), ordersController.history);
  router.get('/:id/notes', validate({ params: idParamsSchema }), ordersController.notes);
  router.post(
    '/:id/notes',
    adminOnly,
    validate({ params: idParamsSchema, body: createOrderNoteSchema }),
    ordersController.addNote,
  );
  router.post(
    '/bulk-status',
    adminOnly,
    validate({ body: bulkUpdateOrderStatusSchema }),
    ordersController.bulkUpdateStatus,
  );
  router.post(
    '/',
    adminOnly,
    requireIdempotencyKey,
    validate({ body: createOrderSchema }),
    ordersController.create,
  );
  router.patch(
    '/:id/status',
    adminOnly,
    validate({ params: idParamsSchema, body: updateOrderStatusSchema }),
    ordersController.updateStatus,
  );

  return router;
}
