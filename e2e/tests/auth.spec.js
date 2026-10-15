import { expect, test } from '@playwright/test';
import { ADMIN, analystState } from '../global-setup.js';

test.describe('signing in', () => {
  test('rejects a wrong password, then signs in and out', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');

    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Back to the page that was asked for.
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();

    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('analyst', () => {
  test.use({ storageState: analystState });

  test('can read but not manage staff or change data', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Audit log' })).toHaveCount(0);

    await page.goto('/users');
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New order' })).toHaveCount(0);

    // The API enforces the same rule, whatever the UI shows.
    const res = await page.request.post('/api/categories', { data: { name: 'Not allowed' } });
    expect(res.status()).toBe(403);
  });
});
