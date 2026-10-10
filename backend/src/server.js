import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createPool } from './db/pool.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`Configuration error: ${err.message}`);
  process.exit(1);
}

const db = createPool(config.db);
const app = createApp({ db, config });

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}/api (${config.nodeEnv})`);
});

// Graceful shutdown: stop accepting connections, finish in-flight requests, close the pool.
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
