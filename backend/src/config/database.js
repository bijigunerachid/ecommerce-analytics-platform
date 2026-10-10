// Builds the PostgreSQL connection config from environment variables.
// The same POSTGRES_* variables configure the Docker container, so there is a single source of truth.

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  }
  return value;
}

/**
 * @param {{ test?: boolean }} [options] - when test is true, connect to POSTGRES_TEST_DB.
 */
export function getDatabaseConfig({ test = false } = {}) {
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
    database: test ? process.env.POSTGRES_TEST_DB || 'ecommerce_test' : required('POSTGRES_DB'),
  };
}
