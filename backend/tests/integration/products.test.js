import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let admin;
let analyst;
let adminId;
let electronics;
let books;

beforeEach(async () => {
  await ctx.reset();
  adminId = (await ctx.createUser({ email: 'admin@example.test', role: 'admin' })).id;
  await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
  admin = await ctx.loginAs('admin@example.test');
  analyst = await ctx.loginAs('analyst@example.test');
  electronics = (await admin.post('/api/categories').send({ name: 'Electronics' })).body.category;
  books = (await admin.post('/api/categories').send({ name: 'Books' })).body.category;
});

async function createProduct(overrides = {}) {
  const res = await admin.post('/api/products').send({
    sku: 'SKU-1',
    name: 'Widget',
    categoryId: electronics.id,
    price: '19.99',
    ...overrides,
  });
  expect(res.status, res.text).toBe(201);
  return res.body.product;
}

describe('access control', () => {
  it('lets analysts read but not write', async () => {
    const product = await createProduct();
    expect((await request(ctx.app).get('/api/products')).status).toBe(401);
    expect((await analyst.get('/api/products')).status).toBe(200);
    expect((await analyst.get(`/api/products/${product.id}`)).status).toBe(200);
    expect(
      (
        await analyst
          .post('/api/products')
          .send({ sku: 'X-1', name: 'X', categoryId: books.id, price: 1 })
      ).status,
    ).toBe(403);
    expect((await analyst.patch(`/api/products/${product.id}`).send({ price: 1 })).status).toBe(
      403,
    );
    expect((await analyst.delete(`/api/products/${product.id}`)).status).toBe(403);
  });
});

