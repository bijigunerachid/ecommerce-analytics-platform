import { expect, test } from '@playwright/test';
import { adminState } from '../global-setup.js';
import { adminApi } from './helpers.js';

test.use({ storageState: adminState });

test('places an order, changes its status with a note, and prints the invoice', async ({
  page,
  baseURL,
}) => {
  const api = await adminApi(baseURL);
  const { product, customer } = await api.seedCatalog();
  await api.dispose();

  // Place the order through the form.
  await page.goto('/orders/new');
  await page.getByRole('combobox', { name: /Customer/ }).click();
  await page.getByRole('combobox', { name: /Customer/ }).fill(customer.email);
  await page.getByRole('option', { name: new RegExp(customer.lastName) }).click();
  await page.getByRole('combobox', { name: 'Add product' }).click();
  await page.getByRole('combobox', { name: 'Add product' }).fill(product.sku);
  await page.getByRole('option', { name: new RegExp(product.name) }).click();
  await page.getByLabel(`Quantity of ${product.name}`).fill('3');
  await page.getByRole('button', { name: 'Place order' }).click();

  // The new order: total computed by the server (3 × 25.00).
  await expect(page.getByRole('heading', { name: /Order #\d+/ })).toBeVisible();
  await expect(page.getByText('€75.00').first()).toBeVisible();
  const progress = page.getByRole('list', { name: 'Order progress' });
  await expect(progress.getByRole('listitem').first()).toContainText('Placed');

  // Mark it as paid with a note: the history shows who did it and why.
  await page.getByRole('button', { name: 'Mark as paid' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mark as paid?' });
  await dialog.getByLabel('Note (optional)').fill('Paid by bank transfer');
  await dialog.getByRole('button', { name: 'Mark as paid' }).click();
  await expect(page.getByText(/is now paid\./)).toBeVisible();
  const activity = page.getByRole('list', { name: 'Order activity' });
  await expect(activity).toContainText('marked the order as paid');
  await expect(activity).toContainText('Paid by bank transfer');

  // The invoice opens without the app shell.
  await page.getByRole('link', { name: 'Invoice' }).click();
  await expect(page.getByRole('article', { name: /^Invoice INV-\d{6}$/ })).toBeVisible();
  await expect(page.getByText('Paid in full.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  // Stock went down by the ordered quantity, through the ledger.
  await page.goto(`/products/${product.id}`);
  await expect(page.getByText('units in stock').locator('..')).toContainText('17');
});
