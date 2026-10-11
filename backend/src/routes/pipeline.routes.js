import { Router } from 'express';

// Data pipeline monitoring; readable by any signed-in user (admin or analyst).
export function createPipelineRouter({ pipelineController, requireAuth }) {
  const router = Router();
  router.use(requireAuth);
  router.get('/health', pipelineController.health);
  return router;
}
