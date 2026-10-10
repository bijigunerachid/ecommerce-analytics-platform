import { randomUUID } from 'node:crypto';
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

const alice = {
  email: 'Alice.Martin@Example.test',
  firstName: ' Alice ',
  lastName: 'Martin',
  phone: '+33 1 23 45 67 89',
  city: 'Lyon',
  country: 'France',
};

async function createCustomer(body) {
  const res = await admin.post('/api/customers').send(body);
  expect(res.status, res.text).toBe(201);
  return res.body.customer;
}

describe('customers CRUD', () => {
  it('creates a customer with normalized fields and zeroed purchase stats', async () => {
    const customer = await createCustomer(alice);
    expect(customer).toMatchObject({
      email: 'alice.martin@example.test',
      firstName: 'Alice',
      lastName: 'Martin',
      phone: '+33 1 23 45 67 89',
      orderCount: 0,
      totalSpent: '0.00',
      lastOrderAt: null,
    });
  });

  it('updates fields and clears optional ones with an empty string', async () => {
    const customer = await createCustomer(alice);
    const res = await admin
      .patch(`/api/customers/${customer.id}`)
      .send({ city: 'Paris', phone: '' });
    expect(res.status).toBe(200);
    expect(res.body.customer).toMatchObject({ city: 'Paris', phone: null, lastName: 'Martin' });
  });

  it('returns 409 for duplicate emails, regardless of case', async () => {
    await createCustomer(alice);
    const res = await admin
      .post('/api/customers')
      .send({ ...alice, email: 'ALICE.MARTIN@example.test' });
    expect(res.status).toBe(409);
  });

  it('deletes a customer without orders but not one with orders', async () => {
    const quiet = await createCustomer({ email: 'q@example.test', firstName: 'Q', lastName: 'Q' });
    expect((await admin.delete(`/api/customers/${quiet.id}`)).status).toBe(204);

    const buyer = await createCustomer(alice);
    const product = await ctx.seedProduct();
    await admin
      .post('/api/orders')
      .set('Idempotency-Key', randomUUID())
      .send({ customerId: buyer.id, items: [{ productId: product.id, quantity: 1 }] });
    const res = await admin.delete(`/api/customers/${buyer.id}`);
    expect(res.status).toBe(409);
  });

  it.each([
    ['an invalid email', { email: 'nope' }, 'email'],
    ['a missing last name', { lastName: '' }, 'lastName'],
    ['letters in the phone number', { phone: 'call me' }, 'phone'],
  ])('rejects %s', async (_label, patch, field) => {
    const res = await admin.post('/api/customers').send({ ...alice, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toContain(field);
  });

  it('lets analysts read but not write', async () => {
    const customer = await createCustomer(alice);
    expect((await analyst.get(`/api/customers/${customer.id}`)).status).toBe(200);
    expect((await analyst.post('/api/customers').send(alice)).status).toBe(403);
    expect((await request(ctx.app).get('/api/customers')).status).toBe(401);
  });
});

describe('customer list and purchase statistics', () => {
  beforeEach(async () => {
    const product = await ctx.seedProduct({ price: '25.00', stock: 100 });
    const a = await createCustomer(alice);
    const b = await createCustomer({
      email: 'bruno@example.test',
      firstName: 'Bruno',
      lastName: 'Diaz',
      country: 'Spain',
    });
    await createCustomer({ email: 'carla@example.test', firstName: 'Carla', lastName: 'Zane' });

    const order = (customerId, quantity) =>
      admin
        .post('/api/orders')
        .set('Idempotency-Key', randomUUID())
        .send({ customerId, items: [{ productId: product.id, quantity }] });

    await order(a.id, 1); // 25.00
    await order(a.id, 2); // 50.00
    const cancelled = await order(b.id, 10); // 250.00, then cancelled
    await admin
      .patch(`/api/orders/${cancelled.body.order.id}/status`)
      .send({ status: 'cancelled' });
    await order(b.id, 1); // 25.00
  });

  const emails = (res) => res.body.data.map((c) => c.email);

  it('reports order count and total spent, excluding cancelled orders', async () => {
    const res = await analyst.get('/api/customers?sort=totalSpent&order=desc');
    expect(res.body.data.map((c) => [c.firstName, c.orderCount, c.totalSpent])).toEqual([
      ['Alice', 2, '75.00'],
      ['Bruno', 1, '25.00'],
      ['Carla', 0, '0.00'],
    ]);
    expect(res.body.data[0].lastOrderAt).not.toBeNull();
  });

  it('sorts by last name by default and searches name and email', async () => {
    expect(emails(await analyst.get('/api/customers'))).toEqual([
      'bruno@example.test',
      'alice.martin@example.test',
      'carla@example.test',
    ]);
    expect(emails(await analyst.get('/api/customers?search=alice martin'))).toEqual([
      'alice.martin@example.test',
    ]);
    expect(emails(await analyst.get('/api/customers?search=BRUNO@'))).toEqual([
      'bruno@example.test',
    ]);
  });

  it('filters by country case-insensitively', async () => {
    expect(emails(await analyst.get('/api/customers?country=spain'))).toEqual([
      'bruno@example.test',
    ]);
  });
});
