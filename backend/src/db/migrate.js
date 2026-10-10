import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

/**
 * Applies or reverts schema migrations.
 * @param {object} dbConfig - pg client config (see config/database.js)
 * @param {'up' | 'down'} direction
 * @param {{ count?: number, log?: (msg: string) => void }} [options] - count defaults to all
 *   pending migrations for "up" and one migration for "down".
 */
export async function migrate(dbConfig, direction, { count, log = () => {} } = {}) {
  return runner({
    databaseUrl: dbConfig,
    dir: MIGRATIONS_DIR,
    direction,
    count: count ?? (direction === 'up' ? Infinity : 1),
    migrationsTable: 'pgmigrations',
    singleTransaction: true,
    checkOrder: true,
    log,
  });
}
