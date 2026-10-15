import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { request } from '@playwright/test';

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'ci.admin@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'ci-smoke-admin-password',
};
export const ANALYST = {
  email: process.env.E2E_ANALYST_EMAIL ?? 'e2e.analyst@example.com',
  password: process.env.E2E_ANALYST_PASSWORD ?? 'e2e-analyst-password',
  fullName: 'E2E Analyst',
};
export const AUTH_DIR = new URL('./.auth/', import.meta.url);
export const adminState = fileURLToPath(new URL('admin.json', AUTH_DIR));
export const analystState = fileURLToPath(new URL('analyst.json', AUTH_DIR));

/**
 * Reuses a saved session while it is still valid for this account; otherwise signs in. Sign-in
 * is rate limited (LOGIN_RATE_LIMIT_MAX per window and IP), so repeated local runs should not
 * spend attempts on setup.
 */
async function signIn(baseURL, { email, password }, savedState) {
  if (existsSync(savedState)) {
    const saved = await request.newContext({ baseURL, storageState: savedState });
    const me = await saved.get('/api/auth/me');
    if (me.ok() && (await me.json()).user.email === email) return { context: saved, ok: true };
    await saved.dispose();
  }
  const context = await request.newContext({ baseURL });
  const res = await context.post('/api/auth/login', { data: { email, password } });
  return { context, ok: res.ok(), status: res.status() };
}

/**
 * Signs in once as an admin (the account must exist: CI creates it with create-admin) and as an
 * analyst (created or reset here), and saves both sessions for the tests.
 */
export default async function globalSetup(config) {
  const baseURL = config.projects[0].use.baseURL;
  mkdirSync(AUTH_DIR, { recursive: true });

  const admin = await signIn(baseURL, ADMIN, adminState);
  if (!admin.ok) {
    throw new Error(
      `Admin sign-in failed (${admin.status}). Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.`,
    );
  }
  await admin.context.storageState({ path: adminState });

  let analyst = await signIn(baseURL, ANALYST, analystState);
  if (!analyst.ok) {
    await analyst.context.dispose();
    const created = await admin.context.post('/api/users', {
      data: { ...ANALYST, role: 'analyst' },
    });
    if (created.status() === 409) {
      // The account exists with another password: reset it.
      const { users } = await (await admin.context.get('/api/users')).json();
      const existing = users.find((u) => u.email === ANALYST.email);
      await admin.context.patch(`/api/users/${existing.id}`, { data: { isActive: true } });
      await admin.context.post(`/api/users/${existing.id}/password`, {
        data: { password: ANALYST.password },
      });
    } else if (!created.ok()) {
      throw new Error(`Could not create the analyst account (${created.status()})`);
    }
    analyst = await signIn(baseURL, ANALYST, analystState);
    if (!analyst.ok) throw new Error(`Analyst sign-in failed (${analyst.status})`);
  }
  await analyst.context.storageState({ path: analystState });

  await admin.context.dispose();
  await analyst.context.dispose();
}
