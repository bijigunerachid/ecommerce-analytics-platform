// Runs once before all test files: brings the test database schema up to date.
import fs from 'node:fs';
import path from 'node:path';
import { getDatabaseConfig } from '../../src/config/database.js';
import { migrate } from '../../src/db/migrate.js';

export default async function globalSetup() {
  const envPath = path.resolve(import.meta.dirname, '../../../.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

  await migrate(getDatabaseConfig({ test: true }), 'up');
}
