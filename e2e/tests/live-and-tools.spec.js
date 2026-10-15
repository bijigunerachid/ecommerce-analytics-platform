import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { adminState } from '../global-setup.js';
import { adminApi } from './helpers.js';

test.use({ storageState: adminState });

test('shows an order placed elsewhere in Live activity without reloading', async ({
  page,
  baseURL,
}) => {
  const api = await adminApi(baseURL);
  const { product, customer } = await api.seedCatalog();

  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Live activity' });
  // The connection indicator (the panel may also show a loading status briefly).
  await expect(panel.getByRole('status').filter({ hasText: /^Live$/ })).toBeVisible();

  const { order } = await api.placeOrder(customer.id, product.id, 1);
  await api.dispose();
  await expect(panel.getByRole('link', { name: `Order #${order.id}` })).toBeVisible();
  await expect(panel).toContainText(`${customer.firstName} ${customer.lastName} placed an order`);
});

test('finds a product with the command palette', async ({ page, baseURL }) => {
  const api = await adminApi(baseURL);
  const { product } = await api.seedCatalog();
  await api.dispose();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: /Search pages/ }).fill(product.sku);
  await page.getByRole('option', { name: new RegExp(product.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${product.id}$`));
  await expect(page.getByRole('heading', { name: new RegExp(product.name) })).toBeVisible();
});

test('exports the filtered orders as CSV', async ({ page, baseURL }) => {
  const api = await adminApi(baseURL);
  const { product, customer } = await api.seedCatalog();
  await api.placeOrder(customer.id, product.id, 2);
  await api.dispose();

  await page.goto(`/orders?search=${encodeURIComponent(customer.email)}`);
  await expect(page.getByRole('table', { name: 'Orders' })).toContainText(customer.email);
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'CSV', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/);
  const rows = (await readFile(await download.path(), 'utf8')).trim().split('\r\n');
  expect(rows[0]).toMatch(/^Order,Placed at \(UTC\),Status/);
  expect(rows).toHaveLength(2);
  expect(rows[1]).toContain(customer.email);
});

test('serves the interactive API documentation', async ({ page }) => {
  await page.goto('/api/docs/');
  await expect(page.getByRole('heading', { name: /Commerce Analytics API/ })).toBeVisible();
  await expect(page.getByText('/orders/bulk-status').first()).toBeVisible();
});
