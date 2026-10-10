// CLI: node scripts/migrate.js <up|down> [count|all] [--test]
//   up            apply all pending migrations
//   down          revert the most recent migration
//   down all      revert every migration
//   --test        target the test database (POSTGRES_TEST_DB)
import { getDatabaseConfig } from '../src/config/database.js';
import { migrate } from '../src/db/migrate.js';

const args = process.argv.slice(2);
const test = args.includes('--test');
const [direction, countArg] = args.filter((a) => a !== '--test');

if (direction !== 'up' && direction !== 'down') {
  console.error('Usage: node scripts/migrate.js <up|down> [count|all] [--test]');
  process.exit(1);
}

let count;
if (countArg === 'all') count = Infinity;
else if (countArg !== undefined) {
  count = Number.parseInt(countArg, 10);
  if (!Number.isInteger(count) || count < 1) {
    console.error(`Invalid count "${countArg}"`);
    process.exit(1);
  }
}

try {
  const config = getDatabaseConfig({ test });
  console.log(`Migrating ${direction} on database "${config.database}"...`);
  const applied = await migrate(config, direction, { count, log: console.log });
  console.log(
    applied.length
      ? `Done: ${applied.map((m) => m.name).join(', ')}`
      : 'Nothing to migrate; schema is up to date.',
  );
} catch (err) {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
}
