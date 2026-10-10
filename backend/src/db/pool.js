import pg from 'pg';

export function createPool(dbConfig) {
  const pool = new pg.Pool({ ...dbConfig, max: 10, idleTimeoutMillis: 30000 });
  // An idle client losing its connection must not crash the process.
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
  });
  return pool;
}
