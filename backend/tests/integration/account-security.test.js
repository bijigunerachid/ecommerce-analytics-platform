import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

const NEW_PASSWORD = 'a-brand-new-passphrase';

let admin;
let adminUser;
let analyst;
let analystUser;

beforeEach(async () => {
  await ctx.reset();
  adminUser = await ctx.createUser({
    email: 'admin@example.test',
    role: 'admin',
    fullName: 'Ada Admin',
  });
  analystUser = await ctx.createUser({
    email: 'analyst@example.test',
    role: 'analyst',
    fullName: 'Andy Analyst',
  });
  admin = await ctx.loginAs('admin@example.test');
  analyst = await ctx.loginAs('analyst@example.test');
});

async function auditEntries(action) {
  const { rows } = await ctx.db.query(
    `SELECT action, actor_email, entity_type, entity_id, summary, details, ip
     FROM audit_log WHERE ($1::text IS NULL OR action = $1) ORDER BY id`,
    [action ?? null],
  );
  return rows;
}

describe('account', () => {
  it('updates the signed-in user’s name', async () => {
    const res = await analyst.patch('/api/auth/me').send({ fullName: '  Andy A. ' }).expect(200);
    expect(res.body.user.fullName).toBe('Andy A.');
    expect(await auditEntries('account.profile_updated')).toEqual([
      expect.objectContaining({
        actor_email: 'analyst@example.test',
        details: { fullName: { from: 'Andy Analyst', to: 'Andy A.' } },
      }),
    ]);
    await analyst.patch('/api/auth/me').send({ fullName: '' }).expect(400);
    await analyst.patch('/api/auth/me').send({ role: 'admin' }).expect(400);
  });

  it('changes the password, keeps this session, and ends every other one', async () => {
    const otherDevice = await ctx.loginAs('analyst@example.test');

    const wrong = await analyst
      .post('/api/auth/password')
      .send({ currentPassword: 'not-it', newPassword: NEW_PASSWORD })
      .expect(400);
    expect(wrong.body.error.details).toEqual([
      expect.objectContaining({ path: 'currentPassword' }),
    ]);
    await analyst
      .post('/api/auth/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })
      .expect(400);
    await analyst
      .post('/api/auth/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' })
      .expect(400);

    await analyst
      .post('/api/auth/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);

    await analyst.get('/api/auth/me').expect(200); // reissued cookie
    await otherDevice.get('/api/auth/me').expect(401);
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'analyst@example.test', password: TEST_PASSWORD })
      .expect(401);
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'analyst@example.test', password: NEW_PASSWORD })
      .expect(200);

    const entries = await auditEntries();
    expect(entries.map((e) => e.action)).toContain('account.password_changed');
    expect(JSON.stringify(entries)).not.toContain(NEW_PASSWORD);
  });

  it('signs out other sessions on request', async () => {
    const otherDevice = await ctx.loginAs('analyst@example.test');
    await analyst.post('/api/auth/sessions/revoke-others').expect(204);
    await analyst.get('/api/auth/me').expect(200);
    await otherDevice.get('/api/auth/me').expect(401);
    expect(await auditEntries('account.sessions_revoked')).toHaveLength(1);
  });

  it('still accepts sessions issued before session versions existed', async () => {
    const legacy = jwt.sign({ role: 'analyst' }, ctx.config.auth.jwtSecret, {
      algorithm: 'HS256',
      subject: String(analystUser.id),
      expiresIn: 60,
    });
    await request(ctx.app).get('/api/auth/me').set('Cookie', `access_token=${legacy}`).expect(200);
  });
});

