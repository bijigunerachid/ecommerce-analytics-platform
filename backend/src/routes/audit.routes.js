import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listAuditQuerySchema } from '../validation/audit.schemas.js';

// The audit log is admin-only and read-only (the table itself is append-only).
export function createAuditRouter({ auditController, requireAuth }) {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));
  router.get('/', validate({ query: listAuditQuerySchema }), auditController.list);
  return router;
}
