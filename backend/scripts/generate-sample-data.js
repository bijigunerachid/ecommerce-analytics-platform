// Generates a synthetic order history (see src/sample-data/generator.js).
//
// Usage (from backend/):
//   npm run generate-data                    90 days, ~60 orders/day, seed 42, dev database
//   node --env-file=../.env scripts/generate-sample-data.js --days 30 --orders-per-day 40 --seed 7
//   ... --test                               target the test database instead
//
// The database must be empty (no products). Afterwards, run the outbox relay and the Spark
// streaming job to turn the generated events into dashboard analytics.
import { parseArgs } from 'node:util';
import { getDatabaseConfig } from '../src/config/database.js';
import { createPool } from '../src/db/pool.js';
import { generateSampleData } from '../src/sample-data/generator.js';

function positiveInt(name, value, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new Error(`--${name} must be an integer between 1 and ${max}`);
  }
  return n;
}

async function main() {
  const { values } = parseArgs({
    options: {
      days: { type: 'string', default: '90' },
      'orders-per-day': { type: 'string', default: '60' },
      seed: { type: 'string', default: '42' },
      test: { type: 'boolean', default: false },
    },
  });
  const options = {
    days: positiveInt('days', values.days, 366),
    ordersPerDay: positiveInt('orders-per-day', values['orders-per-day'], 1000),
    seed: positiveInt('seed', values.seed, 2 ** 31),
  };

  const config = getDatabaseConfig({ test: values.test });
  console.log(
    `Generating ${options.days} days of synthetic data (~${options.ordersPerDay} orders/day, ` +
      `seed ${options.seed}) into database "${config.database}"...`,
  );
  const pool = createPool(config);
  const started = Date.now();
  try {
    const summary = await generateSampleData(pool, { ...options, log: console.log });
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s:`);
    console.table(summary);
    console.log(
      'Next: run "npm run relay" and "docker compose up -d spark-streaming" to process the events.',
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
