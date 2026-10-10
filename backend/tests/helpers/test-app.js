import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getDatabaseConfig } from '../../src/config/database.js';
import { createPool } from '../../src/db/pool.js';

export const TEST_PASSWORD = 'correct-horse-battery-staple';
const TEST_BCRYPT_ROUNDS = 4; // minimum cost: keeps tests fast

const TABLES = [
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
