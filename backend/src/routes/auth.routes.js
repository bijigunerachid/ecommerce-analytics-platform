import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import {
  changePasswordSchema,
  loginSchema,
  updateProfileSchema,
} from '../validation/auth.schemas.js';

export function createAuthRouter({ authController, requireAuth, loginRateLimit }) {
  const router = Router();

  // Slows down password guessing: limited per client IP.
  const loginLimiter = rateLimit({
    windowMs: loginRateLimit.windowMs,
    limit: loginRateLimit.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts, try again later' },
      }),
  });

  router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);
  router.post('/logout', authController.logout);
  router.get('/me', requireAuth, authController.me);
  router.patch(
    '/me',
    requireAuth,
    validate({ body: updateProfileSchema }),
    authController.updateProfile,
  );
  // Rate limited like sign-in: it checks the current password.
  router.post(
    '/password',
    requireAuth,
    loginLimiter,
    validate({ body: changePasswordSchema }),
    authController.changePassword,
  );
  router.post('/sessions/revoke-others', requireAuth, authController.revokeOtherSessions);

  return router;
}
