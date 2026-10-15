import { randomUUID } from 'node:crypto';
import { request } from '@playwright/test';
import { adminState } from '../global-setup.js';

/** A short unique suffix so every run creates its own records. */
export const unique = () => randomUUID().slice(0, 8);

/** An API client signed in as the admin, for setting up test data quickly. */
export async function adminApi(baseURL) {
  const context = await request.newContext({ baseURL, storageState: adminState });
  const call = async (method, path, data, headers) => {
    const res = await context.fetch(`/api${path}`, { method, data, headers });
    if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${await res.text()}`);
    return res.status() === 204 ? null : res.json();
  };
  return {
    dispose: () => context.dispose(),
    get: (path) => call('GET', path),
    post: (path, data, headers) => call('POST', path, data, headers),

    async seedCatalog(tag = unique()) {
      const { category } = await call('POST', '/categories', { name: `E2E ${tag}` });
      const { product } = await call('POST', '/products', {
        sku: `E2E-${tag}`.toUpperCase(),
        name: `E2E Lamp ${tag}`,
        categoryId: category.id,
        price: '25.00',
        reorderLevel: 2,
        initialStock: 20,
      });
      const { customer } = await call('POST', '/customers', {
        email: `e2e.${tag}@example.com`,
        firstName: 'Eve',
        lastName: `Tester ${tag}`,
      });
      return { tag, category, product, customer };
    },

    placeOrder(customerId, productId, quantity = 1) {
      return call(
        'POST',
        '/orders',
        { customerId, items: [{ productId, quantity }] },
        { 'Idempotency-Key': randomUUID() },
      );
    },
  };
}
