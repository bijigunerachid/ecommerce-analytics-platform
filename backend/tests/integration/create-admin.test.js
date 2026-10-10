import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const run = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, '../../scripts/create-admin.js');

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

function createAdmin(args, password = 'a-strong-admin-password') {
  return run(process.execPath, [SCRIPT, ...args, '--test'], {
    env: { ...process.env, ADMIN_PASSWORD: password, BCRYPT_ROUNDS: '4' },
  });
}

describe('scripts/create-admin.js', () => {
  it('creates an active admin who can log in', async () => {
    const { stdout } = await createAdmin([
      '--email',
      'Owner@Example.test',
      '--name',
      'Store Owner',
    ]);
    expect(stdout).toContain('Created admin account owner@example.test');

    const agent = await ctx.loginAs('owner@example.test', 'a-strong-admin-password');
    const me = await agent.get('/api/auth/me');
    expect(me.body.user).toMatchObject({ role: 'admin', isActive: true, fullName: 'Store Owner' });
  });

  it('refuses a weak password', async () => {
    await expect(
      createAdmin(['--email', 'owner@example.test', '--name', 'Owner'], 'short'),
    ).rejects.toMatchObject({ stderr: expect.stringContaining('at least 12 characters') });
  });

  it('refuses a duplicate email', async () => {
    await createAdmin(['--email', 'owner@example.test', '--name', 'Owner']);
    await expect(
      createAdmin(['--email', 'owner@example.test', '--name', 'Owner']),
    ).rejects.toMatchObject({ stderr: expect.stringContaining('already exists') });
  });

  it('requires --email and --name', async () => {
    await expect(createAdmin(['--email', 'owner@example.test'])).rejects.toMatchObject({
      stderr: expect.stringContaining('Usage'),
    });
  });
});
