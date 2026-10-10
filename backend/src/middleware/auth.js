import { forbidden, unauthorized } from '../utils/http-error.js';

export const AUTH_COOKIE_NAME = 'access_token';

/** Rejects the request with 401 unless it carries a valid session cookie; sets req.user. */
export function requireAuth(authService) {
  return async (req, _res, next) => {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    if (!token) return next(unauthorized());

    const user = await authService.authenticate(token);
    if (!user) return next(unauthorized('Session is invalid or has expired'));

    req.user = user;
    next();
  };
}

/** Must run after requireAuth. Rejects with 403 unless req.user has one of the given roles. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}
