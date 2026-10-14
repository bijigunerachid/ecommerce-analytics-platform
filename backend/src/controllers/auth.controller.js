import { AUTH_COOKIE_NAME } from '../middleware/auth.js';
import { HttpError } from '../utils/http-error.js';

export function createAuthController({ authService, cookieSecure, tokenTtlSeconds }) {
  const cookieOptions = {
    httpOnly: true, // not readable from JavaScript, so XSS cannot steal the token
    secure: cookieSecure,
    sameSite: 'strict', // not sent on cross-site requests (CSRF protection)
    path: '/api',
  };
  const setSessionCookie = (res, token) =>
    res.cookie(AUTH_COOKIE_NAME, token, { ...cookieOptions, maxAge: tokenTtlSeconds * 1000 });

  return {
    async login(req, res) {
      const { email, password } = req.validated.body;
      let result;
      try {
        result = await authService.login(email, password);
      } catch (err) {
        if (err instanceof HttpError && err.status === 401) {
          // Records the attempted email (never the password) to make guessing visible.
          await req.audit({
            actor: { email },
            action: 'auth.login_failed',
            entityType: 'user',
            summary: `Failed sign-in for ${email}`,
          });
        }
        throw err;
      }
      const { user, token } = result;
      setSessionCookie(res, token);
      await req.audit({
        actor: user,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        summary: `${user.email} signed in`,
      });
      res.json({ user });
    },

    async logout(req, res) {
      const token = req.cookies?.[AUTH_COOKIE_NAME];
      const user = token ? await authService.authenticate(token) : null;
      res.clearCookie(AUTH_COOKIE_NAME, cookieOptions);
      if (user) {
        await req.audit({
          actor: user,
          action: 'auth.logout',
          entityType: 'user',
          entityId: user.id,
          summary: `${user.email} signed out`,
        });
      }
      res.status(204).end();
    },

    me(req, res) {
      res.json({ user: req.user });
    },

    async updateProfile(req, res) {
      const user = await authService.updateProfile(req.user.id, req.validated.body);
      await req.audit({
        action: 'account.profile_updated',
        entityType: 'user',
        entityId: user.id,
        summary: `${user.email} updated their profile`,
        details: { fullName: { from: req.user.fullName, to: user.fullName } },
      });
      res.json({ user });
    },

    async changePassword(req, res) {
      const { token } = await authService.changePassword(req.user.id, req.validated.body);
      setSessionCookie(res, token);
      await req.audit({
        action: 'account.password_changed',
        entityType: 'user',
        entityId: req.user.id,
        summary: `${req.user.email} changed their password and signed out other sessions`,
      });
      res.status(204).end();
    },

    async revokeOtherSessions(req, res) {
      const { token } = await authService.revokeOtherSessions(req.user);
      setSessionCookie(res, token);
      await req.audit({
        action: 'account.sessions_revoked',
        entityType: 'user',
        entityId: req.user.id,
        summary: `${req.user.email} signed out all other sessions`,
      });
      res.status(204).end();
    },
  };
}