describe('POST /api/products', () => {
  it('creates a product with normalized fields and exact decimal price', async () => {
    const product = await createProduct({ sku: ' ab-12 ', name: ' Gadget ', price: 0.1 });
    expect(product).toMatchObject({
      sku: 'AB-12',
      name: 'Gadget',
      categoryId: electronics.id,
      categoryName: 'Electronics',
      price: '0.10',
      stockQuantity: 0,
      reorderLevel: 10,
      isLowStock: true,
      isActive: true,
      description: null,
    });
  });

  it('records initial stock as a stock movement in the same transaction', async () => {
    const product = await createProduct({ initialStock: 25 });
    expect(product.stockQuantity).toBe(25);
    expect(product.isLowStock).toBe(false);

    const { rows } = await ctx.db.query(
      'SELECT quantity_change, reason, created_by FROM stock_movements WHERE product_id = $1',
      [product.id],
    );
    expect(rows).toEqual([{ quantity_change: 25, reason: 'restock', created_by: String(adminId) }]);
  });

  it('rolls back the product if the initial stock movement fails', async () => {
    // Pre-insert a movement with the key the service will use for product id 1,
    // forcing a unique violation inside the transaction.
    const { rows } = await ctx.db.query(
      `INSERT INTO products (sku, name, category_id, price) VALUES ('TMP', 'tmp', $1, 1) RETURNING id`,
      [books.id],
    );
    const nextId = Number(rows[0].id) + 1;
    await ctx.db.query(
      `INSERT INTO stock_movements (product_id, quantity_change, reason, idempotency_key)
       VALUES ($1, 1, 'adjustment', $2)`,
      [rows[0].id, `product-${nextId}-initial-stock`],
    );

    const originalError = console.error;
    console.error = () => {};
    try {
      const res = await admin
        .post('/api/products')
        .send({ sku: 'NEW-1', name: 'New', categoryId: books.id, price: 5, initialStock: 3 });
      expect(res.status).toBe(500);
    } finally {
      console.error = originalError;
    }
    const { rows: leftovers } = await ctx.db.query(`SELECT 1 FROM products WHERE sku = 'NEW-1'`);
    expect(leftovers).toHaveLength(0);
  });

  it('returns 409 for a duplicate SKU, regardless of case', async () => {
    await createProduct({ sku: 'DUP-1' });
    const res = await admin
      .post('/api/products')
      .send({ sku: 'dup-1', name: 'Again', categoryId: electronics.id, price: 1 });
    expect(res.status).toBe(409);
  });

  it('returns 400 when the category does not exist', async () => {
    const res = await admin
      .post('/api/products')
      .send({ sku: 'X-1', name: 'X', categoryId: 9999, price: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('categoryId');
  });

  it.each([
    ['a negative price', { price: -1 }, 'price'],
    ['three decimals', { price: '1.999' }, 'price'],
    ['a non-numeric price', { price: 'free' }, 'price'],
    ['an invalid SKU', { sku: 'has spaces' }, 'sku'],
    ['negative initial stock', { initialStock: -5 }, 'initialStock'],
    ['fractional stock', { initialStock: 1.5 }, 'initialStock'],
    ['a direct stockQuantity', { stockQuantity: 100 }, ''],
  ])('rejects %s', async (_label, patch, path) => {
    const res = await admin
      .post('/api/products')
      .send({ sku: 'OK-1', name: 'Ok', categoryId: electronics.id, price: '1.00', ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toContain(path);
  });
});

describe('PATCH /api/products/:id', () => {
  it('updates only the provided fields', async () => {
    const product = await createProduct({ description: 'Original' });
    const res = await admin
      .patch(`/api/products/${product.id}`)
      .send({ price: '24.50', categoryId: books.id, isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({
      name: 'Widget',
      description: 'Original',
      price: '24.50',
      categoryName: 'Books',
      isActive: false,
    });
  });

  it('does not allow changing stock directly', async () => {
    const product = await createProduct({ initialStock: 5 });
    const res = await admin.patch(`/api/products/${product.id}`).send({ stockQuantity: 500 });
    expect(res.status).toBe(400);
    expect((await admin.get(`/api/products/${product.id}`)).body.product.stockQuantity).toBe(5);
  });

  it('returns 404, 409, and 400 appropriately', async () => {
    await createProduct({ sku: 'A-1' });
    const b = await createProduct({ sku: 'B-1' });
    expect((await admin.patch('/api/products/9999').send({ name: 'X' })).status).toBe(404);
    expect((await admin.patch(`/api/products/${b.id}`).send({ sku: 'a-1' })).status).toBe(409);
    expect((await admin.patch(`/api/products/${b.id}`).send({ categoryId: 9999 })).status).toBe(
      400,
    );
  });
});

describe('DELETE /api/products/:id', () => {
  it('deletes a product with no history', async () => {
    const product = await createProduct();
    expect((await admin.delete(`/api/products/${product.id}`)).status).toBe(204);
    expect((await admin.get(`/api/products/${product.id}`)).status).toBe(404);
  });

  it('refuses to delete a product with inventory history and suggests deactivating it', async () => {
    const product = await createProduct({ initialStock: 3 });
    const res = await admin.delete(`/api/products/${product.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/isActive to false/);
  });
});

describe('GET /api/products (search, filters, sorting, pagination)', () => {
  beforeEach(async () => {
    await createProduct({ sku: 'LAP-1', name: 'Laptop Pro', price: '1299.00', initialStock: 50 });
    await createProduct({ sku: 'MOU-1', name: 'Wireless Mouse', price: '25.00', initialStock: 3 });
    await createProduct({ sku: 'KEY-1', name: 'Keyboard 100%', price: '79.90', initialStock: 40 });
    await createProduct({
      sku: 'BOOK-1',
      name: 'SQL_Guide',
      price: '39.00',
      categoryId: books.id,
      initialStock: 8,
    });
    await createProduct({
      sku: 'OLD-1',
      name: 'Old Cable',
      price: '5.00',
      isActive: false,
      initialStock: 100,
    });
  });

  const skus = (res) => res.body.data.map((p) => p.sku);

  it('returns everything sorted by name by default', async () => {
    const res = await analyst.get('/api/products');
    expect(res.status).toBe(200);
    expect(skus(res)).toEqual(['KEY-1', 'LAP-1', 'OLD-1', 'BOOK-1', 'MOU-1']);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 20, total: 5, totalPages: 1 });
  });

  it('searches name and SKU case-insensitively', async () => {
    expect(skus(await analyst.get('/api/products?search=laptop'))).toEqual(['LAP-1']);
    expect(skus(await analyst.get('/api/products?search=mou'))).toEqual(['MOU-1']);
  });

  it('treats % and _ in search text literally', async () => {
    expect(skus(await analyst.get('/api/products?search=100%25'))).toEqual(['KEY-1']);
    expect(skus(await analyst.get('/api/products?search=L_G'))).toEqual(['BOOK-1']);
    expect(skus(await analyst.get('/api/products?search=%25'))).toEqual(['KEY-1']);
  });

  it('filters by category, active state, price range, and low stock', async () => {
    expect(skus(await analyst.get(`/api/products?categoryId=${books.id}`))).toEqual(['BOOK-1']);
    expect(skus(await analyst.get('/api/products?isActive=false'))).toEqual(['OLD-1']);
    expect(skus(await analyst.get('/api/products?minPrice=25&maxPrice=80'))).toEqual([
      'KEY-1',
      'BOOK-1',
      'MOU-1',
    ]);
    // reorder level is 10: Mouse (3) and SQL guide (8) are low
    expect(skus(await analyst.get('/api/products?lowStock=true'))).toEqual(['BOOK-1', 'MOU-1']);
    expect(skus(await analyst.get('/api/products?lowStock=false&isActive=true'))).toEqual([
      'KEY-1',
      'LAP-1',
    ]);
  });

  it('sorts by price (numerically, not as text) in both directions', async () => {
    expect(skus(await analyst.get('/api/products?sort=price'))).toEqual([
      'OLD-1',
      'MOU-1',
      'BOOK-1',
      'KEY-1',
      'LAP-1',
    ]);
    expect(skus(await analyst.get('/api/products?sort=price&order=desc'))[0]).toBe('LAP-1');
  });

  it('paginates with consistent totals under filters', async () => {
    const res = await analyst.get('/api/products?isActive=true&sort=sku&pageSize=3&page=2');
    expect(skus(res)).toEqual(['MOU-1']);
    expect(res.body.pagination).toEqual({ page: 2, pageSize: 3, total: 4, totalPages: 2 });
  });

  it('returns an empty page past the end', async () => {
    const res = await analyst.get('/api/products?page=10');
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(5);
  });

  it.each([
    'sort=stock_quantity;DROP TABLE products',
    'isActive=yes',
    'minPrice=50&maxPrice=10',
    'categoryId=abc',
    'unknown=1',
  ])('rejects invalid query "%s"', async (qs) => {
    expect((await analyst.get(`/api/products?${qs}`)).status).toBe(400);
  });
});
