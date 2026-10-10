import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDatabaseConfig } from '../../src/config/database.js';
import { migrate } from '../../src/db/migrate.js';

const PG_CHECK_VIOLATION = '23514';
const PG_UNIQUE_VIOLATION = '23505';
const PG_FK_VIOLATION = '23503';

const dbConfig = getDatabaseConfig({ test: true });
const client = new pg.Client(dbConfig);

const CORE_TABLES = [
  'categories',
  'customers',
  'event_outbox',
  'order_items',
  'orders',
  'products',
  'stock_movements',
  'users',
];

async function listTables() {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name <> 'pgmigrations'
     ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

async function expectPgError(promise, code, constraint) {
  const err = await promise.then(
    () => null,
    (e) => e,
  );
  expect(err, `expected Postgres error ${code}`).not.toBeNull();
  expect(err.code).toBe(code);
  if (constraint) expect(err.constraint).toBe(constraint);
}

async function insertCategory(name = 'Electronics') {
  const { rows } = await client.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [
    name,
  ]);
  return rows[0].id;
}

async function insertProduct({ sku = 'SKU-1', price = '10.00', stock = 5 } = {}) {
  const categoryId = await insertCategory(`cat-${sku}`);
  const { rows } = await client.query(
    `INSERT INTO products (sku, name, category_id, price, stock_quantity)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [sku, `Product ${sku}`, categoryId, price, stock],
  );
  return rows[0].id;
}

async function insertCustomer(email = 'jane.doe@example.test') {
  const { rows } = await client.query(
    `INSERT INTO customers (email, first_name, last_name) VALUES ($1, 'Jane', 'Doe') RETURNING id`,
    [email],
  );
  return rows[0].id;
}

async function insertOrder(customerId, key = 'order-key-1') {
  const { rows } = await client.query(
    `INSERT INTO orders (customer_id, total_amount, idempotency_key)
     VALUES ($1, 0, $2) RETURNING id`,
    [customerId, key],
  );
  return rows[0].id;
}

beforeAll(async () => {
  // Start every run from an empty schema so results do not depend on earlier runs.
  await migrate(dbConfig, 'down', { count: Infinity });
  await migrate(dbConfig, 'up');
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  await client.query(`TRUNCATE ${CORE_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
});

describe('migrations', () => {
  it('creates all core tables', async () => {
    expect(await listTables()).toEqual(CORE_TABLES);
  });

  it('reverts cleanly and re-applies', async () => {
    await migrate(dbConfig, 'down', { count: Infinity });
    expect(await listTables()).toEqual([]);

    const applied = await migrate(dbConfig, 'up');
    expect(applied.length).toBeGreaterThan(0);
    expect(await listTables()).toEqual(CORE_TABLES);
  });

  it('is a no-op when already up to date', async () => {
    expect(await migrate(dbConfig, 'up')).toEqual([]);
  });
});

describe('users', () => {
  const insertUser = (email, role) =>
    client.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'hash', 'Test', $2)`,
      [email, role],
    );

  it('accepts admin and analyst roles', async () => {
    await insertUser('admin@example.test', 'admin');
    await insertUser('analyst@example.test', 'analyst');
  });

  it('rejects unknown roles', async () => {
    await expectPgError(
      insertUser('x@example.test', 'superuser'),
      PG_CHECK_VIOLATION,
      'users_role_valid',
    );
  });

  it('requires lowercase, unique emails', async () => {
    await expectPgError(
      insertUser('Admin@Example.test', 'admin'),
      PG_CHECK_VIOLATION,
      'users_email_lowercase',
    );
    await insertUser('admin@example.test', 'admin');
    await expectPgError(
      insertUser('admin@example.test', 'analyst'),
      PG_UNIQUE_VIOLATION,
      'users_email_unique',
    );
  });

  it('updates updated_at automatically', async () => {
    await insertUser('admin@example.test', 'admin');
    await client.query(
      `UPDATE users SET created_at = now() - interval '1 day', updated_at = now() - interval '1 day'`,
    );
    const { rows } = await client.query(
      `UPDATE users SET full_name = 'Renamed' RETURNING created_at, updated_at`,
    );
    expect(rows[0].updated_at.getTime()).toBeGreaterThan(rows[0].created_at.getTime());
  });
});

describe('products', () => {
  it('rejects negative stock (prevents overselling at the database level)', async () => {
    const productId = await insertProduct({ stock: 2 });
    await expectPgError(
      client.query('UPDATE products SET stock_quantity = stock_quantity - 3 WHERE id = $1', [
        productId,
      ]),
      PG_CHECK_VIOLATION,
      'products_stock_nonnegative',
    );
  });

  it('rejects negative prices and duplicate SKUs', async () => {
    await expectPgError(
      insertProduct({ sku: 'NEG', price: '-1.00' }),
      PG_CHECK_VIOLATION,
      'products_price_nonnegative',
    );
    await insertProduct({ sku: 'DUP' });
    const categoryId = await insertCategory('Other');
    await expectPgError(
      client.query(
        `INSERT INTO products (sku, name, category_id, price) VALUES ('DUP', 'x', $1, 1)`,
        [categoryId],
      ),
      PG_UNIQUE_VIOLATION,
      'products_sku_unique',
    );
  });

  it('prevents deleting a category that still has products', async () => {
    await insertProduct();
    await expectPgError(client.query('DELETE FROM categories'), PG_FK_VIOLATION);
  });
});

describe('orders and order items', () => {
  it('rejects an unknown order status', async () => {
    const customerId = await insertCustomer();
    const orderId = await insertOrder(customerId);
    await expectPgError(
      client.query(`UPDATE orders SET status = 'lost' WHERE id = $1`, [orderId]),
      PG_CHECK_VIOLATION,
      'orders_status_valid',
    );
  });

  it('rejects a duplicate idempotency key (retried order request)', async () => {
    const customerId = await insertCustomer();
    await insertOrder(customerId, 'retry-key');
    await expectPgError(
      insertOrder(customerId, 'retry-key'),
      PG_UNIQUE_VIOLATION,
      'orders_idempotency_key_unique',
    );
  });

  it('requires line_total = quantity * unit_price', async () => {
    const productId = await insertProduct({ price: '19.99' });
    const orderId = await insertOrder(await insertCustomer());
    const insertItem = (lineTotal) =>
      client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
         VALUES ($1, $2, 3, 19.99, $3)`,
        [orderId, productId, lineTotal],
      );

    await expectPgError(insertItem('50.00'), PG_CHECK_VIOLATION, 'order_items_line_total_matches');
    await insertItem('59.97');
  });

  it('rejects non-positive quantities', async () => {
    const productId = await insertProduct();
    const orderId = await insertOrder(await insertCustomer());
    await expectPgError(
      client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
         VALUES ($1, $2, 0, 10, 0)`,
        [orderId, productId],
      ),
      PG_CHECK_VIOLATION,
      'order_items_quantity_positive',
    );
  });

  it('deletes order items together with their order', async () => {
    const productId = await insertProduct();
    const orderId = await insertOrder(await insertCustomer());
    await client.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
       VALUES ($1, $2, 1, 10, 10)`,
      [orderId, productId],
    );
    await client.query('DELETE FROM orders WHERE id = $1', [orderId]);
    const { rows } = await client.query('SELECT count(*)::int AS n FROM order_items');
    expect(rows[0].n).toBe(0);
  });
});

