// Loads the repo-root .env for local runs. In CI the variables come from the environment
// instead, and process.loadEnvFile never overrides variables that are already set.
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(import.meta.dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
