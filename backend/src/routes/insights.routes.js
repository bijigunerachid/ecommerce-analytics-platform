import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../validation/common.js';
import { productInsightsQuerySchema } from '../validation/insights.schemas.js';

/**
 * Read-only figures for one customer or product (any signed-in role). Mounted on the API
 * root, so authentication is applied per route rather than to every request.
 */
export function createInsightsRouter({ insightsController, requireAuth }) {
  const router = Router();
  router.get(
    '/customers/:id/insights',
    requireAuth,
    validate({ params: idParamsSchema }),
    insightsController.customer,
  );
  router.get(
    '/products/:id/insights',
    requireAuth,
    validate({ params: idParamsSchema, query: productInsightsQuerySchema }),
    insightsController.product,
  );
  return router;
}
