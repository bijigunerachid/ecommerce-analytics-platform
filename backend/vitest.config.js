import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/load-env.js'],
    globalSetup: ['./tests/setup/global-setup.js'],
    // Integration tests share one test database, so files must not run concurrently.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
