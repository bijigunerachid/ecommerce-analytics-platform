import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let admin;
let analyst;
beforeEach(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'admin@example.test', role: 'admin' });
  await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
  admin = await ctx.loginAs('admin@example.test');
  analyst = await ctx.loginAs('analyst@example.test');
});

async function createCategory(name, description) {
  const res = await admin.post('/api/categories').send({ name, description });
  expect(res.status).toBe(201);
  return res.body.category;
}

describe('access control', () => {
  it('requires a session for every route', async () => {
    const anon = request(ctx.app);
    expect((await anon.get('/api/categories')).status).toBe(401);
    expect((await anon.get('/api/categories/1')).status).toBe(401);
    expect((await anon.post('/api/categories').send({ name: 'X' })).status).toBe(401);
  });

  it('lets analysts read but not write', async () => {
    const category = await createCategory('Books');

    expect((await analyst.get('/api/categories')).status).toBe(200);
    expect((await analyst.get(`/api/categories/${category.id}`)).status).toBe(200);
    expect((await analyst.post('/api/categories').send({ name: 'Toys' })).status).toBe(403);
    expect((await analyst.patch(`/api/categories/${category.id}`).send({ name: 'Y' })).status).toBe(
      403,
    );
    expect((await analyst.delete(`/api/categories/${category.id}`)).status).toBe(403);
  });
});

describe('create / read / update / delete', () => {
  it('creates, fetches, updates, and deletes a category', async () => {
    const created = await createCategory('  Books  ', 'Printed matter');
    expect(created).toMatchObject({
      name: 'Books',
      description: 'Printed matter',
      productCount: 0,
    });

    const fetched = await analyst.get(`/api/categories/${created.id}`);
    expect(fetched.body.category).toMatchObject({ id: created.id, name: 'Books' });

    const updated = await admin.patch(`/api/categories/${created.id}`).send({ description: '' }); // empty string clears the description
    expect(updated.status).toBe(200);
    expect(updated.body.category).toMatchObject({ name: 'Books', description: null });

    expect((await admin.delete(`/api/categories/${created.id}`)).status).toBe(204);
    expect((await admin.get(`/api/categories/${created.id}`)).status).toBe(404);
  });

  it('returns 409 for duplicate names (on create and rename)', async () => {
    await createCategory('Books');
    const other = await createCategory('Games');

    expect((await admin.post('/api/categories').send({ name: 'Books' })).status).toBe(409);
    const rename = await admin.patch(`/api/categories/${other.id}`).send({ name: 'Books' });
    expect(rename.status).toBe(409);
    expect(rename.body.error.code).toBe('CONFLICT');
  });

  it('returns 409 when deleting a category that still has products', async () => {
    const category = await createCategory('Books');
    await admin
      .post('/api/products')
      .send({ sku: 'BK-1', name: 'Novel', categoryId: category.id, price: '9.99' });

    const res = await admin.delete(`/api/categories/${category.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/still has products/);
  });

  it('returns 404 for unknown ids and 400 for invalid ids', async () => {
    expect((await admin.get('/api/categories/999')).status).toBe(404);
    expect((await admin.patch('/api/categories/999').send({ name: 'X' })).status).toBe(404);
    expect((await admin.delete('/api/categories/999')).status).toBe(404);
    expect((await admin.get('/api/categories/abc')).status).toBe(400);
    expect((await admin.get('/api/categories/-1')).status).toBe(400);
  });

  it('validates input', async () => {
    expect((await admin.post('/api/categories').send({ name: '   ' })).status).toBe(400);
    expect((await admin.post('/api/categories').send({ name: 'A', extra: 1 })).status).toBe(400);
    const empty = await admin.patch('/api/categories/1').send({});
    expect(empty.status).toBe(400);
  });
});

describe('listing', () => {
  beforeEach(async () => {
    for (const name of ['Books', 'Electronics', 'Garden', 'Games', 'Toys']) {
      await createCategory(name);
    }
  });

  it('paginates and reports totals', async () => {
    const res = await analyst.get('/api/categories?page=2&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c.name)).toEqual(['Games', 'Garden']);
    expect(res.body.pagination).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
  });

  it('searches by name, case-insensitively', async () => {
    const res = await analyst.get('/api/categories?search=GA');
    expect(res.body.data.map((c) => c.name)).toEqual(['Games', 'Garden']);
  });

  it('sorts by product count', async () => {
    const toys = (await analyst.get('/api/categories?search=Toys')).body.data[0];
    await admin
      .post('/api/products')
      .send({ sku: 'TOY-1', name: 'Ball', categoryId: toys.id, price: 1 });

    const res = await analyst.get('/api/categories?sort=productCount&order=desc&pageSize=1');
    expect(res.body.data[0]).toMatchObject({ name: 'Toys', productCount: 1 });
  });

  it('rejects unknown sort fields and out-of-range page sizes', async () => {
    expect((await analyst.get('/api/categories?sort=password_hash')).status).toBe(400);
    expect((await analyst.get('/api/categories?pageSize=1000')).status).toBe(400);
    expect((await analyst.get('/api/categories?page=0')).status).toBe(400);
  });
});
