import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

function getAuthCookie(res) {
  const cookies = res.headers['set-cookie'] ?? [];
  return cookies.find((c) => c.startsWith('access_token='));
}

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials and sets a hardened session cookie', async () => {
    await ctx.createUser({ email: 'admin@example.test', role: 'admin', fullName: 'Ada Admin' });

    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.test', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'admin@example.test',
      role: 'admin',
      fullName: 'Ada Admin',
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('$2'); // no bcrypt hash anywhere

    const cookie = getAuthCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api/);
    expect(cookie).toMatch(/Max-Age=3600/);
    // The token itself is not returned in the body; it lives only in the HttpOnly cookie.
    expect(res.body.token).toBeUndefined();
  });

  it('sets the Secure flag when configured for HTTPS', async () => {
    const secureCtx = createTestContext({
      auth: { ...ctx.config.auth, cookieSecure: true },
    });
    try {
      await secureCtx.createUser();
      const res = await request(secureCtx.app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.test', password: TEST_PASSWORD });
      expect(getAuthCookie(res)).toMatch(/Secure/);
    } finally {
      await secureCtx.close();
    }
  });

  it('normalizes email case and whitespace', async () => {
    await ctx.createUser({ email: 'admin@example.test' });
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: '  Admin@Example.TEST ', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });

  it('records the last login time', async () => {
    const user = await ctx.createUser();
    await ctx.loginAs(user.email);
    const { rows } = await ctx.db.query('SELECT last_login_at FROM users WHERE id = $1', [user.id]);
    expect(rows[0].last_login_at).toBeInstanceOf(Date);
  });

  it.each([
    ['wrong password', 'admin@example.test', 'not-the-password'],
    ['unknown email', 'nobody@example.test', TEST_PASSWORD],
  ])('returns the same generic 401 for %s', async (_label, email, password) => {
    await ctx.createUser({ email: 'admin@example.test' });
    const res = await request(ctx.app).post('/api/auth/login').send({ email, password });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
    });
    expect(getAuthCookie(res)).toBeUndefined();
  });

  it('rejects deactivated users', async () => {
    await ctx.createUser({ email: 'gone@example.test', isActive: false });
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'gone@example.test', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('validates the request body', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
    // Unknown fields are rejected rather than silently ignored.
    expect(res.body.error.details.some((d) => d.message.includes('role'))).toBe(true);
  });

  it('rate-limits repeated login attempts', async () => {
    const limitedCtx = createTestContext({ loginRateLimit: { windowMs: 60_000, max: 3 } });
    try {
      const attempt = () =>
        request(limitedCtx.app)
          .post('/api/auth/login')
          .send({ email: 'x@example.test', password: 'wrong' });

      for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
      const blocked = await attempt();
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    } finally {
      await limitedCtx.close();
    }
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid session', async () => {
    await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
    const agent = await ctx.loginAs('analyst@example.test');

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'analyst@example.test', role: 'analyst' });
  });

  it('returns 401 without a session', async () => {
    const res = await request(ctx.app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it.each([
    ['a tampered token', () => jwt.sign({ role: 'admin' }, 'some-other-secret', { subject: '1' })],
    [
      'an expired token',
      () =>
        jwt.sign({ role: 'admin' }, ctx.config.auth.jwtSecret, { subject: '1', expiresIn: -10 }),
    ],
    [
      'an unsigned token',
      () => jwt.sign({ role: 'admin' }, null, { algorithm: 'none', subject: '1' }),
    ],
    ['garbage', () => 'not.a.jwt'],
  ])('returns 401 for %s', async (_label, makeToken) => {
    await ctx.createUser();
    const res = await request(ctx.app)
      .get('/api/auth/me')
      .set('Cookie', `access_token=${makeToken()}`);
    expect(res.status).toBe(401);
  });

  it('rejects an existing session once the user is deactivated', async () => {
    const user = await ctx.createUser();
    const agent = await ctx.loginAs(user.email);
    await ctx.db.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);

    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    await ctx.createUser();
    const agent = await ctx.loginAs('admin@example.test');

    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(getAuthCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});
