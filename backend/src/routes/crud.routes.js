import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../validation/common.js';

/**
 * Standard resource routes: any signed-in user (admin or analyst) can read,
 * only admins can create, update, or delete.
 */
export function createCrudRouter({ controller, requireAuth, schemas }) {
  const router = Router();
  const adminOnly = requireRole('admin');
  router.use(requireAuth);

  router.get('/', validate({ query: schemas.list }), controller.list);
  router.get('/:id', validate({ params: idParamsSchema }), controller.get);
  router.post('/', adminOnly, validate({ body: schemas.create }), controller.create);
  router.patch(
    '/:id',
    adminOnly,
    validate({ params: idParamsSchema, body: schemas.update }),
    controller.update,
  );
  router.delete('/:id', adminOnly, validate({ params: idParamsSchema }), controller.remove);

  return router;
}