describe('user administration', () => {
  it('renames, changes the role, and deactivates, ending the user’s sessions', async () => {
    let res = await admin
      .patch(`/api/users/${analystUser.id}`)
      .send({ fullName: 'Andrea Analyst', role: 'admin' })
      .expect(200);
    expect(res.body.user).toMatchObject({ fullName: 'Andrea Analyst', role: 'admin' });
    expect((await auditEntries('user.updated'))[0].details).toEqual({
      fullName: { from: 'Andy Analyst', to: 'Andrea Analyst' },
      role: { from: 'analyst', to: 'admin' },
    });

    res = await admin.patch(`/api/users/${analystUser.id}`).send({ isActive: false }).expect(200);
    expect(res.body.user.isActive).toBe(false);
    await analyst.get('/api/auth/me').expect(401);

    // Reactivating does not bring old sessions back.
    await admin.patch(`/api/users/${analystUser.id}`).send({ isActive: true }).expect(200);
    await analyst.get('/api/auth/me').expect(401);
  });

  it('does not let admins change their own role or deactivate themselves', async () => {
    const res = await admin
      .patch(`/api/users/${adminUser.id}`)
      .send({ isActive: false })
      .expect(409);
    expect(res.body.error.code).toBe('SELF_CHANGE_NOT_ALLOWED');
    await admin.patch(`/api/users/${adminUser.id}`).send({ role: 'analyst' }).expect(409);
    await admin.patch(`/api/users/${adminUser.id}`).send({ fullName: 'Ada A.' }).expect(200);
  });

  it('always keeps one active admin, even when two admins demote each other at once', async () => {
    const second = await ctx.createUser({ email: 'admin2@example.test', role: 'admin' });
    const admin2 = await ctx.loginAs('admin2@example.test');
    const results = await Promise.all([
      admin.patch(`/api/users/${second.id}`).send({ role: 'analyst' }),
      admin2.patch(`/api/users/${adminUser.id}`).send({ role: 'analyst' }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409).body.error.code).toBe('LAST_ADMIN');
    const { rows } = await ctx.db.query(
      `SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_active`,
    );
    expect(rows[0].n).toBe(1);
  });

  it('resets another user’s password and ends their sessions', async () => {
    await admin
      .post(`/api/users/${analystUser.id}/password`)
      .send({ password: NEW_PASSWORD })
      .expect(200);
    await analyst.get('/api/auth/me').expect(401);
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'analyst@example.test', password: NEW_PASSWORD })
      .expect(200);
    await admin
      .post(`/api/users/${adminUser.id}/password`)
      .send({ password: NEW_PASSWORD })
      .expect(409);
    await admin.post('/api/users/999999/password').send({ password: NEW_PASSWORD }).expect(404);
  });

  it('is admin-only', async () => {
    await analyst.patch(`/api/users/${adminUser.id}`).send({ fullName: 'x' }).expect(403);
    await analyst
      .post(`/api/users/${adminUser.id}/password`)
      .send({ password: NEW_PASSWORD })
      .expect(403);
  });
});

describe('audit log', () => {
  it('records sign-ins, failed sign-ins, and changes with the client IP', async () => {
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.test', password: 'wrong-password' })
      .expect(401);
    const created = await admin.post('/api/categories').send({ name: 'Garden' }).expect(201);
    await admin
      .patch(`/api/categories/${created.body.category.id}`)
      .send({ name: 'Garden & Outdoor' })
      .expect(200);
    await admin.delete(`/api/categories/${created.body.category.id}`).expect(204);

    const entries = await auditEntries();
    expect(entries.map((e) => e.action)).toEqual([
      'auth.login', // beforeEach: admin
      'auth.login', // beforeEach: analyst
      'auth.login_failed',
      'category.created',
      'category.updated',
      'category.deleted',
    ]);
    expect(entries[2]).toMatchObject({
      actor_email: 'admin@example.test',
      summary: 'Failed sign-in for admin@example.test',
    });
    expect(entries[4].details).toEqual({ name: { from: 'Garden', to: 'Garden & Outdoor' } });
    expect(entries[5].summary).toBe('Deleted category Garden & Outdoor');
    expect(entries.every((e) => e.ip)).toBe(true);
    expect(JSON.stringify(entries)).not.toContain('wrong-password');
  });

  it('lists entries newest first with filters, for admins only', async () => {
    await admin.post('/api/categories').send({ name: 'Garden' });
    await admin.post('/api/categories').send({ name: 'Toys' });

    let res = await admin.get('/api/audit-log?action=category.created').expect(200);
    expect(res.body.data.map((e) => e.summary)).toEqual([
      'Created category Toys',
      'Created category Garden',
    ]);
    expect(res.body.data[0]).toMatchObject({
      actor: { id: adminUser.id, email: 'admin@example.test', fullName: 'Ada Admin' },
      entityType: 'category',
    });
    expect(res.body.pagination).toMatchObject({ total: 2, pageSize: 25 });

    res = await admin.get(`/api/audit-log?actorId=${analystUser.id}`).expect(200);
    expect(res.body.data.map((e) => e.action)).toEqual(['auth.login']);
    res = await admin.get('/api/audit-log?search=garden').expect(200);
    expect(res.body.pagination.total).toBe(1);

    await admin.get('/api/audit-log?action=DROP TABLE').expect(400);
    await analyst.get('/api/audit-log').expect(403);
  });

  it('cannot be edited or deleted', async () => {
    await expect(ctx.db.query(`UPDATE audit_log SET summary = 'x'`)).rejects.toThrow(/append-only/);
    await expect(ctx.db.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
  });

  it('keeps entries readable when the account is deleted', async () => {
    const temp = await ctx.createUser({ email: 'temp@example.test', role: 'analyst' });
    await ctx.loginAs('temp@example.test');
    await ctx.db.query('DELETE FROM users WHERE id = $1', [temp.id]);
    const { rows } = await ctx.db.query(
      `SELECT actor_id, actor_email FROM audit_log WHERE actor_email = 'temp@example.test'`,
    );
    expect(rows).toEqual([{ actor_id: null, actor_email: 'temp@example.test' }]);
  });
});
