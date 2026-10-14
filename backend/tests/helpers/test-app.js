import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getDatabaseConfig } from '../../src/config/database.js';
import { createPool } from '../../src/db/pool.js';

export const TEST_PASSWORD = 'correct-horse-battery-staple';
const TEST_BCRYPT_ROUNDS = 4; // minimum cost: keeps tests fast

const TABLES = [
  'analytics_anomalies',
  'analytics_customers',
  'analytics_inventory_daily',
  'analytics_order_status',
  'analytics_processed_events',
  'analytics_product_daily',
  'analytics_sales_hourly',
  'analytics_stream_batches',
  'pipeline_heartbeats',
  'event_outbox',
  'stock_movements',
  'order_items',
  'orders',
  'customers',
  'products',
  'categories',
  'users',
];

export function buildTestConfig(overrides = {}) {
  return {
    nodeEnv: 'test',
    port: 0,
    db: getDatabaseConfig({ test: true }),
    corsOrigins: ['http://localhost:5173'],
    trustProxy: 0,
    auth: {
      jwtSecret: 'test-secret-that-is-at-least-32-characters-long',
      tokenTtlSeconds: 3600,
      bcryptRounds: TEST_BCRYPT_ROUNDS,
      cookieSecure: false,
    },
    loginRateLimit: { windowMs: 60_000, max: 1000 },
    ...overrides,
  };
}

/** Creates a pool on the test database and the real Express app wired to it. */
export function createTestContext(configOverrides) {
  const config = buildTestConfig(configOverrides);
  const db = createPool(config.db);
  const app = createApp({ db, config });

  return {
    app,
    db,
    config,

    async reset() {
      await db.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    },

    async createUser({
      email = 'admin@example.test',
      role = 'admin',
      fullName = 'Test User',
      isActive = true,
      password = TEST_PASSWORD,
    } = {}) {
      const hash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [email, hash, fullName, role, isActive],
      );
      return { id: Number(rows[0].id), email, role };
    },

    /** Inserts a product directly (bypassing the API and the stock ledger) for test setup. */
    async seedProduct({
      sku = 'SKU-1',
      name = `Product ${sku}`,
      price = '10.00',
      stock = 10,
      isActive = true,
      category = 'General',
    } = {}) {
      const { rows: cat } = await db.query(
        `INSERT INTO categories (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [category],
      );
      const { rows } = await db.query(
        `INSERT INTO products (sku, name, category_id, price, stock_quantity, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [sku, name, cat[0].id, price, stock, isActive],
      );
      return { id: Number(rows[0].id), sku, price, categoryId: Number(cat[0].id) };
    },

    async seedCustomer({
      email = 'jane@example.test',
      firstName = 'Jane',
      lastName = 'Doe',
      country = null,
    } = {}) {
      const { rows } = await db.query(
        `INSERT INTO customers (email, first_name, last_name, country)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [email, firstName, lastName, country],
      );
      return { id: Number(rows[0].id), email };
    },

    async stockOf(productId) {
      const { rows } = await db.query('SELECT stock_quantity FROM products WHERE id = $1', [
        productId,
      ]);
      return rows[0].stock_quantity;
    },

    async outboxEvents(eventType) {
      const { rows } = await db.query(
        `SELECT event_id, event_type, aggregate_type, aggregate_id, payload
         FROM event_outbox WHERE ($1::text IS NULL OR event_type = $1) ORDER BY occurred_at, event_id`,
        [eventType ?? null],
      );
      return rows;
    },

    /** Logs in and returns a supertest agent that keeps the session cookie. */
    async loginAs(email, password = TEST_PASSWORD) {
      const agent = request.agent(app);
      const res = await agent.post('/api/auth/login').send({ email, password });
      if (res.status !== 200) throw new Error(`login failed: ${res.status} ${res.text}`);
      return agent;
    },

    close: () => db.end(),
  };
}