describe('stock movements', () => {
  const insertMovement = (productId, key, change = 5, reason = 'restock') =>
    client.query(
      `INSERT INTO stock_movements (product_id, quantity_change, reason, idempotency_key)
       VALUES ($1, $2, $3, $4)`,
      [productId, change, reason, key],
    );

  it('rejects applying the same stock change twice', async () => {
    const productId = await insertProduct();
    await insertMovement(productId, 'restock-1');
    await expectPgError(
      insertMovement(productId, 'restock-1'),
      PG_UNIQUE_VIOLATION,
      'stock_movements_idempotency_key_unique',
    );
  });

  it('rejects zero changes and unknown reasons', async () => {
    const productId = await insertProduct();
    await expectPgError(
      insertMovement(productId, 'a', 0),
      PG_CHECK_VIOLATION,
      'stock_movements_change_nonzero',
    );
    await expectPgError(
      insertMovement(productId, 'b', 1, 'theft'),
      PG_CHECK_VIOLATION,
      'stock_movements_reason_valid',
    );
  });
});

describe('event outbox', () => {
  it('assigns a UUID event_id and starts unpublished', async () => {
    const { rows } = await client.query(
      `INSERT INTO event_outbox (event_type, aggregate_type, aggregate_id, payload)
       VALUES ('order.created', 'order', '1', '{"total": "10.00"}') RETURNING *`,
    );
    expect(rows[0].event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0].published_at).toBeNull();
    expect(rows[0].attempts).toBe(0);
  });
});
