import { AUTH_COOKIE_NAME } from '../middleware/auth.js';

export function createAuthController({ authService, cookieSecure, tokenTtlSeconds }) {
  const cookieOptions = {
    httpOnly: true, // not readable from JavaScript, so XSS cannot steal the token
    secure: cookieSecure,
    sameSite: 'strict', // not sent on cross-site requests (CSRF protection)
    path: '/api',
  };

  return {
    async login(req, res) {
      const { email, password } = req.validated.body;
      const { user, token } = await authService.login(email, password);
      res.cookie(AUTH_COOKIE_NAME, token, { ...cookieOptions, maxAge: tokenTtlSeconds * 1000 });
      res.json({ user });
    },

    logout(_req, res) {
      res.clearCookie(AUTH_COOKIE_NAME, cookieOptions);
      res.status(204).end();
    },

    me(req, res) {
      res.json({ user: req.user });
    },
  };
}
