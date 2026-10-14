import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  activityQuerySchema,
  listNotificationsQuerySchema,
} from '../validation/realtime.schemas.js';

/** Notifications, recent order activity, and the live event stream (any signed-in role). */
export function createRealtimeRouter({ notificationsController, streamController, requireAuth }) {
  const router = Router();
  router.get(
    '/notifications',
    requireAuth,
    validate({ query: listNotificationsQuerySchema }),
    notificationsController.list,
  );
  router.post('/notifications/read', requireAuth, notificationsController.markAllRead);
  router.get(
    '/activity',
    requireAuth,
    validate({ query: activityQuerySchema }),
    notificationsController.activity,
  );
  router.get('/stream', requireAuth, streamController.stream);
  return router;
}
