import { Router } from 'express';

/** CSV downloads of the list views and reports (any signed-in role; some exports admin-only). */
export function createExportsRouter({ exportsController, requireAuth }) {
  const router = Router();
  router.use(requireAuth);
  router.get('/:file', exportsController.download);
  return router;
}
