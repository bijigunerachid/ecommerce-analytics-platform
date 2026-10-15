import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { adminState } from '../global-setup.js';
import { adminApi } from './helpers.js';

/**
 * Automated accessibility checks (axe-core, WCAG 2.2 A and AA rules) on the main pages, in the
 * light and dark themes. They catch a subset of problems (contrast, names, landmarks, ARIA);
 * keyboard flows are covered by the component tests.
 */
async function expectNoViolations(page, label) {
  // Pages fade in on navigation. Mid-fade, text is partly transparent and axe measures a
  // washed-out contrast, so wait for finite animations (not spinners or pulses) to end, at most
  // one second in case one is paused.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      ),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]),
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const problems = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  );
  expect(problems, `${label}\n${problems.join('\n')}`).toEqual([]);
}

test('the sign-in page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectNoViolations(page, 'login');
});

test.describe('signed in', () => {
  test.use({ storageState: adminState });

  let ids;
  test.beforeAll(async ({ baseURL }) => {
    const api = await adminApi(baseURL);
    const { product, customer } = await api.seedCatalog();
    const { order } = await api.placeOrder(customer.id, product.id, 1);
    await api.dispose();
    ids = { product: product.id, customer: customer.id, order: order.id };
  });

  for (const scheme of ['light', 'dark']) {
    test(`main pages in the ${scheme} theme`, async ({ page }) => {
      // Nine pages, each scanned by axe.
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme: scheme });
      const pages = [
        ['/', page.getByRole('region', { name: 'Net revenue over time' })],
        ['/orders', page.getByRole('table', { name: 'Orders' })],
        [`/orders/${ids.order}`, page.getByRole('list', { name: 'Order activity' })],
        [`/products/${ids.product}`, page.getByRole('region', { name: 'Units sold per day' })],
        [`/customers/${ids.customer}`, page.getByRole('region', { name: 'Spend per month' })],
        ['/insights', page.getByRole('heading', { name: 'Insights' })],
        ['/reports', page.getByRole('heading', { name: 'Sales report' })],
        ['/audit-log', page.getByRole('table', { name: 'Audit log' })],
        ['/account', page.getByRole('heading', { name: 'Account' })],
      ];
      for (const [path, ready] of pages) {
        await page.goto(path);
        await expect(ready).toBeVisible();
        await expectNoViolations(page, `${path} (${scheme})`);
      }
    });
  }
});
