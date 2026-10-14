import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../validation/common.js';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from '../validation/users.schemas.js';

// User management is admin-only.
export function createUsersRouter({ usersController, requireAuth }) {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/', usersController.list);
  router.post('/', validate({ body: createUserSchema }), usersController.create);
  router.patch(
    '/:id',
    validate({ params: idParamsSchema, body: updateUserSchema }),
    usersController.update,
  );
  router.post(
    '/:id/password',
    validate({ params: idParamsSchema, body: resetPasswordSchema }),
    usersController.resetPassword,
  );

  return router;
}
