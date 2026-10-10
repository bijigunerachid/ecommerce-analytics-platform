import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createUserSchema } from '../validation/users.schemas.js';

// User management is admin-only.
export function createUsersRouter({ usersController, requireAuth }) {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/', usersController.list);
  router.post('/', validate({ body: createUserSchema }), usersController.create);

  return router;
}
