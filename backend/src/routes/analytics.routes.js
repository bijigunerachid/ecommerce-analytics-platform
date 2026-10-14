import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  anomaliesQuerySchema,
  cohortsQuerySchema,
  customersQuerySchema,
  inventoryQuerySchema,
  rangeQuerySchema,
  revenueQuerySchema,
  segmentCustomersQuerySchema,
  segmentParamsSchema,
  topProductsQuerySchema,
} from '../validation/analytics.schemas.js';

// Dashboard analytics: read-only, available to every signed-in user (admin or analyst).
export function createAnalyticsRouter({
  analyticsController: c,
  predictiveController: p,
  requireAuth,
}) {
  const router = Router();
  router.use(requireAuth);

  router.get('/overview', validate({ query: rangeQuerySchema }), c.overview);
  router.get('/revenue', validate({ query: revenueQuerySchema }), c.revenue);
  router.get('/products/top', validate({ query: topProductsQuerySchema }), c.topProducts);
  router.get('/categories', validate({ query: rangeQuerySchema }), c.categories);
  router.get('/order-status', c.orderStatus);
  router.get('/customers', validate({ query: customersQuerySchema }), c.customers);
  router.get('/inventory', validate({ query: inventoryQuerySchema }), c.inventory);
  router.get('/anomalies', validate({ query: anomaliesQuerySchema }), c.anomalies);

  // Results of the Spark insights job.
  router.get('/segments', p.segments);
  router.get(
    '/segments/:segment/customers',
    validate({ params: segmentParamsSchema, query: segmentCustomersQuerySchema }),
    p.segmentCustomers,
  );
  router.get('/cohorts', validate({ query: cohortsQuerySchema }), p.cohorts);
  router.get('/forecast', p.forecast);

  return router;
}
