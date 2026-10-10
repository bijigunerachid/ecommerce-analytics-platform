import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const newAnalyst = {
  email: 'New.Analyst@Example.test',
  password: 'a-long-enough-password',
  fullName: '  Nia Analyst ',
  role: 'analyst',
};

describe('role-based access to /api/users', () => {
  it('returns 401 when not logged in', async () => {
    expect((await request(ctx.app).get('/api/users')).status).toBe(401);
    expect((await request(ctx.app).post('/api/users').send(newAnalyst)).status).toBe(401);
  });

  it('returns 403 for analysts', async () => {
    await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
    const agent = await ctx.loginAs('analyst@example.test');

    const list = await agent.get('/api/users');
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('FORBIDDEN');

    expect((await agent.post('/api/users').send(newAnalyst)).status).toBe(403);
    const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM users');
    expect(rows[0].n).toBe(1);
  });

  it('uses the current role from the database, not the role in the token', async () => {
    const admin = await ctx.createUser({ email: 'admin@example.test', role: 'admin' });
    const agent = await ctx.loginAs('admin@example.test');
    await ctx.db.query(`UPDATE users SET role = 'analyst' WHERE id = $1`, [admin.id]);

    expect((await agent.get('/api/users')).status).toBe(403);
  });

  it('lets admins list users without exposing password hashes', async () => {
    await ctx.createUser({ email: 'admin@example.test', role: 'admin' });
    await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
    const agent = await ctx.loginAs('admin@example.test');

    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.users.map((u) => u.email)).toEqual([
      'admin@example.test',
      'analyst@example.test',
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});

describe('POST /api/users (admin)', () => {
  let admin;
  beforeEach(async () => {
    await ctx.createUser({ email: 'admin@example.test', role: 'admin' });
    admin = await ctx.loginAs('admin@example.test');
  });

  it('creates a user with a normalized email and a bcrypt-hashed password', async () => {
    const res = await admin.post('/api/users').send(newAnalyst);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'new.analyst@example.test',
      fullName: 'Nia Analyst',
      role: 'analyst',
      isActive: true,
    });

    const { rows } = await ctx.db.query('SELECT password_hash FROM users WHERE email = $1', [
      'new.analyst@example.test',
    ]);
    expect(rows[0].password_hash).not.toBe(newAnalyst.password);
    expect(await bcrypt.compare(newAnalyst.password, rows[0].password_hash)).toBe(true);

    // The new account can log in.
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'new.analyst@example.test', password: newAnalyst.password });
    expect(login.status).toBe(200);
  });

  it('returns 409 for a duplicate email', async () => {
    const res = await admin.post('/api/users').send({ ...newAnalyst, email: 'ADMIN@example.test' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it.each([
    ['a short password', { password: 'short' }, 'password'],
    ['a password over 72 bytes', { password: 'é'.repeat(37) }, 'password'],
    ['an unknown role', { role: 'superuser' }, 'role'],
    ['an invalid email', { email: 'nope' }, 'email'],
    ['a blank name', { fullName: '   ' }, 'fullName'],
  ])('rejects %s', async (_label, patch, field) => {
    const res = await admin.post('/api/users').send({ ...newAnalyst, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toContain(field);
  });
});
